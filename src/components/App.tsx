import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import type { FilterState } from '../types'
import { useAuth } from '../hooks/useAuth'
import { useActivities } from '../hooks/useActivities'
import { useTimeline } from '../hooks/useTimeline'
import { useGeocodeCache } from '../hooks/useGeocodeCache'
import type { CityInfo } from '../hooks/useGeocodeCache'
import { applyFilters, sortByDate } from '../utils/filters'
import { stateToHash, hashToState } from '../utils/hash'
import type { AppState, MapLayer } from '../utils/hash'
import { COLOR_SCHEMES } from '../utils/constants'
import type { ColorSchemeName } from '../utils/constants'
import { ColorSchemeContext } from '../contexts/ColorSchemeContext'
import { clusterByCity } from './Map'
import type { BorderMode } from './Map'
import { Sidebar } from './Sidebar'
import { ActivityMap } from './Map'
import { TimelineSlider } from './TimelineSlider'

const DEFAULT_FILTERS: FilterState = {
  activityType: 'all',
  excludedTypes: [],
  dateRange: { start: null, end: null },
  distanceFilter: null,
}

function getInitialState(): AppState {
  if (window.location.hash) {
    const parsed = hashToState(window.location.hash)
    if (parsed) return parsed
  }
  return { filters: DEFAULT_FILTERS }
}

const initialState = getInitialState()

