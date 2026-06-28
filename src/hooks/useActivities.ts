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

async function fetchPage(token: string, page: number, after?: number): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({ per_page: '200', page: String(page) })
  if (after !== undefined) params.set('after', String(after))
  const res = await fetch(`${STRAVA_API}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Strava API error: ${res.status}`)
  return res.json() as Promise<Record<string, unknown>[]>
}

const fetchKey = (athleteId: number) => `${athleteId}:lastFetch`
const idsKey = (athleteId: number) => `${athleteId}:ids`
const actKey = (athleteId: number, id: number) => `${athleteId}:${id}`

export function useActivities(filters: FilterState, tokens: StravaTokens | null) {
  const [rawActivities, setRawActivities] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedCount, setLoadedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const serverType = useMemo(
    () => filters.activityType in COMPOSITE_TYPES ? 'all' : filters.activityType,
    [filters.activityType]
  )

  const athleteId = tokens?.athlete?.id ?? null

  // Sync with Strava only when the athlete changes — date range and type are filtered locally
  useEffect(() => {
    if (!athleteId) return
    let cancelled = false

    setLoading(true)
    setError(null)
    setLoadedCount(0)
    setRawActivities([])

    ;(async () => {
      try {
        const token = await getValidToken()
        if (!token) throw new Error('Not authenticated')

        // Record the start time before fetching so any activity created during
        // this window is picked up on the next sync
        const fetchStart = Math.floor(Date.now() / 1000)
        const lastFetch = await idbGet<number>('activities', fetchKey(athleteId))
        const cachedIds = await idbGet<number[]>('activities', idsKey(athleteId)) ?? []

        // Fetch only activities created after the last sync
        const freshRaw: Record<string, unknown>[] = []
        let page = 1
        while (!cancelled) {
          const pageRaw = await fetchPage(token, page, lastFetch ?? undefined)
          if (cancelled) return
          freshRaw.push(...pageRaw)
          if (!cancelled) setLoadedCount(freshRaw.length)
          if (pageRaw.length < 200) break
          page++
        }

        if (cancelled) return

        // Persist fresh activities and update the ID list
        if (freshRaw.length > 0) {
          for (const a of freshRaw) {
            await idbSet('activities', actKey(athleteId, a.id as number), a)
          }
          const freshIds = freshRaw.map(a => a.id as number)
          const freshIdSet = new Set(freshIds)
          await idbSet('activities', idsKey(athleteId), [
            ...freshIds,
            ...cachedIds.filter(id => !freshIdSet.has(id)),
          ])
        }

        // Load the cached tail (everything not just fetched)
        const freshIdSet = new Set(freshRaw.map(a => a.id as number))
        const cachedKeys = cachedIds
          .filter(id => !freshIdSet.has(id))
          .map(id => actKey(athleteId, id))
        const batch = await idbGetBatch<Record<string, unknown>>('activities', cachedKeys)
        const cachedRaw = batch.filter((a): a is Record<string, unknown> => a !== null)

        if (cancelled) return

        await idbSet('activities', fetchKey(athleteId), fetchStart)

        const allRaw = [...freshRaw, ...cachedRaw]
        setRawActivities(allRaw)
        setLoadedCount(allRaw.length)
      } catch (err: unknown) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply date range and activity type filters locally — no extra API call needed
  const activities = useMemo(() => {
    const after = filters.dateRange.start
      ? Math.floor(filters.dateRange.start.getTime() / 1000)
      : undefined
    const before = filters.dateRange.end
      ? Math.floor(filters.dateRange.end.getTime() / 1000)
      : undefined
    return rawActivities
      .filter(a => {
        const ts = Math.floor(new Date(a.start_date as string).getTime() / 1000)
        if (after !== undefined && ts < after) return false
        if (before !== undefined && ts > before) return false
        return true
      })
      .map(mapActivity)
      .filter(a => a.coordinates.length > 0)
      .filter(a => serverType === 'all' || a.category === serverType)
  }, [rawActivities, filters.dateRange.start, filters.dateRange.end, serverType])

  return { activities, loading, loadedCount, error }
}
