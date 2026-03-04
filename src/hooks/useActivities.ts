import { useState, useEffect, useMemo } from 'react'
import type { Activity, ActivityCategory, FilterState } from '../types'
import { decodePolyline } from '../utils/polyline'
import { COMPOSITE_TYPES } from '../utils/constants'

const SPORT_TYPE_MAP: Record<string, ActivityCategory> = {
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

export function useActivities(filters: FilterState) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(false)
  const [loadedCount, setLoadedCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Composite types (allrun, allride) need all data — client-side filtering handles them
  const serverType = useMemo(
    () => filters.activityType in COMPOSITE_TYPES ? 'all' : filters.activityType,
    [filters.activityType]
  )

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    setLoadedCount(0)

    const params = new URLSearchParams({ stream: '1' })
    if (serverType !== 'all') params.set('sport_type', serverType)

    ;(async () => {
      try {
        const res = await fetch(`/api/activities?${params}`, {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        const all: Activity[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop()! // keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue
            const chunk = JSON.parse(line)
            const mapped = (chunk.activities as Array<Record<string, unknown>>)
              .map(mapActivity)
              .filter(a => a.coordinates.length > 0)
            all.push(...mapped)
            setLoadedCount(all.length)
            setActivities([...all])
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          const chunk = JSON.parse(buffer)
          const mapped = (chunk.activities as Array<Record<string, unknown>>)
            .map(mapActivity)
            .filter(a => a.coordinates.length > 0)
          all.push(...mapped)
          setActivities([...all])
          setLoadedCount(all.length)
        }
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') setError((err as Error).message)
      } finally {
        setLoading(false)
      }
    })()

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverType])

  return { activities, loading, loadedCount, error }
}
