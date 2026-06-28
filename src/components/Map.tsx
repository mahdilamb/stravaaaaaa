import { useEffect, useCallback, useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { MapContainer, TileLayer, GeoJSON, Polyline, CircleMarker, Pane, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { LatLngExpression } from 'leaflet'
import type { Activity, ActivityCategory, ActivityFilterType } from '../types'
import type { AnimationMode } from '../hooks/useTimeline'
import type { MapLayer } from '../utils/hash'
import { getActivityColor } from '../utils/colors'
import { useColorScheme } from '../contexts/ColorSchemeContext'

export type BorderMode = 'dark' | 'light'

const LAYERS: { key: MapLayer; label: string; url: string; attribution: string; maxZoom?: number; subdomains?: string }[] = [
  {
    key: 'streets',
    label: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    subdomains: 'abc',
  },
  {
    key: 'satellite',
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  {
    key: 'toner',
    label: 'Land/Water',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
    subdomains: 'abcd',
  },
  {
    key: 'grey',
    label: 'Grey',
    url: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 20,
    subdomains: 'abcd',
  },
  {
    key: 'borders',
    label: 'Borders',
    url: '',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/">CARTO</a>',
  },
  {
    key: 'heatmap',
    label: 'Strava Heatmap',
    url: 'https://heatmap-external-{s}.strava.com/tiles/{type}/hot/{z}/{x}/{y}.png?px=256',
    attribution: '&copy; <a href="https://www.strava.com">Strava</a>',
    maxZoom: 12,
    subdomains: 'abc',
  },
  {
    key: 'none',
    label: 'None',
    url: '',
    attribution: '',
  },
]

// Map app activity categories to Strava heatmap types
function getHeatmapType(activityType: ActivityFilterType): string {
  switch (activityType) {
    case 'ride': case 'allride': return 'ride'
    case 'run': case 'trail': case 'walk': case 'allrun': return 'run'
    case 'swim': case 'water': return 'water'
    case 'winter': return 'winter'
    default: return 'all'
  }
}

interface BBox {
  minLat: number; maxLat: number; minLng: number; maxLng: number
}

export interface CityCluster {
  clusterOf: number[]
  clusterBounds: BBox[]
  clusterCity: (string | null)[]
}

function activityBBox(a: Activity): BBox | null {
  if (a.coordinates.length === 0) return null
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const [lat, lng] of a.coordinates) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }
  return { minLat, maxLat, minLng, maxLng }
}

function mergeBBox(a: BBox, b: BBox): BBox {
  return {
    minLat: Math.min(a.minLat, b.minLat),
    maxLat: Math.max(a.maxLat, b.maxLat),
    minLng: Math.min(a.minLng, b.minLng),
    maxLng: Math.max(a.maxLng, b.maxLng),
  }
}

/** Clustering key: city name if geocoded, else rounded coords */
function getCityKey(a: Activity, cache: Record<string, string>): string {
  if (!a.start_latlng) return `__noloc_${a.id}`
  const key = `${Number(a.start_latlng[0].toFixed(1))},${Number(a.start_latlng[1].toFixed(1))}`
  return cache[key] ?? key
}

function getCityName(a: Activity, cache: Record<string, string>): string | null {
  if (!a.start_latlng) return null
  const key = `${Number(a.start_latlng[0].toFixed(1))},${Number(a.start_latlng[1].toFixed(1))}`
  return cache[key] ?? null
}

/** Cluster activities sequentially by geocoded city name.
 *  Consecutive activities in the same city form one cluster. */
export function clusterByCity(activities: Activity[], geocodeCache: Record<string, string>): CityCluster {
  if (activities.length === 0) return { clusterOf: [], clusterBounds: [], clusterCity: [] }

  const clusterOf: number[] = []
  const clusterBounds: BBox[] = []
  const clusterCity: (string | null)[] = []

  let curIdx = -1
  let curBBox: BBox | null = null
  let curKey: string | null = null

  for (let i = 0; i < activities.length; i++) {
    const a = activities[i]
    const key = getCityKey(a, geocodeCache)
    const bbox = activityBBox(a)

    if (curIdx >= 0 && key === curKey) {
      clusterOf.push(curIdx)
      if (bbox && curBBox) curBBox = mergeBBox(curBBox, bbox)
      else if (bbox) curBBox = { ...bbox }
    } else {
      curIdx = clusterBounds.length
      curKey = key
      curBBox = bbox ? { ...bbox } : null
      clusterBounds.push(curBBox ?? { minLat: 0, maxLat: 0, minLng: 0, maxLng: 0 })
      clusterCity.push(getCityName(a, geocodeCache))
      clusterOf.push(curIdx)
    }
    if (curBBox) clusterBounds[curIdx] = curBBox
  }

  return { clusterOf, clusterBounds, clusterCity }
}

/** Convert lat/lng to tile coordinates at a given zoom */
function latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom
  const x = Math.floor(((lng + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  return { x, y }
}

/** Get all tile URLs covering a bounds at a given zoom level */
function getTileUrls(bounds: L.LatLngBounds, zoom: number, urlTemplate: string): string[] {
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  const min = latLngToTile(ne.lat, sw.lng, zoom)
  const max = latLngToTile(sw.lat, ne.lng, zoom)
  const subdomains = ['a', 'b', 'c']
  const urls: string[] = []
  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y; y <= max.y; y++) {
      const s = subdomains[(x + y) % subdomains.length]
      urls.push(
        urlTemplate
          .replace('{s}', s)
          .replace('{z}', String(zoom))
          .replace('{x}', String(x))
          .replace('{y}', String(y))
          .replace('{r}', '')
      )
    }
  }
  return urls
}

/** Pre-fetch tile images so the browser caches them */
function prefetchTiles(urls: string[]) {
  for (const url of urls) {
    const img = new Image()
    img.src = url
  }
}

interface MapViewProps {
  activities: Activity[]
  allActivities: Activity[]
  isAnimating: boolean
  mode: AnimationMode
  tileUrl: string
  clusters: CityCluster
  flyTarget?: { lat: number; lng: number; ts: number; bounds?: [[number, number], [number, number]] } | null
  onViewChange: (lat: number, lng: number, zoom: number) => void
  onFlyStart?: () => void
  onFlyEnd?: () => void
  onPause?: () => void
  initialView?: { lat: number; lng: number; zoom: number }
}

function MapViewUpdater({ activities, allActivities, isAnimating, mode, tileUrl, clusters, flyTarget, onViewChange, onFlyStart, onFlyEnd, onPause, initialView }: MapViewProps) {
  const map = useMap()
  const prevCountRef = useRef(0)
  const hasFittedRef = useRef(false)
  const prevClusterRef = useRef(-1)

  // Build cluster visit order
  const clusterOrder = useMemo(() => {
    const seen = new Set<number>()
    const order: number[] = []
    for (const c of clusters.clusterOf) {
      if (!seen.has(c)) {
        seen.add(c)
        order.push(c)
      }
    }
    return order
  }, [clusters])

  // Compute min/max consecutive cluster transition distances for duration scaling
  const { minDist, maxDist } = useMemo(() => {
    if (clusterOrder.length < 2) return { minDist: 0, maxDist: 1 }

    const bounds = clusters.clusterBounds
    let min = Infinity, max = 0
    for (let i = 1; i < clusterOrder.length; i++) {
      const prev = bounds[clusterOrder[i - 1]]
      const curr = bounds[clusterOrder[i]]
      const cp = L.latLng((prev.minLat + prev.maxLat) / 2, (prev.minLng + prev.maxLng) / 2)
      const cc = L.latLng((curr.minLat + curr.maxLat) / 2, (curr.minLng + curr.maxLng) / 2)
      const d = cp.distanceTo(cc)
      if (d < min) min = d
      if (d > max) max = d
    }
    return { minDist: min, maxDist: max || 1 }
  }, [clusters, clusterOrder])

  // Pre-cache tiles for upcoming cluster transitions
  const prefetchedRef = useRef(new Set<number>())
  useEffect(() => {
    if (mode !== 'follow' || clusterOrder.length < 2) return
    const currentIdx = clusterOrder.indexOf(prevClusterRef.current)
    const lookahead = 3
    const start = Math.max(0, currentIdx + 1)
    const end = Math.min(clusterOrder.length, start + lookahead)
    for (let i = start; i < end; i++) {
      const cIdx = clusterOrder[i]
      if (prefetchedRef.current.has(cIdx)) continue
      prefetchedRef.current.add(cIdx)
      const bbox = clusters.clusterBounds[cIdx]
      if (!bbox) continue
      const bounds = L.latLngBounds(
        L.latLng(bbox.minLat, bbox.minLng),
        L.latLng(bbox.maxLat, bbox.maxLng),
      )
      const zoom = Math.min(15, map.getBoundsZoom(bounds, false, L.point(60, 60)))
      prefetchTiles(getTileUrls(bounds, zoom, tileUrl))
    }
  }, [prevClusterRef.current, mode, clusters, clusterOrder, map, tileUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset prefetch cache when activities change
  useEffect(() => {
    prefetchedRef.current.clear()
  }, [allActivities])

  // Handle flyTarget from city click or day zoom
  const flyTsRef = useRef(0)
  useEffect(() => {
    if (!flyTarget || flyTarget.ts <= flyTsRef.current) return
    flyTsRef.current = flyTarget.ts
    if (flyTarget.bounds) {
      map.flyToBounds(flyTarget.bounds, { padding: [40, 40], maxZoom: 15, duration: 1.5 })
    } else {
      map.flyTo([flyTarget.lat, flyTarget.lng], 12, { duration: 1.5 })
    }
  }, [flyTarget, map])

  // Apply initial view from hash on first mount
  useEffect(() => {
    if (initialView && !hasFittedRef.current) {
      hasFittedRef.current = true
      requestAnimationFrame(() => {
        map.invalidateSize()
        map.setView([initialView.lat, initialView.lng], initialView.zoom)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fit all bounds only on initial data load (not during animation)
  useEffect(() => {
    if (activities.length === 0) return
    if (hasFittedRef.current) return
    if (isAnimating) return

    const allCoords = activities.flatMap(a => a.coordinates)
    if (allCoords.length === 0) return
    const latLngs = allCoords.map(c => L.latLng(c[0], c[1]))
    const bounds = L.latLngBounds(latLngs)
    if (!bounds.isValid()) return

    hasFittedRef.current = true
    requestAnimationFrame(() => {
      map.invalidateSize()
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 18 })
    })
  }, [activities.length, isAnimating, map]) // eslint-disable-line react-hooks/exhaustive-deps

  // Detect cluster transitions and pause briefly
  const clusterPauseRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!isAnimating) {
      prevCountRef.current = activities.length
      return
    }
    if (activities.length <= prevCountRef.current) {
      prevCountRef.current = activities.length
      return
    }
    prevCountRef.current = activities.length

    const latest = activities[activities.length - 1]
    if (!latest || latest.coordinates.length === 0) return

    const allIdx = allActivities.indexOf(latest)
    if (allIdx < 0) return

    const currentCluster = clusters.clusterOf[allIdx]
    if (currentCluster === prevClusterRef.current) return
    prevClusterRef.current = currentCluster

    clearTimeout(clusterPauseRef.current)
    onFlyStart?.()

    if (mode === 'follow') {
      const bbox = clusters.clusterBounds[currentCluster]
      if (!bbox) return

      const bounds = L.latLngBounds(
        L.latLng(bbox.minLat, bbox.minLng),
        L.latLng(bbox.maxLat, bbox.maxLng),
      )
      if (!bounds.isValid()) { onFlyEnd?.(); return }

      const currentCenter = map.getCenter()
      const targetCenter = bounds.getCenter()
      const dist = currentCenter.distanceTo(targetCenter)
      const t = maxDist > minDist ? (dist - minDist) / (maxDist - minDist) : 0
      const duration = 0.5 + t * 4.5

      map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 15, duration })
      const onEnd = () => {
        map.off('moveend', onEnd)
        onFlyEnd?.()
      }
      map.on('moveend', onEnd)
    } else {
      clusterPauseRef.current = setTimeout(() => onFlyEnd?.(), 800)
    }
    return () => clearTimeout(clusterPauseRef.current)
  }, [activities, allActivities, isAnimating, mode, map, clusters, onFlyStart, onFlyEnd])

  // Reset cluster tracking when animation resets
  useEffect(() => {
    if (!isAnimating && activities.length === 0) {
      prevClusterRef.current = -1
    }
  }, [isAnimating, activities.length])

  // Pause animation when user drags the map
  useEffect(() => {
    const onDragStart = () => onPause?.()
    map.on('dragstart', onDragStart)
    return () => { map.off('dragstart', onDragStart) }
  }, [map, onPause])

  // Report view changes back to parent for hash sync
  useEffect(() => {
    const handler = () => {
      const center = map.getCenter()
      onViewChange(center.lat, center.lng, map.getZoom())
    }
    map.on('moveend', handler)
    return () => { map.off('moveend', handler) }
  }, [map, onViewChange])

  // Resize observer to handle sidebar collapse/expand
  useEffect(() => {
    const container = map.getContainer()
    if (!container) return
    const ro = new ResizeObserver(() => {
      map.invalidateSize()
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [map])

  return null
}

/** Show place name subtitle during animation */
function formatActivityDate(date: string): string {
  const d = new Date(date)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function PlaceLabels({ count, clusters, isAnimating, isPlaying, currentActivity, previewActivity, geocodeCache }: { count: number; clusters: CityCluster; isAnimating: boolean; isPlaying: boolean; currentActivity: Activity | null; previewActivity?: Activity | null; geocodeCache: Record<string, string> }) {
  const prevClusterRef = useRef(-1)
  const [labelText, setLabelText] = useState<string | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const { categoryColors } = useColorScheme()
  const map = useMap()

  useEffect(() => {
    const onDragStart = () => setIsPanning(true)
    const onDragEnd = () => setIsPanning(false)
    map.on('dragstart', onDragStart)
    map.on('dragend', onDragEnd)
    return () => {
      map.off('dragstart', onDragStart)
      map.off('dragend', onDragEnd)
    }
  }, [map])

  useEffect(() => {
    if (!isAnimating || count === 0) {
      prevClusterRef.current = -1
      setLabelText(null)
      return
    }
    const lastIdx = Math.min(count - 1, clusters.clusterOf.length - 1)
    if (lastIdx < 0) return
    const currentCluster = clusters.clusterOf[lastIdx]
    if (currentCluster === prevClusterRef.current) return
    prevClusterRef.current = currentCluster
    setLabelText(clusters.clusterCity[currentCluster] ?? null)
  }, [count, isAnimating, clusters])

  // Preview mode: show subtitle for the hovered timeline dot
  if (previewActivity) {
    let previewCity: string | null = null
    if (previewActivity.start_latlng) {
      const key = `${Number(previewActivity.start_latlng[0].toFixed(1))},${Number(previewActivity.start_latlng[1].toFixed(1))}`
      previewCity = geocodeCache[key] ?? null
    }
    const category = previewActivity.category
    const categoryColor = category ? categoryColors[category] : null
    const dateStr = formatActivityDate(previewActivity.start_date_local || previewActivity.start_date)

    return createPortal(
      <div className="place-subtitle">
        {previewCity && <div className="place-city">{previewCity}</div>}
        {category && (
          <div className="place-category" style={{ backgroundColor: categoryColor ?? undefined }}>
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </div>
        )}
        <div className="place-date">{dateStr}</div>
      </div>,
      map.getContainer(),
    )
  }

  if (!isAnimating || !isPlaying || !labelText) return null

  const dateStr = currentActivity ? formatActivityDate(currentActivity.start_date_local || currentActivity.start_date) : null
  const category = currentActivity?.category
  const categoryColor = category ? categoryColors[category] : null

  return createPortal(
    <div className="place-subtitle">
      <div className="place-city">{labelText}</div>
      {category && (
        <div className="place-category" style={{ backgroundColor: categoryColor ?? undefined }}>
          {category.charAt(0).toUpperCase() + category.slice(1)}
        </div>
      )}
      {dateStr && <div className="place-date">{dateStr}</div>}
    </div>,
    map.getContainer(),
  )
}

/** Render polylines with zoom-proportional weight, trail animation, and user dot */
function ZoomAwarePolylines({ activities, allActivities, currentIndex, activityType, distanceFilter, isAnimating, isPlaying, activityProgress, trailMode, previewActivity }: {
  activities: Activity[]
  allActivities: Activity[]
  currentIndex: number
  activityType: ActivityFilterType
  distanceFilter: number | null
  isAnimating: boolean
  isPlaying: boolean
  activityProgress: number
  trailMode: boolean
  previewActivity?: Activity | null
}) {
  const map = useMap()
  const { categoryColors, defaultColor } = useColorScheme()
  const [zoom, setZoom] = useState(map.getZoom())

  useEffect(() => {
    const handler = () => setZoom(map.getZoom())
    map.on('zoomend', handler)
    return () => { map.off('zoomend', handler) }
  }, [map])

  // Preview animation: loops trail progress when hovering a timeline dot
  const [previewProgress, setPreviewProgress] = useState(0)
  const previewRef = useRef<Activity | null | undefined>(null)
  useEffect(() => {
    previewRef.current = previewActivity
    if (!previewActivity || previewActivity.coordinates.length < 2) {
      setPreviewProgress(0)
      return
    }
    setPreviewProgress(0)
    const DURATION = 2000 // 2s to trace the route
    const PAUSE = 800     // 0.8s pause between loops
    const TICK = 25
    let elapsed = 0
    let pausing = false
    const timer = setInterval(() => {
      if (previewRef.current !== previewActivity) return
      if (pausing) {
        elapsed += TICK
        if (elapsed >= PAUSE) {
          pausing = false
          elapsed = 0
          setPreviewProgress(0)
        }
        return
      }
      elapsed += TICK
      const p = Math.min(1, elapsed / DURATION)
      setPreviewProgress(p)
      if (p >= 1) {
        pausing = true
        elapsed = 0
      }
    }, TICK)
    return () => clearInterval(timer)
  }, [previewActivity])

  const pinMode = zoom < 2
  const isLastTrail = isAnimating && trailMode && activityProgress < 1
  const lastIdx = activities.length - 1

  // Compute the user dot position and partial trail for the current activity
  let dotPosition: LatLngExpression | null = null
  let trailPositions: LatLngExpression[] | null = null
  let trailColor: string | null = null

  if (isLastTrail && lastIdx >= 0) {
    const act = activities[lastIdx]
    if (act.coordinates.length > 1) {
      const endCoordIdx = Math.max(1, Math.round(activityProgress * act.coordinates.length))
      trailPositions = act.coordinates.slice(0, endCoordIdx) as LatLngExpression[]
      dotPosition = trailPositions[trailPositions.length - 1]
      trailColor = getActivityColor(act, activityType, distanceFilter, categoryColors, defaultColor)
    }
  }

  // Hide user dot at world-level zoom, show at street-level (>=7)
  if (zoom < 7) {
    dotPosition = null
  }

  return (
    <>
      {activities.map((activity, i) => {
        if (activity.coordinates.length === 0) return null
        const color = getActivityColor(activity, activityType, distanceFilter, categoryColors, defaultColor)
        const opacity = getOpacity(i, activities.length, isAnimating)

        if (pinMode) {
          const center = activity.start_latlng ?? activity.coordinates[0]
          return (
            <CircleMarker
              key={activity.id}
              center={center as LatLngExpression}
              radius={4}
              pathOptions={{ color, fillColor: color, fillOpacity: opacity, opacity, weight: 1 }}
            />
          )
        }

        // Last activity in trail mode: render partial trail instead
        if (isLastTrail && i === lastIdx && trailPositions) {
          return (
            <Polyline
              key={activity.id}
              positions={trailPositions}
              pathOptions={{
                color,
                weight: getWeight(i, activities.length, isAnimating, zoom),
                opacity,
              }}
            />
          )
        }

        return (
          <Polyline
            key={activity.id}
            positions={activity.coordinates as LatLngExpression[]}
            pathOptions={{
              color,
              weight: getWeight(i, activities.length, isAnimating, zoom),
              opacity,
            }}
          />
        )
      })}
      {isAnimating && !pinMode && allActivities.slice(currentIndex).map(activity => {
        if (activity.coordinates.length === 0) return null
        const color = getActivityColor(activity, activityType, distanceFilter, categoryColors, defaultColor)
        return (
          <Polyline
            key={`future-${activity.id}`}
            positions={activity.coordinates as LatLngExpression[]}
            pathOptions={{
              color,
              weight: Math.max(0.3, getWeight(0, 1, false, zoom) * 0.5),
              opacity: 0.15,
              dashArray: '4 4',
            }}
          />
        )
      })}
      {isAnimating && dotPosition && (
        <Pane name="user-dot" style={{ zIndex: 650 }}>
          <CircleMarker
            center={dotPosition}
            radius={pinMode ? 6 : Math.max(4, 8 - zoom * 0.3)}
            pathOptions={{
              color: '#fff',
              fillColor: trailColor ?? '#ff4500',
              fillOpacity: 1,
              opacity: 1,
              weight: 2,
            }}
          />
        </Pane>
      )}
      {previewActivity && !isPlaying && previewActivity.coordinates.length > 1 && zoom >= 7 && (() => {
        const coords = previewActivity.coordinates
        const endIdx = Math.max(1, Math.round(previewProgress * coords.length))
        const partialCoords = coords.slice(0, endIdx) as LatLngExpression[]
        const previewColor = getActivityColor(previewActivity, activityType, distanceFilter, categoryColors, defaultColor)
        const previewDot = partialCoords[partialCoords.length - 1]
        return (
          <>
            <Polyline
              positions={partialCoords}
              pathOptions={{
                color: previewColor,
                weight: getWeight(0, 1, true, zoom),
                opacity: 0.9,
              }}
            />
            <Pane name="preview-dot" style={{ zIndex: 650 }}>
              <CircleMarker
                center={previewDot}
                radius={Math.max(4, 8 - zoom * 0.3)}
                pathOptions={{
                  color: '#fff',
                  fillColor: previewColor,
                  fillOpacity: 1,
                  opacity: 1,
                  weight: 2,
                }}
                />
              </Pane>
          </>
        )
      })()}
    </>
  )
}

function MapControls() {
  const map = useMap()

  const handleLocate = useCallback(() => {
    map.locate({ setView: true, maxZoom: 14 })
  }, [map])

  return (
    <div className="map-controls">
      <button className="map-ctrl-btn" onClick={() => map.zoomIn()} title="Zoom in">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <button className="map-ctrl-btn" onClick={() => map.zoomOut()} title="Zoom out">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <button className="map-ctrl-btn" onClick={handleLocate} title="Locate me">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      </button>
    </div>
  )
}

function LayerSwitcher({ active, onChange }: { active: MapLayer; onChange: (l: MapLayer) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeLabel = LAYERS.find(l => l.key === active)?.label ?? 'Map'

  return (
    <div className="layer-dropdown" ref={ref}>
      <button className="layer-dropdown-btn" onClick={() => setOpen(v => !v)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="1 6 12 2 23 6 12 10 1 6" />
          <polyline points="1 12 12 16 23 12" />
        </svg>
        {activeLabel}
      </button>
      {open && (
        <div className="layer-dropdown-menu">
          {LAYERS.map(l => (
            <button
              key={l.key}
              className={`layer-dropdown-item ${active === l.key ? 'active' : ''}`}
              onClick={() => { onChange(l.key); setOpen(false) }}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function getBorderTileUrl(mode: BorderMode): string {
  const variant = mode === 'dark' ? 'dark_nolabels' : 'light_nolabels'
  return `https://{s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`
}

const CITY_BORDER_STYLE_DARK: L.PathOptions = {
  color: '#888',
  weight: 0.8,
  fill: false,
  opacity: 0.7,
  dashArray: '4 3',
}

const CITY_BORDER_STYLE_LIGHT: L.PathOptions = {
  color: '#555',
  weight: 0.8,
  fill: false,
  opacity: 0.7,
  dashArray: '4 3',
}

const CITY_BORDER_STYLE_HEATMAP: L.PathOptions = {
  color: '#888',
  weight: 1.2,
  fill: false,
  opacity: 0.9,
  dashArray: '4 3',
}

function BorderTiles({ cityBoundaries, isHeatmap, borderMode }: { cityBoundaries: GeoJSON.FeatureCollection; isHeatmap: boolean; borderMode: BorderMode }) {
  const polyBoundaries = useMemo((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: cityBoundaries.features.filter(f =>
      f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon'
    ),
  }), [cityBoundaries])

  const cityStyle = isHeatmap ? CITY_BORDER_STYLE_HEATMAP : (borderMode === 'dark' ? CITY_BORDER_STYLE_DARK : CITY_BORDER_STYLE_LIGHT)
  const tileUrl = getBorderTileUrl(isHeatmap ? 'dark' : borderMode)

  return (
    <>
      <Pane name="borders-pane" style={{ zIndex: 250 }}>
        <TileLayer
          key={`border-tiles-${isHeatmap ? 'dark' : borderMode}`}
          url={tileUrl}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/">CARTO</a>'
          maxZoom={20}
          subdomains="abcd"
        />
      </Pane>
      {polyBoundaries.features.length > 0 && (
        <Pane name="city-borders-pane" style={{ zIndex: 251 }}>
          <GeoJSON key={`city-${polyBoundaries.features.length}-${isHeatmap}-${borderMode}`} data={polyBoundaries} style={() => cityStyle} />
        </Pane>
      )}
    </>
  )
}

/** Heatmap tile layer with zoom-adaptive brightness — subtle at low zoom, visible at street level */
function HeatmapLayer({ activityType, attribution, url }: { activityType: ActivityFilterType; attribution: string; url: string }) {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())

  useEffect(() => {
    const handler = () => setZoom(map.getZoom())
    map.on('zoomend', handler)
    return () => { map.off('zoomend', handler) }
  }, [map])

  // brightness: 0.3 at z3 → 0.8 at z15; opacity: 0.5 at z3 → 0.8 at z15
  const t = Math.min(1, Math.max(0, (zoom - 3) / 12))
  const brightness = 0.3 + t * 0.5
  const opacity = 0.5 + t * 0.3

  useEffect(() => {
    const pane = map.getPane('heatmap-tiles')
    if (pane) {
      pane.style.filter = `saturate(0) brightness(${brightness})`
      pane.style.opacity = String(opacity)
    }
  }, [map, brightness, opacity])

  return (
    <Pane name="heatmap-tiles" style={{ zIndex: 300, mixBlendMode: 'screen' }}>
      <TileLayer
        key={`heatmap-${activityType}`}
        attribution={attribution}
        url={url.replace('{type}', getHeatmapType(activityType))}
        keepBuffer={8}
        updateWhenZooming={false}
        maxNativeZoom={12}
        maxZoom={19}
        subdomains="abc"
      />
    </Pane>
  )
}

interface Props {
  activities: Activity[]
  allActivities: Activity[]
  activityType: ActivityFilterType
  distanceFilter: number | null
  isAnimating: boolean
  isPlaying: boolean
  currentIndex: number
  activityProgress: number
  trailMode: boolean
  mode: AnimationMode
  layer: MapLayer
  borderMode: BorderMode
  geocodeCache: Record<string, string>
  cityBoundaries: GeoJSON.FeatureCollection
  flyTarget?: { lat: number; lng: number; ts: number; bounds?: [[number, number], [number, number]] } | null
  onLayerChange: (layer: MapLayer) => void
  onViewChange: (lat: number, lng: number, zoom: number) => void
  onFlyStart?: () => void
  onFlyEnd?: () => void
  onPause?: () => void
  initialView?: { lat: number; lng: number; zoom: number }
  previewActivity?: Activity | null
}

function getOpacity(index: number, total: number, isAnimating: boolean): number {
  if (!isAnimating) return 0.4
  const recency = (index + 1) / total
  return 0.15 + recency * 0.65
}

function getWeight(index: number, total: number, isAnimating: boolean, zoom: number): number {
  let base: number
  if (!isAnimating) base = 3
  else if (index === total - 1) base = 5
  else base = 1 + ((index + 1) / total) * 2

  // zoom <2: pins (handled in component), 2-7: thick→refining, 7-11: refining, >=11: very refined
  const z = Math.min(Math.max(zoom, 2), 18)
  let scale: number
  if (z < 7) {
    scale = 1.6 - ((z - 2) / 5) * .6
  } else if (z < 11) {
    scale = .8 - ((z - 7) / 4) * 0.3
  } else {
    scale = 0.4 - ((z - 11) / 7) * 0.1
  }
  return Math.max(0.3, base * scale)
}

export function ActivityMap({ activities, allActivities, activityType, distanceFilter, isAnimating, isPlaying, currentIndex, activityProgress, trailMode, mode, layer, borderMode, geocodeCache, cityBoundaries, flyTarget, onLayerChange, onViewChange, onFlyStart, onFlyEnd, onPause, initialView, previewActivity }: Props) {
  const activeLayer = LAYERS.find(l => l.key === layer)!

  const clusters = useMemo(() => clusterByCity(allActivities, geocodeCache), [allActivities, geocodeCache])

  return (
    <MapContainer
      center={initialView ? [initialView.lat, initialView.lng] : [51.505, -0.09]}
      zoom={initialView?.zoom ?? 13}
      maxZoom={19}
      zoomControl={false}
      className="map-container"
    >
      {activeLayer.url && layer !== 'heatmap' && (
        <TileLayer
          key={activeLayer.key}
          attribution={activeLayer.attribution}
          url={activeLayer.url}
          keepBuffer={8}
          updateWhenZooming={false}
          maxZoom={activeLayer.maxZoom}
          subdomains={activeLayer.subdomains ?? 'abc'}
        />
      )}
      {(layer === 'borders' || layer === 'heatmap') && <BorderTiles cityBoundaries={cityBoundaries} isHeatmap={layer === 'heatmap'} borderMode={borderMode} />}
      {layer === 'heatmap' && (
        <HeatmapLayer
          activityType={activityType}
          attribution={activeLayer.attribution}
          url={activeLayer.url}
        />
      )}
      <MapViewUpdater
        activities={activities}
        allActivities={allActivities}
        isAnimating={isAnimating}
        mode={mode}
        tileUrl={activeLayer.url}
        clusters={clusters}
        flyTarget={flyTarget}
        onViewChange={onViewChange}
        onFlyStart={onFlyStart}
        onFlyEnd={onFlyEnd}
        onPause={onPause}
        initialView={initialView}
      />
      {!isPlaying && (
        <div className="map-top-right">
          <LayerSwitcher active={layer} onChange={onLayerChange} />
          <MapControls />
        </div>
      )}
      <ZoomAwarePolylines
        activities={activities}
        allActivities={allActivities}
        currentIndex={currentIndex}
        activityType={activityType}
        distanceFilter={distanceFilter}
        isAnimating={isAnimating}
        isPlaying={isPlaying}
        activityProgress={activityProgress}
        trailMode={trailMode}
        previewActivity={previewActivity}
      />
      <PlaceLabels count={activities.length} clusters={clusters} isAnimating={isAnimating} isPlaying={isPlaying} currentActivity={isAnimating && activities.length > 0 ? activities[activities.length - 1] : null} previewActivity={previewActivity} geocodeCache={geocodeCache} />
    </MapContainer>
  )
}
