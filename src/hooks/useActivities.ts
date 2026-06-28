import { useState, useEffect, useMemo } from 'react'
import type { Activity, ActivityCategory, FilterState } from '../types'
import type { StravaTokens } from '../lib/stravaAuth'
import { getValidToken } from '../lib/stravaAuth'
import { idbGet, idbSet, idbGetBatch } from '../lib/idb'
import { decodePolyline } from '../utils/polyline'
import { COMPOSITE_TYPES } from '../utils/constants'

const STRAVA_API = 'https://www.strava.com/api/v3'

const SPORT_TYPE_MAP: Record<string, ActivityCategory> = {
  Ride: 'ride', MountainBikeRide: 'ride', GravelRide: 'ride',
  EBikeRide: 'ride', EMountainBikeRide: 'ride', VirtualRide: 'ride',
  Velomobile: 'ride', Handcycle: 'ride',
  Run: 'run', VirtualRun: 'run',
  Walk: 'walk', Hike: 'walk', Snowshoe: 'walk',
  TrailRun: 'trail',
  Swim: 'swim',
  Canoeing: 'water', Kayaking: 'water', Rowing: 'water', VirtualRow: 'water',
  Sail: 'water', StandUpPaddling: 'water', Surfing: 'water',
  Kitesurf: 'water', Windsurf: 'water',
  AlpineSki: 'winter', BackcountrySki: 'winter', NordicSki: 'winter',
  Snowboard: 'winter', IceSkate: 'winter', RollerSki: 'winter',
  Crossfit: 'workout', Elliptical: 'workout', HighIntensityIntervalTraining: 'workout',
  Pilates: 'workout', RockClimbing: 'workout', StairStepper: 'workout',
  WeightTraining: 'workout', Wheelchair: 'workout', Workout: 'workout', Yoga: 'workout',
  Badminton: 'sport', Golf: 'sport', InlineSkate: 'sport', Pickleball: 'sport',
  Racquetball: 'sport', Skateboard: 'sport', Soccer: 'sport', Squash: 'sport',
  TableTennis: 'sport', Tennis: 'sport',
}

function categorize(sportType: string): ActivityCategory | null {
  return SPORT_TYPE_MAP[sportType] ?? null
}

function mapActivity(a: Record<string, unknown>): Activity {
  return {
    id: a.id as number,
    name: a.name as string,
    sport_type: a.sport_type as string,
    category: categorize(a.sport_type as string),
    start_date: a.start_date as string,
    start_date_local: a.start_date_local as string,
    distance: a.distance as number,
    moving_time: a.moving_time as number,
    elapsed_time: a.elapsed_time as number,
    total_elevation_gain: a.total_elevation_gain as number,
    polyline: (a.map as { summary_polyline: string | null })?.summary_polyline ?? null,
    start_latlng: a.start_latlng as [number, number] | null,
    end_latlng: a.end_latlng as [number, number] | null,
    coordinates: decodePolyline(
      (a.map as { summary_polyline: string | null })?.summary_polyline ?? null
    ),
  }
}

async function fetchPage(
  token: string,
  page: number,
  after?: number,
  before?: number,
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({ per_page: '200', page: String(page) })
  if (after) params.set('after', String(after))
  if (before) params.set('before', String(before))
  const res = await fetch(`${STRAVA_API}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`)
  return res.json() as Promise<Record<string, unknown>[]>
}

// IDB key helpers
const idsKey = (athleteId: number) => `${athleteId}:ids`
const actKey = (athleteId: number, id: number) => `${athleteId}:${id}`

function applyDateFilter(
  raw: Record<string, unknown>[],
  after?: number,
  before?: number,
): Record<string, unknown>[] {
  if (!after && !before) return raw
  return raw.filter(a => {
    const ts = Math.floor(new Date(a.start_date as string).getTime() / 1000)
    if (after && ts < after) return false
    if (before && ts > before) return false
    return true
  })
}

export function useActivities(filters: FilterState, tokens: StravaTokens | null) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedCount, setLoadedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const serverType = useMemo(
    () => filters.activityType in COMPOSITE_TYPES ? 'all' : filters.activityType,
    [filters.activityType]
  )

  const athleteId = tokens?.athlete?.id ?? null

  useEffect(() => {
    if (!athleteId) return
    let cancelled = false

    setLoading(true)
    setError(null)
    setLoadedCount(0)
    setActivities([])

    const after = filters.dateRange.start
      ? Math.floor(filters.dateRange.start.getTime() / 1000)
      : undefined
    const before = filters.dateRange.end
      ? Math.floor(filters.dateRange.end.getTime() / 1000)
      : undefined

    ;(async () => {
      try {
        const token = await getValidToken()
        if (!token) throw new Error('Not authenticated')

        // Load the ordered ID list and build a lookup Set
        const cachedIds = await idbGet<number[]>('activities', idsKey(athleteId)) ?? []
        const cachedIdSet = new Set(cachedIds)

        // Fetch pages from Strava until we hit an activity ID already in the cache
        const freshRaw: Record<string, unknown>[] = []
        let cacheHitIndex: number | null = null // position of first hit in cachedIds[]
        let page = 1

        outer: while (!cancelled) {
          const pageRaw = await fetchPage(token, page, after, before)
          if (cancelled) return

          for (const activity of pageRaw) {
            const id = activity.id as number
            if (cachedIdSet.has(id)) {
              cacheHitIndex = cachedIds.indexOf(id)
              break outer
            }
            freshRaw.push(activity)
          }

          // Show fresh activities as they arrive
          const freshMapped = freshRaw
            .map(mapActivity)
            .filter(a => a.coordinates.length > 0)
            .filter(a => serverType === 'all' || a.category === serverType)
          if (!cancelled) {
            setActivities(freshMapped)
            setLoadedCount(freshMapped.length)
          }

          if (pageRaw.length < 200) break  // last page, no more to fetch
          page++
        }

        if (cancelled) return

        // Load cached remainder from IDB (from hit point to end of IDs list)
        let cachedRaw: Record<string, unknown>[] = []
        if (cacheHitIndex !== null) {
          const remainingIds = cachedIds.slice(cacheHitIndex)
          const batch = await idbGetBatch<Record<string, unknown>>(
            'activities',
            remainingIds.map(id => actKey(athleteId, id)),
          )
          cachedRaw = applyDateFilter(
            batch.filter((a): a is Record<string, unknown> => a !== null),
            after,
            before,
          )
        }

        if (cancelled) return

        // Combine and display
        const allRaw = [...freshRaw, ...cachedRaw]
        const allMapped = allRaw
          .map(mapActivity)
          .filter(a => a.coordinates.length > 0)
          .filter(a => serverType === 'all' || a.category === serverType)
        setActivities(allMapped)
        setLoadedCount(allMapped.length)

        // Persist fresh activities to IDB and update the IDs list
        if (freshRaw.length > 0) {
          for (const a of freshRaw) {
            await idbSet('activities', actKey(athleteId, a.id as number), a)
          }
          const freshIds = freshRaw.map(a => a.id as number)
          await idbSet('activities', idsKey(athleteId), [...freshIds, ...cachedIds])
        }
      } catch (err: unknown) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [serverType, athleteId, filters.dateRange.start, filters.dateRange.end]) // eslint-disable-line react-hooks/exhaustive-deps

  return { activities, loading, loadedCount, error }
}
