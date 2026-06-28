import { useState, useRef, useEffect, useMemo } from 'react'
import type { FilterState, Activity, ActivityCategory } from '../types'
import type { CityInfo } from '../hooks/useGeocodeCache'
import type { BorderMode } from './Map'
import { SCHEME_NAMES, COLOR_SCHEMES, resolveCategories } from '../utils/constants'
import { useColorScheme } from '../contexts/ColorSchemeContext'
import { ActivityTypeSelector } from './ActivityTypeSelector'
import { DateRangeSelector } from './DateRangeSelector'
import { DistanceFilter } from './DistanceFilter'
import { CitySelector } from './CitySelector'

interface Props {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  loading: boolean
  loadedCount: number
  activityCount: number
  typeCounts: Record<string, number>
  activities: Activity[]
  cities: CityInfo[]
  animationCity: string | null
  onCityClick: (city: CityInfo) => void
  onLogout: () => void
  onSettings: () => void
  athleteName?: string
  collapsed: boolean
  onToggle: () => void
  animationDate: Date | null
  animationCategory: ActivityCategory | null
  borderMode: BorderMode
  onBorderModeChange: (mode: BorderMode) => void
}

function ColorSchemePicker() {
  const { scheme, setScheme } = useColorScheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const active = COLOR_SCHEMES[scheme]

  return (
    <div className="scheme-dropdown" ref={ref}>
      <button className="scheme-dropdown-btn" onClick={() => setOpen(v => !v)}>
        <div className="scheme-dots">
          {Object.values(active.categoryColors).slice(0, 5).map((c, i) => (
            <span key={i} className="scheme-dot" style={{ backgroundColor: c }} />
          ))}
        </div>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="scheme-dropdown-menu">
          {SCHEME_NAMES.map(name => {
            const s = COLOR_SCHEMES[name]
            const colors = Object.values(s.categoryColors)
            return (
              <button
                key={name}
                className={`scheme-dropdown-item ${scheme === name ? 'active' : ''}`}
                onClick={() => { setScheme(name); setOpen(false) }}
              >
                <div className="scheme-dots">
                  {colors.slice(0, 5).map((c, i) => (
                    <span key={i} className="scheme-dot" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <span className="scheme-label">{s.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ filters, onFiltersChange, loading, loadedCount, activityCount, typeCounts, activities, cities, animationCity, onCityClick, onLogout, onSettings, athleteName, collapsed, onToggle, animationDate, animationCategory, borderMode, onBorderModeChange }: Props) {
  // Filter activities by date range so distance chips reflect the selected year
  const dateFilteredActivities = useMemo(() => {
    if (!filters.dateRange.start && !filters.dateRange.end) return activities
    return activities.filter(a => {
      const t = new Date(a.start_date).getTime()
      if (filters.dateRange.start && t < filters.dateRange.start.getTime()) return false
      if (filters.dateRange.end && t > filters.dateRange.end.getTime()) return false
      return true
    })
  }, [activities, filters.dateRange])

  // Filter activities by distance so year chips reflect the selected distance
  const distanceFilteredActivities = useMemo(() => {
    if (filters.distanceFilter === null) return activities
    const categories = resolveCategories(filters.activityType)
    const tolerance = filters.distanceFilter * 0.1
    const minDistance = filters.distanceFilter - tolerance
    if (!categories || categories.length > 1) {
      return activities.filter(a => a.distance >= minDistance)
    }
    const cat = categories[0]
    return activities.filter(a => a.category === cat && a.distance >= minDistance)
  }, [activities, filters.distanceFilter, filters.activityType])

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <button className="sidebar-toggle" onClick={onToggle} title={collapsed ? 'Show sidebar' : 'Hide sidebar'}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {collapsed
            ? <polyline points="9 18 15 12 9 6" />
            : <polyline points="15 18 9 12 15 6" />
          }
        </svg>
      </button>
      {!collapsed && (
        <>
        <div className="sidebar-content">
          <div className="sidebar-header">
            <div className="sidebar-title-row">
              <h1>Stravaaaaaa</h1>
              <div className="sidebar-pickers">
                <button
                  className="border-mode-toggle"
                  onClick={() => onBorderModeChange(borderMode === 'dark' ? 'light' : 'dark')}
                  title={`Switch to ${borderMode === 'dark' ? 'light' : 'dark'} mode`}
                >
                  {borderMode === 'dark' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="5" />
                      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                  )}
                </button>
                <ColorSchemePicker />
              </div>
            </div>
            <div className="sidebar-meta">
              {athleteName && <span className="athlete-name">{athleteName}</span>}
              <button className="logout-btn" onClick={onLogout}>Logout</button>
              <button className="settings-icon-btn" onClick={onSettings} title="Settings" aria-label="Settings">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
          </div>

          <ActivityTypeSelector
            selected={filters.activityType}
            onChange={type => onFiltersChange({ ...filters, activityType: type, excludedTypes: [], distanceFilter: null })}
            counts={typeCounts}
            excludedTypes={filters.excludedTypes}
            onToggleExclude={type => {
              const excluded = filters.excludedTypes.includes(type)
                ? filters.excludedTypes.filter(t => t !== type)
                : [...filters.excludedTypes, type]
              onFiltersChange({ ...filters, excludedTypes: excluded })
            }}
          />

          <DistanceFilter
            activityType={filters.activityType}
            selected={filters.distanceFilter}
            onChange={distanceFilter => onFiltersChange({ ...filters, distanceFilter })}
            activities={dateFilteredActivities}
          />

          <DateRangeSelector
            activities={distanceFilteredActivities}
            dateRange={filters.dateRange}
            onChange={dateRange => onFiltersChange({ ...filters, dateRange })}
            animationDate={animationDate}
            animationCategory={animationCategory}
          />

          <CitySelector
            cities={cities}
            animationCity={animationCity}
            animationCategory={animationCategory}
            onCityClick={onCityClick}
          />
        </div>
        <div className="sidebar-footer">
          <span className="activity-count">
            {loading ? `Loading... ${loadedCount}` : `${activityCount} activities`}
          </span>
          <a
            className="strava-powered"
            href="https://www.strava.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img
              src={`${import.meta.env.BASE_URL}strava-powered.svg`}
              alt="Powered by Strava"
              className="strava-logo"
            />
          </a>
        </div>
        </>
      )}
    </aside>
  )
}
