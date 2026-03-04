import { describe, it, expect } from 'vitest'
import { stateToHash, hashToState } from '../hash'
import type { AppState } from '../hash'

const defaultState: AppState = {
  filters: {
    activityType: 'all',
    excludedTypes: [],
    dateRange: { start: null, end: null },
    distanceFilter: null,
  },
}

describe('stateToHash', () => {
  it('returns empty string for default state', () => {
    expect(stateToHash(defaultState)).toBe('')
  })

  it('encodes activity type', () => {
    const state = { ...defaultState, filters: { ...defaultState.filters, activityType: 'run' as const } }
    expect(stateToHash(state)).toContain('type=run')
  })

  it('encodes map position', () => {
    const state = { ...defaultState, lat: 51.5, lng: -0.1, zoom: 13 }
    const hash = stateToHash(state)
    expect(hash).toContain('lat=51.5')
    expect(hash).toContain('lng=-0.1')
    expect(hash).toContain('zoom=13')
  })

  it('encodes excluded types', () => {
    const state = { ...defaultState, filters: { ...defaultState.filters, excludedTypes: ['swim' as const, 'ride' as const] } }
    expect(stateToHash(state)).toContain('hide=swim,ride')
  })

  it('encodes color scheme', () => {
    const state = { ...defaultState, scheme: 'neon' as const }
    expect(stateToHash(state)).toContain('scheme=neon')
  })

  it('omits default layer and speed', () => {
    const state = { ...defaultState, layer: 'grey' as const, speed: 3 }
    expect(stateToHash(state)).toBe('')
  })
})

describe('hashToState', () => {
  it('returns null for empty hash', () => {
    expect(hashToState('')).toBeNull()
  })

  it('parses activity type', () => {
    const state = hashToState('#type=run')
    expect(state?.filters.activityType).toBe('run')
  })

  it('parses date range', () => {
    const state = hashToState('#from=2024-01-01&to=2024-12-31')
    expect(state?.filters.dateRange.start?.toISOString()).toContain('2024-01-01')
    expect(state?.filters.dateRange.end?.toISOString()).toContain('2024-12-31')
  })

  it('parses map position', () => {
    const state = hashToState('#lat=51.5&lng=-0.1&zoom=13')
    expect(state?.lat).toBe(51.5)
    expect(state?.lng).toBe(-0.1)
    expect(state?.zoom).toBe(13)
  })

  it('ignores invalid activity type', () => {
    const state = hashToState('#type=invalid')
    expect(state?.filters.activityType).toBe('all')
  })

  it('roundtrips correctly', () => {
    const original: AppState = {
      filters: {
        activityType: 'ride',
        excludedTypes: [],
        dateRange: { start: new Date('2024-01-01'), end: null },
        distanceFilter: 10000,
      },
      lat: 48.8566,
      lng: 2.3522,
      zoom: 12,
      scheme: 'vapor',
    }
    const hash = stateToHash(original)
    const parsed = hashToState(hash)!
    expect(parsed.filters.activityType).toBe('ride')
    expect(parsed.filters.distanceFilter).toBe(10000)
    expect(parsed.lat).toBe(48.8566)
    expect(parsed.scheme).toBe('vapor')
  })
})
