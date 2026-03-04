import { cacheGet, cacheSet } from './cache.js'
import type { StravaSummaryActivity, ActivityFilters, StravaStream } from './types.js'

const STRAVA_API = 'https://www.strava.com/api/v3'

async function stravaFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${STRAVA_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error(`Strava API error: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export async function getActivitiesPage(
  token: string,
  visitorId: string,
  page: number,
  after?: number,
  before?: number
): Promise<StravaSummaryActivity[]> {
  const cacheKey = `strava:activities:${visitorId}:p${page}:a${after || 0}:b${before || 0}`
  const cached = await cacheGet<StravaSummaryActivity[]>(cacheKey)
  if (cached) return cached

  const params = new URLSearchParams({
    per_page: '200',
    page: String(page),
  })
  if (after) params.set('after', String(after))
  if (before) params.set('before', String(before))

  const activities = await stravaFetch<StravaSummaryActivity[]>(
    `/athlete/activities?${params}`,
    token
  )

  await cacheSet(cacheKey, activities)
  return activities
}

export async function getAllActivities(
  token: string,
  visitorId: string,
  filters: ActivityFilters
): Promise<StravaSummaryActivity[]> {
  const all: StravaSummaryActivity[] = []
  let page = 1

  while (true) {
    const activities = await getActivitiesPage(
      token,
      visitorId,
      page,
      filters.after,
      filters.before
    )
    all.push(...activities)
    if (activities.length < 200) break
    page++
  }

  return all
}

export async function getActivityStreams(
  token: string,
  activityId: number
): Promise<[number, number][]> {
  const cacheKey = `strava:streams:${activityId}`
  const cached = await cacheGet<[number, number][]>(cacheKey)
  if (cached) return cached

  try {
    const streams = await stravaFetch<StravaStream[]>(
      `/activities/${activityId}/streams?keys=latlng&key_type=time`,
      token
    )
    const latlngStream = streams.find(s => s.type === 'latlng')
    const data = (latlngStream?.data as [number, number][]) || []
    await cacheSet(cacheKey, data)
    return data
  } catch {
    return []
  }
}

// Map Strava sport_type to our app categories
const SPORT_TYPE_MAP: Record<string, string> = {
  // Cycling
  Ride: 'ride',
  MountainBikeRide: 'ride',
  GravelRide: 'ride',
  EBikeRide: 'ride',
  EMountainBikeRide: 'ride',
  VirtualRide: 'ride',
  Velomobile: 'ride',
  Handcycle: 'ride',
  // Running
  Run: 'run',
  VirtualRun: 'run',
  // Walking
  Walk: 'walk',
  Hike: 'walk',
  Snowshoe: 'walk',
  // Trail
  TrailRun: 'trail',
  // Swimming
  Swim: 'swim',
  // Water sports
  Canoeing: 'water',
  Kayaking: 'water',
  Rowing: 'water',
  VirtualRow: 'water',
  Sail: 'water',
  StandUpPaddling: 'water',
  Surfing: 'water',
  Kitesurf: 'water',
  Windsurf: 'water',
  // Winter sports
  AlpineSki: 'winter',
  BackcountrySki: 'winter',
  NordicSki: 'winter',
  Snowboard: 'winter',
  IceSkate: 'winter',
  RollerSki: 'winter',
  // Workouts
  Crossfit: 'workout',
  Elliptical: 'workout',
  HighIntensityIntervalTraining: 'workout',
  Pilates: 'workout',
  RockClimbing: 'workout',
  StairStepper: 'workout',
  WeightTraining: 'workout',
  Wheelchair: 'workout',
  Workout: 'workout',
  Yoga: 'workout',
  // Racket & ball sports
  Badminton: 'sport',
  Golf: 'sport',
  InlineSkate: 'sport',
  Pickleball: 'sport',
  Racquetball: 'sport',
  Skateboard: 'sport',
  Soccer: 'sport',
  Squash: 'sport',
  TableTennis: 'sport',
  Tennis: 'sport',
}

export function mapSportType(sportType: string): string | null {
  return SPORT_TYPE_MAP[sportType] || null
}
