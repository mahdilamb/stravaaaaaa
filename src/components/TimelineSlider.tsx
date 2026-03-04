import { useRef, useState, useMemo, useCallback } from 'react'
import type { Activity, ActivityFilterType } from '../types'
import type { TimelineControls } from '../hooks/useTimeline'
import { getActivityColor } from '../utils/colors'
import { useColorScheme } from '../contexts/ColorSchemeContext'

interface Props {
  activities: Activity[]
  timeline: TimelineControls
  activityType: ActivityFilterType
  distanceFilter: number | null
  onDotHover?: (index: number | null) => void
  onDotClick?: (index: number) => void
}

const SPEEDS = [1, 3, 5, 10, 25, 50, 100]

const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface DateMarker {
  position: number // percent
  label: string
  timeMs: number
}

function generateDateMarkers(firstMs: number, lastMs: number): DateMarker[] {
  const spanMs = lastMs - firstMs
  if (spanMs <= 0) return []

  const spanDays = spanMs / (1000 * 60 * 60 * 24)
  const candidates: DateMarker[] = []

  if (spanDays > 730) {
    // > 2 years: mark each Jan 1
    const startYear = new Date(firstMs).getFullYear()
    const endYear = new Date(lastMs).getFullYear()
    for (let y = startYear; y <= endYear + 1; y++) {
      const t = new Date(y, 0, 1).getTime()
      if (t >= firstMs && t <= lastMs) {
        candidates.push({ position: ((t - firstMs) / spanMs) * 100, label: String(y), timeMs: t })
      }
    }
  } else if (spanDays > 180) {
    // 6 months - 2 years: mark each quarter (Jan, Apr, Jul, Oct)
    const start = new Date(firstMs)
    const d = new Date(start.getFullYear(), start.getMonth(), 1)
    while (d.getTime() <= lastMs) {
      const t = d.getTime()
      if (t >= firstMs && [0, 3, 6, 9].includes(d.getMonth())) {
        const label = d.getMonth() === 0
          ? String(d.getFullYear())
          : `${SHORT_MONTH[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
        candidates.push({ position: ((t - firstMs) / spanMs) * 100, label, timeMs: t })
      }
      d.setMonth(d.getMonth() + 1)
    }
  } else {
    // < 6 months: mark each month
    const start = new Date(firstMs)
    const d = new Date(start.getFullYear(), start.getMonth(), 1)
    while (d.getTime() <= lastMs) {
      const t = d.getTime()
      if (t >= firstMs) {
        const label = d.getMonth() === 0
          ? `${SHORT_MONTH[0]} '${String(d.getFullYear()).slice(2)}`
          : SHORT_MONTH[d.getMonth()]
        candidates.push({ position: ((t - firstMs) / spanMs) * 100, label, timeMs: t })
      }
      d.setMonth(d.getMonth() + 1)
    }
  }

  return candidates
}

const MIN_GAP_PERCENT = 5

function cullOverlaps(markers: DateMarker[]): DateMarker[] {
  if (markers.length <= 1) return markers

  const result: DateMarker[] = []
  for (const m of markers) {
    if (m.position < 2 || m.position > 98) continue

    if (result.length === 0) {
      result.push(m)
      continue
    }

    const prev = result[result.length - 1]
    const gap = m.position - prev.position
    const minDist = MIN_GAP_PERCENT + (prev.label.length + m.label.length) * 0.4
    if (gap >= minDist) {
      result.push(m)
    }
  }

  return result
}

