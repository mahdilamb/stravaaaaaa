import { useState, useCallback, useEffect, useMemo } from 'react'
import type { Activity } from '../types'

export type AnimationMode = 'overview' | 'follow'

export interface TimelineControls {
  isPlaying: boolean
  currentIndex: number
  currentTime: number
  activityProgress: number
  trailMode: boolean
  visibleActivities: Activity[]
  play: () => void
  pause: () => void
  toggle: () => void
  seek: (index: number) => void
  seekTime: (timeMs: number) => void
  speed: number
  setSpeed: (activitiesPerSecond: number) => void
  mode: AnimationMode
  setMode: (mode: AnimationMode) => void
  freeze: () => void
  unfreeze: () => void
  animateEnabled: boolean
  setAnimateEnabled: (enabled: boolean) => void
}

export function useTimeline(sortedActivities: Activity[]): TimelineControls {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [speed, setSpeed] = useState(3)
  const [mode, setMode] = useState<AnimationMode>('overview')
  const [frozen, setFrozen] = useState(false)
  const [animateEnabled, setAnimateEnabled] = useState(false)
  const [activityProgress, setActivityProgress] = useState(1)

  const trailMode = true

  // Precompute activity timestamps
  const activityTimes = useMemo(
    () => sortedActivities.map(a => new Date(a.start_date).getTime()),
    [sortedActivities]
  )

  // Derive currentIndex from currentTime via binary search
  const currentIndex = useMemo(() => {
    if (activityTimes.length === 0) return 0
    let lo = 0, hi = activityTimes.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (activityTimes[mid] <= currentTime) lo = mid + 1
      else hi = mid
    }
    return lo
  }, [activityTimes, currentTime])

  // When activities change, clamp time
  useEffect(() => {
    if (activityTimes.length === 0) return
    const lastTime = activityTimes[activityTimes.length - 1]
    setCurrentTime(prev => prev > lastTime ? lastTime : prev)
  }, [activityTimes])

  // Animation loop
  useEffect(() => {
    if (!isPlaying || frozen) return
    const total = activityTimes.length
    if (total === 0) return

    if (!trailMode) {
      // Fast mode (>5x): skip straight to next activity
      const timer = setInterval(() => {
        setActivityProgress(1)
        setCurrentTime(prevTime => {
          let lo = 0, hi = total
          while (lo < hi) {
            const mid = (lo + hi) >>> 1
            if (activityTimes[mid] <= prevTime) lo = mid + 1
            else hi = mid
          }
          if (lo >= total) {
            setIsPlaying(false)
            return prevTime
          }
          return activityTimes[lo]
        })
      }, 1000 / speed)
      return () => clearInterval(timer)
    }

    // Trail mode (≤5x): animate progress within each activity
    // Each activity takes ~(1/speed) seconds to draw its trail
    const TICK_MS = 25
    const progressPerTick = (speed * TICK_MS) / 1000
    const timer = setInterval(() => {
      setActivityProgress(prev => {
        const next = prev + progressPerTick
        if (next >= 1) {
          // Move to next activity
          setCurrentTime(prevTime => {
            let lo = 0, hi = total
            while (lo < hi) {
              const mid = (lo + hi) >>> 1
              if (activityTimes[mid] <= prevTime) lo = mid + 1
              else hi = mid
            }
            if (lo >= total) {
              setIsPlaying(false)
              return prevTime
            }
            return activityTimes[lo]
          })
          return 0
        }
        return next
      })
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [isPlaying, frozen, speed, trailMode, activityTimes])

  const play = useCallback(() => {
    if (activityTimes.length === 0) return
    setAnimateEnabled(true)
    setCurrentTime(prev => {
      const lastTime = activityTimes[activityTimes.length - 1]
      if (prev >= lastTime) {
        setActivityProgress(0)
        return 0
      }
      return prev
    })
    setActivityProgress(0)
    setIsPlaying(true)
  }, [activityTimes])

  const pause = useCallback(() => setIsPlaying(false), [])

  const toggle = useCallback(() => {
    if (isPlaying) pause()
    else play()
  }, [isPlaying, play, pause])

  const seek = useCallback(
    (index: number) => {
      const clamped = Math.min(index, sortedActivities.length)
      if (clamped <= 0) {
        setCurrentTime(0)
      } else {
        setCurrentTime(activityTimes[clamped - 1])
      }
    },
    [sortedActivities.length, activityTimes]
  )

  const seekTime = useCallback((timeMs: number) => {
    setCurrentTime(timeMs)
  }, [])

  const freeze = useCallback(() => setFrozen(true), [])
  const unfreeze = useCallback(() => setFrozen(false), [])

  const visibleActivities = animateEnabled
    ? sortedActivities.slice(0, currentIndex)
    : sortedActivities

  return {
    isPlaying, currentIndex, currentTime, activityProgress, trailMode,
    visibleActivities,
    play, pause, toggle, seek, seekTime,
    speed, setSpeed, mode, setMode, freeze, unfreeze,
    animateEnabled, setAnimateEnabled,
  }
}
