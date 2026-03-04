import { useState, useMemo } from 'react'
import type { Activity, ActivityCategory } from '../types'
import { useColorScheme } from '../contexts/ColorSchemeContext'

interface DateRange {
  start: Date | null
  end: Date | null
}

interface Props {
  activities: Activity[]
  dateRange: DateRange
  onChange: (dateRange: DateRange) => void
  animationDate: Date | null
  animationCategory: ActivityCategory | null
}

const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function getWeeksInMonth(year: number, month: number): { start: Date; end: Date; label: string }[] {
  const weeks: { start: Date; end: Date; label: string }[] = []
  const first = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  const current = new Date(first)
  const dow = current.getDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  current.setDate(current.getDate() + mondayOffset)

  let weekNum = 1
  while (current <= lastDay) {
    const weekStart = new Date(Math.max(current.getTime(), first.getTime()))
    const weekEnd = new Date(current)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const clampedEnd = new Date(Math.min(weekEnd.getTime(), lastDay.getTime()))

    weeks.push({ start: weekStart, end: clampedEnd, label: `W${weekNum}` })
    current.setDate(current.getDate() + 7)
    weekNum++
  }

  return weeks
}

type Level = 'all' | 'year' | 'month' | 'week' | 'custom'

/** Derive the UI state from the dateRange prop so it stays in sync with the hash. */
function inferSelection(dateRange: DateRange): { level: Level; selectedYear: number | null; selectedMonth: number | null } {
  if (!dateRange.start || !dateRange.end) {
    return { level: 'all', selectedYear: null, selectedMonth: null }
  }

  const s = dateRange.start
  const e = dateRange.end
  const sYear = s.getFullYear()
  const eYear = e.getFullYear()

  // Full year: Jan 1 to Dec 31
  if (sYear === eYear && s.getMonth() === 0 && s.getDate() === 1 &&
      e.getMonth() === 11 && e.getDate() === 31) {
    return { level: 'year', selectedYear: sYear, selectedMonth: null }
  }

  // Full month: 1st to last day of month
  if (sYear === eYear && s.getMonth() === e.getMonth() && s.getDate() === 1) {
    const lastDay = new Date(sYear, s.getMonth() + 1, 0).getDate()
    if (e.getDate() === lastDay) {
      return { level: 'month', selectedYear: sYear, selectedMonth: s.getMonth() }
    }
  }

  // Week: same month, span <= 7 days
  if (sYear === eYear && s.getMonth() === e.getMonth()) {
    const spanDays = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)
    if (spanDays <= 7) {
      return { level: 'week', selectedYear: sYear, selectedMonth: s.getMonth() }
    }
  }

  return { level: 'custom', selectedYear: null, selectedMonth: null }
}

