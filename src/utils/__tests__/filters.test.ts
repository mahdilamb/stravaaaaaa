import { describe, it, expect } from 'vitest'
import { applyFilters, sortByDate } from '../filters'
import type { Activity, FilterState } from '../../types'

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 1, name: 'Test', sport_type: 'Run', category: 'run',
    start_date: '2024-06-15T00:00:00Z', start_date_local: '2024-06-15T00:00:00Z',
    distance: 5000, moving_time: 1800, elapsed_time: 2000, total_elevation_gain: 50,
    polyline: null, start_latlng: null, end_latlng: null, coordinates: [],
    ...overrides,
  }
}

const baseFilters: FilterState = {
  activityType: 'all',
  excludedTypes: [],
  dateRange: { start: null, end: null },
  distanceFilter: null,
}

describe('applyFilters', () => {
  const activities = [
    makeActivity({ id: 1, category: 'run', distance: 5000 }),
    makeActivity({ id: 2, category: 'ride', distance: 50000 }),
    makeActivity({ id: 3, category: 'swim', distance: 1000 }),
  ]

  it('returns all when no filters applied', () => {
    expect(applyFilters(activities, baseFilters)).toHaveLength(3)
  })

  it('filters by activity type', () => {
    const result = applyFilters(activities, { ...baseFilters, activityType: 'run' })
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('run')
  })

  it('excludes types in all mode', () => {
    const result = applyFilters(activities, { ...baseFilters, excludedTypes: ['swim'] })
    expect(result).toHaveLength(2)
    expect(result.every(a => a.category !== 'swim')).toBe(true)
  })

  it('filters by date range', () => {
    const acts = [
      makeActivity({ id: 1, start_date: '2024-01-01T00:00:00Z' }),
      makeActivity({ id: 2, start_date: '2024-06-01T00:00:00Z' }),
      makeActivity({ id: 3, start_date: '2024-12-01T00:00:00Z' }),
    ]
    const filters = {
      ...baseFilters,
      dateRange: { start: new Date('2024-03-01'), end: new Date('2024-09-01') },
    }
    expect(applyFilters(acts, filters)).toHaveLength(1)
  })

  it('filters by distance with 10% tolerance', () => {
    const acts = [
      makeActivity({ id: 1, distance: 4400 }),
      makeActivity({ id: 2, distance: 4600 }),
      makeActivity({ id: 3, distance: 10000 }),
    ]
    const result = applyFilters(acts, { ...baseFilters, distanceFilter: 5000 })
    expect(result).toHaveLength(2)
    expect(result.map(a => a.id)).toEqual([2, 3])
  })
})

describe('sortByDate', () => {
  it('sorts activities chronologically', () => {
    const acts = [
      makeActivity({ id: 3, start_date: '2024-12-01T00:00:00Z' }),
      makeActivity({ id: 1, start_date: '2024-01-01T00:00:00Z' }),
      makeActivity({ id: 2, start_date: '2024-06-01T00:00:00Z' }),
    ]
    const sorted = sortByDate(acts)
    expect(sorted.map(a => a.id)).toEqual([1, 2, 3])
  })

  it('does not mutate the original array', () => {
    const acts = [
      makeActivity({ id: 2, start_date: '2024-06-01T00:00:00Z' }),
      makeActivity({ id: 1, start_date: '2024-01-01T00:00:00Z' }),
    ]
    sortByDate(acts)
    expect(acts[0].id).toBe(2)
  })
})
