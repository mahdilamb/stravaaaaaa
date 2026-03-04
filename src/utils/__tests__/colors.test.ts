import { describe, it, expect } from 'vitest'
import { getActivityColor } from '../colors'
import { CATEGORY_COLORS, DEFAULT_POLYLINE_COLOR, DISTANCE_BRACKETS } from '../constants'
import type { Activity } from '../../types'

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 1, name: 'Test', sport_type: 'Run', category: 'run',
    start_date: '2024-01-01T00:00:00Z', start_date_local: '2024-01-01T00:00:00Z',
    distance: 5000, moving_time: 1800, elapsed_time: 2000, total_elevation_gain: 50,
    polyline: null, start_latlng: null, end_latlng: null, coordinates: [],
    ...overrides,
  }
}

describe('getActivityColor', () => {
  it('returns category color in all mode with no distance filter', () => {
    const act = makeActivity({ category: 'run' })
    expect(getActivityColor(act, 'all', null)).toBe(CATEGORY_COLORS.run)
  })

  it('returns default color for null category in all mode', () => {
    const act = makeActivity({ category: null })
    expect(getActivityColor(act, 'all', null)).toBe(DEFAULT_POLYLINE_COLOR)
  })

  it('returns default color when distance filter is set', () => {
    const act = makeActivity({ category: 'run' })
    expect(getActivityColor(act, 'all', 5000)).toBe(DEFAULT_POLYLINE_COLOR)
  })

  it('returns bracket color for specific type without distance filter', () => {
    const act = makeActivity({ category: 'run', distance: 3000 })
    const bracket = DISTANCE_BRACKETS.run!.find(b => 3000 <= b.max)
    expect(getActivityColor(act, 'run', null)).toBe(bracket!.color)
  })

  it('returns default for category without brackets', () => {
    const act = makeActivity({ category: 'workout' })
    expect(getActivityColor(act, 'workout', null)).toBe(DEFAULT_POLYLINE_COLOR)
  })

  it('accepts custom category colors', () => {
    const act = makeActivity({ category: 'ride' })
    const custom = { ride: '#FF0000' }
    expect(getActivityColor(act, 'all', null, custom)).toBe('#FF0000')
  })
})
