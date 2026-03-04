import { describe, it, expect } from 'vitest'
import { mapSportType } from '../strava'

describe('mapSportType', () => {
  it('maps Ride to ride', () => {
    expect(mapSportType('Ride')).toBe('ride')
  })

  it('maps MountainBikeRide to ride', () => {
    expect(mapSportType('MountainBikeRide')).toBe('ride')
  })

  it('maps Run to run', () => {
    expect(mapSportType('Run')).toBe('run')
  })

  it('maps TrailRun to trail', () => {
    expect(mapSportType('TrailRun')).toBe('trail')
  })

  it('maps Walk to walk', () => {
    expect(mapSportType('Walk')).toBe('walk')
  })

  it('maps Hike to walk', () => {
    expect(mapSportType('Hike')).toBe('walk')
  })

  it('maps Swim to swim', () => {
    expect(mapSportType('Swim')).toBe('swim')
  })

  it('maps Kayaking to water', () => {
    expect(mapSportType('Kayaking')).toBe('water')
  })

  it('maps AlpineSki to winter', () => {
    expect(mapSportType('AlpineSki')).toBe('winter')
  })

  it('maps Yoga to workout', () => {
    expect(mapSportType('Yoga')).toBe('workout')
  })

  it('maps Soccer to sport', () => {
    expect(mapSportType('Soccer')).toBe('sport')
  })

  it('returns null for unknown sport type', () => {
    expect(mapSportType('UnknownSport')).toBeNull()
  })
})
