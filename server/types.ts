export interface StravaTokens {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete: { id: number; firstname: string; lastname: string }
}

export interface StravaSummaryActivity {
  id: number
  name: string
  sport_type: string
  type: string
  start_date: string
  start_date_local: string
  distance: number
  moving_time: number
  elapsed_time: number
  total_elevation_gain: number
  map: {
    id: string
    summary_polyline: string | null
    polyline: string | null
  }
  start_latlng: [number, number] | null
  end_latlng: [number, number] | null
}

export interface StravaStream {
  type: string
  data: unknown[]
  series_type: string
  original_size: number
  resolution: string
}

export interface ActivityFilters {
  sport_type?: string
  after?: number
  before?: number
  page?: number
  per_page?: number
}
