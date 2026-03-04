import type { ActivityCategory, CompositeType, DistanceChip, DistanceBracket } from '../types'

/** Composite types that group multiple categories */
export const COMPOSITE_TYPES: Record<CompositeType, ActivityCategory[]> = {
  allrun: ['run', 'trail'],
  allride: ['ride'],
}

export const DISTANCE_CHIPS: Partial<Record<ActivityCategory, DistanceChip[]>> = {
  run: [
    { label: '5k', meters: 5000 },
    { label: '10k', meters: 10000 },
    { label: '21.1k', meters: 21100 },
    { label: '42.2k', meters: 42200 },
  ],
  ride: [
    { label: '50k', meters: 50000 },
    { label: '100k', meters: 100000 },
    { label: '160k', meters: 160000 },
  ],
  walk: [
    { label: '5k', meters: 5000 },
    { label: '10k', meters: 10000 },
    { label: '20k', meters: 20000 },
  ],
  trail: [
    { label: '10k', meters: 10000 },
    { label: '25k', meters: 25000 },
    { label: '50k', meters: 50000 },
    { label: '100k', meters: 100000 },
  ],
  swim: [
    { label: '500m', meters: 500 },
    { label: '1k', meters: 1000 },
    { label: '2k', meters: 2000 },
    { label: '5k', meters: 5000 },
  ],
  water: [
    { label: '5k', meters: 5000 },
    { label: '10k', meters: 10000 },
    { label: '20k', meters: 20000 },
  ],
  winter: [
    { label: '5k', meters: 5000 },
    { label: '15k', meters: 15000 },
    { label: '30k', meters: 30000 },
  ],
}

export const DISTANCE_BRACKETS: Partial<Record<ActivityCategory, DistanceBracket[]>> = {
  run: [
    { max: 5000, color: '#4CAF50', label: '< 5k' },
    { max: 10000, color: '#8BC34A', label: '5-10k' },
    { max: 21100, color: '#FFC107', label: '10-21.1k' },
    { max: 42200, color: '#FF9800', label: '21.1-42.2k' },
    { max: Infinity, color: '#F44336', label: '42.2k+' },
  ],
  ride: [
    { max: 25000, color: '#4CAF50', label: '< 25k' },
    { max: 50000, color: '#8BC34A', label: '25-50k' },
    { max: 100000, color: '#FFC107', label: '50-100k' },
    { max: 160000, color: '#FF9800', label: '100-160k' },
    { max: Infinity, color: '#F44336', label: '160k+' },
  ],
  walk: [
    { max: 5000, color: '#4CAF50', label: '< 5k' },
    { max: 10000, color: '#8BC34A', label: '5-10k' },
    { max: 20000, color: '#FFC107', label: '10-20k' },
    { max: Infinity, color: '#FF9800', label: '20k+' },
  ],
  trail: [
    { max: 10000, color: '#4CAF50', label: '< 10k' },
    { max: 25000, color: '#8BC34A', label: '10-25k' },
    { max: 50000, color: '#FFC107', label: '25-50k' },
    { max: 100000, color: '#FF9800', label: '50-100k' },
    { max: Infinity, color: '#F44336', label: '100k+' },
  ],
  swim: [
    { max: 500, color: '#4CAF50', label: '< 500m' },
    { max: 1000, color: '#8BC34A', label: '500m-1k' },
    { max: 2000, color: '#FFC107', label: '1-2k' },
    { max: 5000, color: '#FF9800', label: '2-5k' },
    { max: Infinity, color: '#F44336', label: '5k+' },
  ],
  water: [
    { max: 5000, color: '#4CAF50', label: '< 5k' },
    { max: 10000, color: '#8BC34A', label: '5-10k' },
    { max: 20000, color: '#FFC107', label: '10-20k' },
    { max: Infinity, color: '#FF9800', label: '20k+' },
  ],
  winter: [
    { max: 5000, color: '#4CAF50', label: '< 5k' },
    { max: 15000, color: '#8BC34A', label: '5-15k' },
    { max: 30000, color: '#FFC107', label: '15-30k' },
    { max: Infinity, color: '#FF9800', label: '30k+' },
  ],
}

export const DEFAULT_POLYLINE_COLOR = '#3388ff'

export const CATEGORY_COLORS: Record<string, string> = {
  ride: '#FF9800',
  run: '#2196F3',
  walk: '#4CAF50',
  trail: '#E91E63',
  swim: '#00BCD4',
  water: '#0288D1',
  winter: '#90CAF9',
  workout: '#FF5722',
  sport: '#9C27B0',
}

export type ColorSchemeName = 'strava' | 'neon' | 'pastel' | 'vapor' | 'mono'

export interface ColorScheme {
  label: string
  categoryColors: Record<string, string>
  defaultColor: string
}

export const COLOR_SCHEMES: Record<ColorSchemeName, ColorScheme> = {
  strava: {
    label: 'Strava',
    categoryColors: CATEGORY_COLORS,
    defaultColor: DEFAULT_POLYLINE_COLOR,
  },
  neon: {
    label: 'Neon',
    categoryColors: {
      ride: '#FF006E',
      run: '#8338EC',
      walk: '#3A86FF',
      trail: '#FFBE0B',
      swim: '#FB5607',
      water: '#00F5D4',
      winter: '#9BF6FF',
      workout: '#F72585',
      sport: '#7209B7',
    },
    defaultColor: '#8338EC',
  },
  pastel: {
    label: 'Pastel',
    categoryColors: {
      ride: '#FFB5A7',
      run: '#B8C0FF',
      walk: '#CDB4DB',
      trail: '#FFC8DD',
      swim: '#A2D2FF',
      water: '#BDE0FE',
      winter: '#D7E3FC',
      workout: '#FFCDB2',
      sport: '#E2C2FF',
    },
    defaultColor: '#B8C0FF',
  },
  vapor: {
    label: 'Vapor',
    categoryColors: {
      ride: '#FF71CE',
      run: '#01CDFE',
      walk: '#05FFA1',
      trail: '#B967FF',
      swim: '#FFFB96',
      water: '#00D2FF',
      winter: '#C4FAF8',
      workout: '#FF6B6B',
      sport: '#845EC2',
    },
    defaultColor: '#01CDFE',
  },
  mono: {
    label: 'Mono',
    categoryColors: {
      ride: '#D0D0D0',
      run: '#D0D0D0',
      walk: '#D0D0D0',
      trail: '#D0D0D0',
      swim: '#D0D0D0',
      water: '#D0D0D0',
      winter: '#D0D0D0',
      workout: '#D0D0D0',
      sport: '#D0D0D0',
    },
    defaultColor: '#D0D0D0',
  },
}

export const SCHEME_NAMES: ColorSchemeName[] = ['strava', 'neon', 'pastel', 'vapor', 'mono']

/** Resolve a filter type to the categories it includes */
export function resolveCategories(type: import('../types').ActivityFilterType): ActivityCategory[] | null {
  if (type === 'all') return null
  if (type in COMPOSITE_TYPES) return COMPOSITE_TYPES[type as CompositeType]
  return [type as ActivityCategory]
}