export function App() {
  const { auth, loading: authLoading, login, logout } = useAuth()
  const [filters, setFilters] = useState<FilterState>(initialState.filters)
  const [mapLayer, setMapLayer] = useState<MapLayer>(initialState.layer ?? 'borders')
  const [colorScheme, setColorScheme] = useState<ColorSchemeName>(initialState.scheme ?? 'strava')
  const [borderMode, setBorderMode] = useState<BorderMode>(() => {
    try { return (localStorage.getItem('borderMode') as BorderMode) || 'dark' } catch { return 'dark' }
  })
  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', borderMode)
  }, [borderMode])

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mapView, setMapView] = useState<{ lat: number; lng: number; zoom: number } | undefined>(
    initialState.lat != null && initialState.lng != null && initialState.zoom != null
      ? { lat: initialState.lat, lng: initialState.lng, zoom: initialState.zoom }
      : undefined
  )
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number; ts: number; bounds?: [[number, number], [number, number]] } | null>(null)
  const suppressHashUpdate = useRef(false)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const { activities, loading: activitiesLoading, loadedCount } = useActivities(filters)

  const sorted = useMemo(() => sortByDate(activities), [activities])
  const filtered = useMemo(() => applyFilters(sorted, filters), [sorted, filters])
  const timeline = useTimeline(filtered)
  const { cache: geocodeCache, cities, boundaries: cityBoundaries } = useGeocodeCache(filtered)
  const [previewActivityIndex, setPreviewActivityIndex] = useState<number | null>(null)

  const schemeValue = useMemo(() => ({
    ...COLOR_SCHEMES[colorScheme],
    scheme: colorScheme,
    setScheme: setColorScheme,
  }), [colorScheme])

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sorted.length }
    for (const a of sorted) {
      if (a.category) counts[a.category] = (counts[a.category] || 0) + 1
    }
    return counts
  }, [sorted])

  // Derive animation city from current cluster
  const animationCity = useMemo(() => {
    if (!timeline.animateEnabled || timeline.currentIndex <= 0 || timeline.currentIndex > filtered.length) return null
    const clusters = clusterByCity(filtered, geocodeCache)
    const idx = timeline.currentIndex - 1
    if (idx >= clusters.clusterOf.length) return null
    return clusters.clusterCity[clusters.clusterOf[idx]] ?? null
  }, [timeline.animateEnabled, timeline.currentIndex, filtered, geocodeCache])

  const handleDotDoubleClick = useCallback((index: number) => {
    const activity = filtered[index]
    if (!activity) return
    // Find all activities on the same day
    const d = new Date(activity.start_date)
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const dayEnd = dayStart + 86400000
    const dayActivities = filtered.filter(a => {
      const t = new Date(a.start_date).getTime()
      return t >= dayStart && t < dayEnd
    })
    // Compute bounds from all coordinates
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
    for (const a of dayActivities) {
      for (const [lat, lng] of a.coordinates) {
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
      }
    }
    if (minLat === Infinity) return
    const centerLat = (minLat + maxLat) / 2
    const centerLng = (minLng + maxLng) / 2
    setFlyTarget({
      lat: centerLat,
      lng: centerLng,
      ts: Date.now(),
      bounds: [[minLat, minLng], [maxLat, maxLng]],
    })
  }, [filtered])

  const handleCityClick = useCallback((city: CityInfo) => {
    timeline.pause()
    setFlyTarget({ lat: city.lat, lng: city.lng, ts: Date.now() })
  }, [timeline])

  // Apply initial speed/mode from hash
  useEffect(() => {
    if (initialState.speed) timeline.setSpeed(initialState.speed)
    if (initialState.mode) timeline.setMode(initialState.mode)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleViewChange = useCallback((lat: number, lng: number, zoom: number) => {
    setMapView({ lat, lng, zoom })
  }, [])

  // Sync full state → hash
  useEffect(() => {
    if (suppressHashUpdate.current) {
      suppressHashUpdate.current = false
      return
    }
    const state: AppState = {
      filters,
      lat: mapView?.lat,
      lng: mapView?.lng,
      zoom: mapView?.zoom,
      speed: timeline.speed,
      mode: timeline.mode,
      layer: mapLayer,
      scheme: colorScheme,
    }
    const hash = stateToHash(state)
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash || window.location.pathname)
    }
  }, [filters, mapView, timeline.speed, timeline.mode, mapLayer, colorScheme])

  // Respond to hashchange (back/forward navigation)
  useEffect(() => {
    const onHashChange = () => {
      const parsed = hashToState(window.location.hash)
      if (parsed) {
        suppressHashUpdate.current = true
        setFilters(parsed.filters)
        if (parsed.layer) setMapLayer(parsed.layer)
        if (parsed.speed) timeline.setSpeed(parsed.speed)
        if (parsed.mode) timeline.setMode(parsed.mode)
        if (parsed.scheme) setColorScheme(parsed.scheme)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    )
  }

  if (!auth.authenticated) {
    return (
      <div className="login-screen">
        <h1>Stravaaaaaa</h1>
        <p>View your Strava activities on a map</p>
        <button className="login-btn" onClick={login}>
          Connect with Strava
        </button>
      </div>
    )
  }

  return (
    <ColorSchemeContext.Provider value={schemeValue}>
      <div className={`app-layout ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
        <Sidebar
          filters={filters}
          onFiltersChange={setFilters}
          loading={activitiesLoading}
          loadedCount={loadedCount}
          activityCount={filtered.length}
          typeCounts={typeCounts}
          activities={sorted}
          cities={cities}
          animationCity={animationCity}
          onCityClick={handleCityClick}
          onLogout={logout}
          athleteName={auth.athlete ? `${auth.athlete.firstname} ${auth.athlete.lastname}` : undefined}
          collapsed={!sidebarOpen}
          onToggle={() => setSidebarOpen(v => !v)}
          animationDate={timeline.animateEnabled && timeline.currentIndex > 0 && timeline.currentIndex <= filtered.length
            ? new Date(filtered[timeline.currentIndex - 1].start_date)
            : null}
          animationCategory={timeline.animateEnabled && timeline.currentIndex > 0 && timeline.currentIndex <= filtered.length
            ? filtered[timeline.currentIndex - 1].category
            : null}
          borderMode={borderMode}
          onBorderModeChange={(m: BorderMode) => { setBorderMode(m); try { localStorage.setItem('borderMode', m) } catch {} }}
        />
        <div ref={mapContainerRef} style={{ gridArea: 'map', position: 'relative' }}>
          <ActivityMap
            activities={timeline.visibleActivities}
            allActivities={filtered}
            activityType={filters.activityType}
            distanceFilter={filters.distanceFilter}
            isAnimating={timeline.animateEnabled && (timeline.isPlaying || timeline.currentIndex < filtered.length)}
            isPlaying={timeline.isPlaying}
            currentIndex={timeline.currentIndex}
            activityProgress={timeline.activityProgress}
            trailMode={timeline.trailMode}
            mode={timeline.mode}
            layer={mapLayer}
            borderMode={borderMode}
            geocodeCache={geocodeCache}
            cityBoundaries={cityBoundaries}
            flyTarget={flyTarget}
            onLayerChange={setMapLayer}
            onViewChange={handleViewChange}
            onFlyStart={timeline.freeze}
            onFlyEnd={timeline.unfreeze}
            onPause={timeline.pause}
            initialView={mapView}
            previewActivity={previewActivityIndex != null ? filtered[previewActivityIndex] ?? null : null}
          />
        </div>
        <TimelineSlider
          activities={filtered}
          timeline={timeline}
          activityType={filters.activityType}
          distanceFilter={filters.distanceFilter}
          onDotHover={setPreviewActivityIndex}
          onDotClick={handleDotDoubleClick}
        />
      </div>
    </ColorSchemeContext.Provider>
  )
}
