export type ActivityCategory = 'ride' | 'run' | 'walk' | 'trail' | 'swim' | 'water' | 'winter' | 'workout' | 'sport'
export type CompositeType = 'allrun' | 'allride'
export type ActivityFilterType = ActivityCategory | CompositeType | 'all'

export interface Activity {
  id: number
  name: string
  sport_type: string
  category: ActivityCategory | null
  start_date: string
  start_date_local: string
  distance: number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: number
  polyline: string | null
  start_latlng: [number, number] | null
  end_latlng: [number, number] | null
  coordinates: [number, number][]
}

export interface AuthStatus {
  authenticated: boolean
  athlete?: {
    firstname: string
    lastname: string
  }
}

export interface FilterState {
  activityType: ActivityFilterType
  excludedTypes: ActivityCategory[]
  dateRange: {
    start: Date | null
    end: Date | null
  }
  distanceFilter: number | null
}

export interface DistanceChip {
  label: string
  meters: number
}

export interface DistanceBracket {
  max: number
  color: string
  label: string
}