export function TimelineSlider({ activities, timeline, activityType, distanceFilter, onDotHover, onDotClick }: Props) {
  const { categoryColors, defaultColor } = useColorScheme()
  const trackRef = useRef<HTMLDivElement>(null)
  const [hoverInfo, setHoverInfo] = useState<{ percent: number; date: string; colors: string[] } | null>(null)

  const firstDate = activities.length > 0 ? new Date(activities[0].start_date).getTime() : 0
  const lastDate = activities.length > 0 ? new Date(activities[activities.length - 1].start_date).getTime() : 0
  const totalSpan = lastDate - firstDate || 1

  // Time-based positions for each activity
  const timePositions = useMemo(
    () =>
      activities.map(a => {
        const t = new Date(a.start_date).getTime()
        return activities.length > 1 ? ((t - firstDate) / totalSpan) * 100 : 50
      }),
    [activities, firstDate, totalSpan]
  )

  const dots = useMemo(
    () =>
      activities.map((a, i) => ({
        position: timePositions[i],
        index: i,
        color: getActivityColor(a, activityType, distanceFilter, categoryColors, defaultColor),
      })),
    [activities, timePositions, activityType, distanceFilter, categoryColors, defaultColor]
  )

  const dateMarkers = useMemo(() => {
    if (activities.length < 2) return []
    return cullOverlaps(generateDateMarkers(firstDate, lastDate))
  }, [activities.length, firstDate, lastDate])

  const getPercentFromEvent = useCallback((e: MouseEvent | React.MouseEvent) => {
    const track = trackRef.current
    if (!track) return 0
    const rect = track.getBoundingClientRect()
    const padding = parseFloat(getComputedStyle(track).paddingLeft) || 0
    const innerWidth = rect.width - padding * 2
    return ((e.clientX - rect.left - padding) / innerWidth) * 100
  }, [])

  // Seek by percentage → convert to time
  const seekByPercent = useCallback((percent: number) => {
    const clamped = Math.max(0, Math.min(100, percent))
    const targetTime = firstDate + (clamped / 100) * totalSpan
    timeline.seekTime(targetTime)
  }, [firstDate, totalSpan, timeline])

  const handlePointerDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    if (!timeline.animateEnabled) {
      timeline.setAnimateEnabled(true)
    }
    const percent = getPercentFromEvent(e)
    seekByPercent(percent)

    const onMove = (ev: MouseEvent) => {
      seekByPercent(getPercentFromEvent(ev))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [getPercentFromEvent, seekByPercent, timeline])

  const handleTrackHover = useCallback((e: React.MouseEvent) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    const padding = parseFloat(getComputedStyle(track).paddingLeft) || 0
    const innerWidth = rect.width - padding * 2
    const percent = ((e.clientX - rect.left - padding) / innerWidth) * 100
    const hoverTime = firstDate + (Math.max(0, Math.min(100, percent)) / 100) * totalSpan
    const hoverDate = new Date(hoverTime)
    const dayStart = new Date(hoverDate.getFullYear(), hoverDate.getMonth(), hoverDate.getDate()).getTime()
    const dayEnd = dayStart + 86400000

    // Find activities on this day
    const dayColors: string[] = []
    const seen = new Set<string>()
    for (const a of activities) {
      const t = new Date(a.start_date).getTime()
      if (t >= dayStart && t < dayEnd) {
        const c = getActivityColor(a, activityType, distanceFilter, categoryColors, defaultColor)
        if (!seen.has(c)) {
          seen.add(c)
          dayColors.push(c)
        }
      }
    }

    setHoverInfo({
      percent,
      date: hoverDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
      colors: dayColors.length > 0 ? dayColors : ['#888'],
    })
  }, [activities, activityType, distanceFilter, firstDate, totalSpan])

  const handleTrackLeave = useCallback(() => setHoverInfo(null), [])

  if (activities.length === 0) return null

  // Thumb position based on currentTime in the time range
  const thumbPercent = timeline.animateEnabled && timeline.currentTime > 0
    ? Math.max(0, Math.min(100, ((timeline.currentTime - firstDate) / totalSpan) * 100))
    : 0

  return (
    <div className="timeline">
      <div
        className="timeline-track-container"
        ref={trackRef}
        onMouseDown={handlePointerDown}
        onMouseMove={handleTrackHover}
        onMouseLeave={handleTrackLeave}
      >
        <div className="timeline-date-markers">
          {dateMarkers.map((m, i) => {
            const isPast = timeline.animateEnabled && m.timeMs <= timeline.currentTime
            return (
              <div key={i} className={`timeline-marker ${isPast ? 'past' : ''}`} style={{ left: `${m.position}%` }}>
                <div className="timeline-marker-tick" />
                <span className="timeline-marker-label">{m.label}</span>
              </div>
            )
          })}
        </div>
        <div className="timeline-track-bar" />
        <div className="timeline-dots">
          {dots.map((dot, i) => (
            <div
              key={i}
              className={`timeline-dot ${!timeline.animateEnabled || i < timeline.currentIndex ? 'active' : 'future'}`}
              style={{
                left: `${dot.position}%`,
                backgroundColor: dot.color,
              }}
              onMouseEnter={() => onDotHover?.(dot.index)}
              onMouseLeave={() => onDotHover?.(null)}
              onClick={(e) => { e.stopPropagation(); onDotClick?.(dot.index) }}
            />
          ))}
          {hoverInfo && (
            <div
              className="timeline-tooltip"
              style={{
                left: `${hoverInfo.percent}%`,
                background: hoverInfo.colors.length === 1
                  ? hoverInfo.colors[0]
                  : `repeating-linear-gradient(135deg, ${hoverInfo.colors.map((c, i) => `${c} ${i * 6}px, ${c} ${(i + 1) * 6}px`).join(', ')})`,
              }}
            >
              {hoverInfo.date}
            </div>
          )}
        </div>
        {timeline.animateEnabled && (
          <div className="timeline-thumb-track">
            <div
              className="timeline-thumb"
              style={{ left: `${thumbPercent}%` }}
            />
          </div>
        )}
      </div>

      <div className="timeline-controls">
        <button
          className={`timeline-showall-btn ${!timeline.animateEnabled ? 'active' : ''}`}
          onClick={() => {
            if (timeline.animateEnabled) {
              timeline.pause()
              timeline.setAnimateEnabled(false)
            } else {
              timeline.setAnimateEnabled(true)
            }
          }}
          title={timeline.animateEnabled ? 'Show all activities' : 'Enable animation'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </button>
        <button className={`timeline-play-btn ${!timeline.animateEnabled ? 'muted' : ''}`} onClick={timeline.toggle}>
          {timeline.isPlaying ? '\u23F8' : '\u25B6'}
        </button>
        <button
          className="timeline-reset-btn"
          onClick={() => timeline.seek(0)}
          disabled={!timeline.animateEnabled}
          title="Reset to start"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
        </button>
        <button
          className={`timeline-mode-btn ${timeline.mode === 'follow' ? 'active' : ''}`}
          onClick={() => timeline.setMode(timeline.mode === 'overview' ? 'follow' : 'overview')}
          disabled={!timeline.animateEnabled}
          title={timeline.mode === 'overview' ? 'Switch to follow mode' : 'Switch to overview mode'}
        >
          {timeline.mode === 'overview' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
          )}
        </button>

        <div className="timeline-controls-spacer" />

        <div className="timeline-speed">
          {SPEEDS.map(s => (
            <button
              key={s}
              className={`speed-btn ${timeline.speed === s ? 'active' : ''}`}
              onClick={() => timeline.setSpeed(s)}
              disabled={!timeline.animateEnabled}
            >
              {s}x
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}
