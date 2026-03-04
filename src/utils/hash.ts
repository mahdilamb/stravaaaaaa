import type { FilterState, ActivityFilterType, ActivityCategory } from '../types'
import type { AnimationMode } from '../hooks/useTimeline'
import type { ColorSchemeName } from './constants'
import { SCHEME_NAMES } from './constants'

export type MapLayer = 'streets' | 'satellite' | 'toner' | 'grey' | 'borders' | 'heatmap' | 'none'

export interface AppState {
  filters: FilterState
  lat?: number
  lng?: number
  zoom?: number
  speed?: number
  mode?: AnimationMode
  layer?: MapLayer
  scheme?: ColorSchemeName
}

const ACTIVITY_TYPES: ActivityFilterType[] = ['all', 'allrun', 'allride', 'ride', 'run', 'walk', 'trail', 'swim', 'water', 'winter', 'workout', 'sport']
const VALID_LAYERS: MapLayer[] = ['streets', 'satellite', 'toner', 'grey', 'borders', 'heatmap', 'none']
const VALID_MODES: AnimationMode[] = ['overview', 'follow']

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals
  return Math.round(n * f) / f
}

export function stateToHash(state: AppState): string {
  const parts: string[] = []
  const { filters } = state

  if (filters.activityType !== 'all') parts.push(`type=${filters.activityType}`)
  if (filters.excludedTypes.length > 0) parts.push(`hide=${filters.excludedTypes.join(',')}`)
  if (filters.dateRange.start) parts.push(`from=${toISODate(filters.dateRange.start)}`)
  if (filters.dateRange.end) parts.push(`to=${toISODate(filters.dateRange.end)}`)
  if (filters.distanceFilter !== null) parts.push(`distance=${filters.distanceFilter}`)
  if (state.lat != null && state.lng != null && state.zoom != null) {
    parts.push(`lat=${round(state.lat, 5)}`)
    parts.push(`lng=${round(state.lng, 5)}`)
    parts.push(`zoom=${round(state.zoom, 1)}`)
  }
  if (state.speed != null && state.speed !== 3) parts.push(`speed=${state.speed}`)
  if (state.mode && state.mode !== 'overview') parts.push(`mode=${state.mode}`)
  if (state.layer && state.layer !== 'grey') parts.push(`layer=${state.layer}`)
  if (state.scheme && state.scheme !== 'strava') parts.push(`scheme=${state.scheme}`)

  return parts.length > 0 ? `#${parts.join('&')}` : ''
}

export function hashToState(hash: string): AppState | null {
  const raw = hash.replace(/^#/, '')
  if (!raw) return null

  const params = new URLSearchParams(raw)

  const typeParam = params.get('type')
  const activityType: ActivityFilterType =
    typeParam && ACTIVITY_TYPES.includes(typeParam as ActivityFilterType)
      ? (typeParam as ActivityFilterType)
      : 'all'

  const hideParam = params.get('hide')
  const excludedTypes: ActivityCategory[] = hideParam
    ? hideParam.split(',').filter(t => ACTIVITY_TYPES.includes(t as ActivityCategory)) as ActivityCategory[]
    : []

  const fromParam = params.get('from')
  const toParam = params.get('to')
  const distParam = params.get('distance')
  const latParam = params.get('lat')
  const lngParam = params.get('lng')
  const zoomParam = params.get('zoom')
  const speedParam = params.get('speed')
  const modeParam = params.get('mode')
  const layerParam = params.get('layer')

  const state: AppState = {
    filters: {
      activityType,
      excludedTypes,
      dateRange: {
        start: fromParam ? new Date(fromParam) : null,
        end: toParam ? new Date(toParam) : null,
      },
      distanceFilter: distParam ? Number(distParam) : null,
    },
  }

  if (latParam && lngParam && zoomParam) {
    const lat = Number(latParam)
    const lng = Number(lngParam)
    const zoom = Number(zoomParam)
    if (isFinite(lat) && isFinite(lng) && isFinite(zoom)) {
      state.lat = lat
      state.lng = lng
      state.zoom = zoom
    }
  }
  if (speedParam) {
    const spd = Number(speedParam)
    if (isFinite(spd) && spd > 0) state.speed = spd
  }
  if (modeParam && VALID_MODES.includes(modeParam as AnimationMode)) {
    state.mode = modeParam as AnimationMode
  }
  if (layerParam && VALID_LAYERS.includes(layerParam as MapLayer)) {
    state.layer = layerParam as MapLayer
  }
  const schemeParam = params.get('scheme')
  if (schemeParam && SCHEME_NAMES.includes(schemeParam as ColorSchemeName)) {
    state.scheme = schemeParam as ColorSchemeName
  }

  return state
}
