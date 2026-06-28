import { useState, useEffect, useRef, useMemo } from 'react'
import type { Activity } from '../types'
import { idbGet, idbSet, idbGetAll } from '../lib/idb'

export interface CityInfo {
  name: string
  count: number
  lat: number
  lng: number
}

const GEOCODE_TTL = 60 * 60 * 24 * 30 // 30 days
const BOUNDARY_TTL = 60 * 60 * 24 * 30

function roundKey(lat: number, lng: number): string {
  return `${Number(lat.toFixed(1))},${Number(lng.toFixed(1))}`
}

// Promise queue: enforce 1.1s between Nominatim requests (ToS)
let geocodeQueue: Promise<void> = Promise.resolve()
function geocodeThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const result = geocodeQueue.then(async () => {
    await new Promise<void>(r => setTimeout(r, 1100))
    return fn()
  })
  geocodeQueue = result.then(() => {}, () => {})
  return result
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&accept-language=en`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 429) {
        await new Promise<void>(r => setTimeout(r, (attempt + 1) * 5000))
        continue
      }
      if (!res.ok) return null
      const data = await res.json() as { address?: Record<string, string> }
      const addr = data.address
      if (!addr) return null
      const place = addr.city || addr.town || addr.village || addr.county || addr.state || null
      if (!place) return null
      const cc = addr.country_code?.toUpperCase() ?? null
      return cc ? `${place}, ${cc}` : place
    } catch {
      return null
    }
  }
  return null
}

async function fetchCityBoundary(
  cityName: string,
  countryCode: string,
): Promise<GeoJSON.Feature | null> {
  const cacheKey = `${cityName},${countryCode}`
  const cached = await idbGet<GeoJSON.Feature | null>('boundary', cacheKey)
  if (cached !== undefined && cached !== null) return cached

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const q = encodeURIComponent(cityName)
      const cc = countryCode.toLowerCase()
      const url = `https://nominatim.openstreetmap.org/search?q=${q}&countrycodes=${cc}&format=json&polygon_geojson=1&limit=1&featuretype=city`
      const res = await fetch(url)
      if (res.status === 429) {
        await new Promise<void>(r => setTimeout(r, (attempt + 1) * 5000))
        continue
      }
      if (!res.ok) return null
      const data = await res.json() as Array<{ geojson?: GeoJSON.Geometry }>
      if (!data[0]?.geojson) {
        await idbSet('boundary', cacheKey, null, BOUNDARY_TTL)
        return null
      }
      const feature: GeoJSON.Feature = {
        type: 'Feature',
        properties: { name: cityName, country: countryCode },
        geometry: data[0].geojson,
      }
      await idbSet('boundary', cacheKey, feature, BOUNDARY_TTL)
      return feature
    } catch {
      return null
    }
  }
  return null
}

export function useGeocodeCache(activities: Activity[]) {
  const [cache, setCache] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState(false)
  const batchedRef = useRef(new Set<string>())
  const cacheRef = useRef(cache)
  cacheRef.current = cache

  // Load all cached geocodes from IDB on mount
  useEffect(() => {
    idbGetAll<string>('geocode')
      .then(all => { setCache(all); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])

  // Batch geocode uncached start coords (throttled)
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
      for (const { lat, lng } of toFetch) {
        if (cancelled) return
        const key = roundKey(lat, lng)
        const name = await geocodeThrottle(() => reverseGeocode(lat, lng))
        if (name && !cancelled) {
          await idbSet('geocode', key, name, GEOCODE_TTL)
          setCache(prev => ({ ...prev, [key]: name }))
        }
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
  const [boundaries, setBoundaries] = useState<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  })
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
    ;(async () => {
      for (const { city, country } of toFetch) {
        if (cancelled) return
        const feature = await geocodeThrottle(() => fetchCityBoundary(city, country))
        if (feature && !cancelled) {
          setBoundaries(prev => ({
            type: 'FeatureCollection',
            features: [...prev.features, feature],
          }))
        }
      }
    })()

    return () => { cancelled = true }
  }, [cities])

  return { cache, cities, boundaries, loaded }
}
