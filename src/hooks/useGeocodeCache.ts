import { useState, useEffect, useRef, useMemo } from 'react'
import type { Activity } from '../types'

export interface CityInfo {
  name: string
  count: number
  lat: number
  lng: number
}

function roundKey(lat: number, lng: number): string {
  return `${Number(lat.toFixed(1))},${Number(lng.toFixed(1))}`
}

export function useGeocodeCache(activities: Activity[]) {
  const [cache, setCache] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const batchedRef = useRef(new Set<string>())
  const cacheRef = useRef(cache)
  cacheRef.current = cache

  // Fetch cached geocodes on mount
  useEffect(() => {
    fetch('/api/geocode/cached')
      .then(res => res.ok ? res.json() : { results: {} })
      .then(data => {
        setCache(data.results ?? {})
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  // Batch geocode uncached coords after initial cache is loaded
  useEffect(() => {
    if (!loaded || activities.length === 0) return

    const toFetch: { lat: number; lng: number }[] = []
    const seen = new Set<string>()
    for (const a of activities) {
      if (!a.start_latlng) continue
      const key = roundKey(a.start_latlng[0], a.start_latlng[1])
      if (cacheRef.current[key] || batchedRef.current.has(key) || seen.has(key)) continue
      seen.add(key)
      batchedRef.current.add(key)
      toFetch.push({ lat: a.start_latlng[0], lng: a.start_latlng[1] })
    }

    if (toFetch.length === 0) return

    let cancelled = false
    ;(async () => {
      for (let i = 0; i < toFetch.length; i += 20) {
        if (cancelled) return
        const chunk = toFetch.slice(i, i + 20)
        try {
          const res = await fetch('/api/geocode/reverse-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ coords: chunk }),
          })
          if (!res.ok) continue
          const data = await res.json()
          const results = data.results ?? {}
          if (Object.keys(results).length > 0 && !cancelled) {
            setCache(prev => ({ ...prev, ...results }))
          }
        } catch { /* ignore */ }
      }
    })()

    return () => { cancelled = true }
  }, [loaded, activities]) // eslint-disable-line react-hooks/exhaustive-deps

  const cities = useMemo((): CityInfo[] => {
    if (Object.keys(cache).length === 0) return []

    const map = new Map<string, { count: number; lats: number[]; lngs: number[] }>()
    for (const a of activities) {
      if (!a.start_latlng) continue
      const key = roundKey(a.start_latlng[0], a.start_latlng[1])
      const city = cache[key]
      if (!city) continue
      const existing = map.get(city)
      if (existing) {
        existing.count++
        existing.lats.push(a.start_latlng[0])
        existing.lngs.push(a.start_latlng[1])
      } else {
        map.set(city, { count: 1, lats: [a.start_latlng[0]], lngs: [a.start_latlng[1]] })
      }
    }

    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        lat: data.lats.reduce((s, v) => s + v, 0) / data.lats.length,
        lng: data.lngs.reduce((s, v) => s + v, 0) / data.lngs.length,
      }))
      .sort((a, b) => b.count - a.count)
  }, [activities, cache])

  // Fetch city boundary polygons once cities are known
  const [boundaries, setBoundaries] = useState<GeoJSON.FeatureCollection>({ type: 'FeatureCollection', features: [] })
  const boundariesFetchedRef = useRef(new Set<string>())

  useEffect(() => {
    if (cities.length === 0) return

    const toFetch: { city: string; country: string }[] = []
    for (const c of cities) {
      if (boundariesFetchedRef.current.has(c.name)) continue
      const idx = c.name.lastIndexOf(', ')
      if (idx < 0) continue
      boundariesFetchedRef.current.add(c.name)
      toFetch.push({ city: c.name.slice(0, idx), country: c.name.slice(idx + 2) })
    }

    if (toFetch.length === 0) return

    let cancelled = false
    fetch('/api/geocode/boundaries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cities: toFetch }),
    })
      .then(r => r.ok ? r.json() : { features: [] })
      .then(data => {
        if (!cancelled && data.features?.length > 0) {
          setBoundaries(prev => ({
            type: 'FeatureCollection',
            features: [...prev.features, ...data.features],
          }))
        }
      })
      .catch(() => {})

    return () => { cancelled = true }
  }, [cities])

  return { cache, cities, boundaries, loaded }
}
