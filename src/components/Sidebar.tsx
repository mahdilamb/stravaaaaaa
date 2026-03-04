import { useState, useRef, useEffect } from 'react'
import type { FilterState, Activity, ActivityCategory } from '../types'
import type { CityInfo } from '../hooks/useGeocodeCache'
import { SCHEME_NAMES, COLOR_SCHEMES } from '../utils/constants'
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
  athleteName?: string
  collapsed: boolean
  onToggle: () => void
  animationDate: Date | null
  animationCategory: ActivityCategory | null
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

export function Sidebar({ filters, onFiltersChange, loading, loadedCount, activityCount, typeCounts, activities, cities, animationCity, onCityClick, onLogout, athleteName, collapsed, onToggle, animationDate, animationCategory }: Props) {
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
              <ColorSchemePicker />
            </div>
            <div className="sidebar-meta">
              {athleteName && <span className="athlete-name">{athleteName}</span>}
              <button className="logout-btn" onClick={onLogout}>Logout</button>
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
            activities={activities}
          />

          <DateRangeSelector
            activities={activities}
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
              src="https://static.strava.com/images/api/api_logo_pwrdBy_orangeDark.svg"
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