export function DateRangeSelector({ activities, dateRange, onChange, animationDate, animationCategory }: Props) {
  const { categoryColors } = useColorScheme()
  const [showCustom, setShowCustom] = useState(false)

  const { level, selectedYear, selectedMonth } = useMemo(
    () => showCustom ? { level: 'custom' as Level, selectedYear: null, selectedMonth: null } : inferSelection(dateRange),
    [dateRange, showCustom],
  )

  const yearData = useMemo(() => {
    const map = new Map<number, number>()
    for (const a of activities) {
      const y = new Date(a.start_date).getFullYear()
      map.set(y, (map.get(y) || 0) + 1)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b - a)
      .map(([year, count]) => ({ year, count }))
  }, [activities])

  const monthData = useMemo(() => {
    if (selectedYear === null) return []
    const map = new Map<number, number>()
    for (const a of activities) {
      const d = new Date(a.start_date)
      if (d.getFullYear() === selectedYear) {
        const m = d.getMonth()
        map.set(m, (map.get(m) || 0) + 1)
      }
    }
    return Array.from({ length: 12 }, (_, i) => ({
      month: i,
      label: SHORT_MONTH[i],
      count: map.get(i) || 0,
    }))
  }, [activities, selectedYear])

  const weekData = useMemo(() => {
    if (selectedYear === null || selectedMonth === null) return []
    const weeks = getWeeksInMonth(selectedYear, selectedMonth)
    return weeks.map(w => {
      let count = 0
      for (const a of activities) {
        const d = new Date(a.start_date)
        if (d >= w.start && d <= w.end) count++
      }
      return { ...w, count }
    })
  }, [activities, selectedYear, selectedMonth])

  const handleAll = () => {
    setShowCustom(false)
    onChange({ start: null, end: null })
  }

  const handleYear = (year: number) => {
    if (selectedYear === year && level === 'year') {
      handleAll()
      return
    }
    setShowCustom(false)
    onChange({
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31, 23, 59, 59),
    })
  }

  const handleMonth = (month: number) => {
    if (selectedYear === null) return
    if (selectedMonth === month && (level === 'month' || level === 'week')) {
      // Clicking active month → go back to year
      handleYear(selectedYear)
      return
    }
    setShowCustom(false)
    onChange({
      start: new Date(selectedYear, month, 1),
      end: new Date(selectedYear, month + 1, 0, 23, 59, 59),
    })
  }

  const handleWeek = (start: Date, end: Date) => {
    if (level === 'week' && dateRange.start?.getTime() === start.getTime()) {
      // Clicking active week → go back to month
      if (selectedYear !== null && selectedMonth !== null) {
        handleMonth(selectedMonth)
        return
      }
    }
    setShowCustom(false)
    onChange({ start, end: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59) })
  }

  const handleCustomToggle = () => {
    if (showCustom) {
      // Turning custom off — reset to all
      setShowCustom(false)
      onChange({ start: null, end: null })
    } else {
      setShowCustom(true)
    }
  }

  const isAllActive = level === 'all'

  return (
    <div className="date-range">
      <label className="section-label">Date</label>
      {/* Line 1: All / Custom */}
      <div className="date-level">
        <button className={`date-chip ${isAllActive ? 'active' : ''}`} onClick={handleAll}>
          All <span className="date-chip-count">{activities.length}</span>
        </button>
        <button
          className={`date-chip date-chip-custom ${showCustom ? 'active' : ''}`}
          onClick={handleCustomToggle}
        >
          Custom
        </button>
      </div>

      {/* Custom date inputs */}
      {showCustom && (
        <div className="date-inputs">
          <label>
            From
            <input
              type="date"
              value={dateRange.start ? toISODate(dateRange.start) : ''}
              onChange={e =>
                onChange({ ...dateRange, start: e.target.value ? new Date(e.target.value) : null })
              }
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={dateRange.end ? toISODate(dateRange.end) : ''}
              onChange={e =>
                onChange({ ...dateRange, end: e.target.value ? new Date(e.target.value) : null })
              }
            />
          </label>
        </div>
      )}

      {/* Separator + Years */}
      {!showCustom && yearData.length > 0 && (
        <>
          <div className="date-separator"><span>Year</span></div>
          <div className="date-level">
            {yearData.map(({ year, count }) => {
              const isActive = level !== 'all' && level !== 'custom' && selectedYear === year
              const isAnimating = animationDate && animationDate.getFullYear() === year && !isActive
              const animColor = isAnimating && animationCategory ? categoryColors[animationCategory] : undefined
              return (
                <button
                  key={year}
                  className={`date-chip ${isActive ? 'active' : ''}`}
                  onClick={() => handleYear(year)}
                  style={animColor ? { borderColor: animColor } : undefined}
                >
                  {year} <span className="date-chip-count">{count}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Separator + Months */}
      {selectedYear !== null && !showCustom && (
        <>
          <div className="date-separator"><span>Month</span></div>
          <div className="date-level">
            {monthData.map(({ month, label, count }) => {
              const isActive = selectedMonth === month && (level === 'month' || level === 'week')
              const isAnimating = animationDate && animationDate.getFullYear() === selectedYear && animationDate.getMonth() === month && !isActive
              const animColor = isAnimating && animationCategory ? categoryColors[animationCategory] : undefined
              return (
                <button
                  key={month}
                  className={`date-chip date-chip-sm ${isActive ? 'active' : ''}`}
                  onClick={() => handleMonth(month)}
                  disabled={count === 0}
                  style={animColor ? { borderColor: animColor } : undefined}
                >
                  {label} <span className="date-chip-count">{count}</span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* Separator + Weeks */}
      {selectedMonth !== null && !showCustom && weekData.length > 0 && (
        <>
          <div className="date-separator"><span>Week</span></div>
          <div className="date-level">
            {weekData.map((w, i) => {
              const isActive = level === 'week' && dateRange.start?.getTime() === w.start.getTime()
              const isAnimating = animationDate && animationDate >= w.start && animationDate <= w.end && !isActive
              const animColor = isAnimating && animationCategory ? categoryColors[animationCategory] : undefined
              return (
                <button
                  key={i}
                  className={`date-chip date-chip-sm ${isActive ? 'active' : ''}`}
                  onClick={() => handleWeek(w.start, w.end)}
                  disabled={w.count === 0}
                  style={animColor ? { borderColor: animColor } : undefined}
                >
                  {w.label} <span className="date-chip-count">{w.count}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
