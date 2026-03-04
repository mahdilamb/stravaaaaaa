import { useState } from 'react'
import type { ActivityCategory, ActivityFilterType } from '../types'
import { useColorScheme } from '../contexts/ColorSchemeContext'
import { COMPOSITE_TYPES } from '../utils/constants'

interface TypeDef {
  value: ActivityFilterType
  label: string
  categories?: ActivityCategory[]
}

const GROUP_TYPES: TypeDef[] = [
  { value: 'all', label: 'All' },
  { value: 'allrun', label: 'All Runs', categories: COMPOSITE_TYPES.allrun },
]

const INDIVIDUAL_TYPES: TypeDef[] = [
  { value: 'ride', label: 'Ride' },
  { value: 'run', label: 'Run' },
  { value: 'walk', label: 'Walk' },
  { value: 'trail', label: 'Trail' },
  { value: 'swim', label: 'Swim' },
  { value: 'water', label: 'Water' },
  { value: 'winter', label: 'Winter' },
  { value: 'workout', label: 'Workout' },
  { value: 'sport', label: 'Sport' },
]

interface Props {
  selected: ActivityFilterType
  onChange: (type: ActivityFilterType) => void
  counts: Record<string, number>
  excludedTypes: ActivityCategory[]
  onToggleExclude: (type: ActivityCategory) => void
}

export function ActivityTypeSelector({ selected, onChange, counts, excludedTypes, onToggleExclude }: Props) {
  const { categoryColors } = useColorScheme()
  const [modHeld, setModHeld] = useState(false)

  const showExclude = modHeld && selected === 'all'

  // Find the active composite (if any) to scope the individual row
  const activeComposite = GROUP_TYPES.find(t => t.categories && selected === t.value)
  const compositeCategories = activeComposite?.categories

  const visibleGroups = GROUP_TYPES.filter(t => {
    if (t.value === 'all') return true
    if (t.categories) {
      return t.categories.filter(c => (counts[c] || 0) > 0).length > 1
    }
    return (counts[t.value] || 0) > 0
  })

  const visibleIndividuals = INDIVIDUAL_TYPES.filter(t => {
    if ((counts[t.value] || 0) === 0) return false
    // When a composite is selected, only show its sub-categories
    if (compositeCategories) return compositeCategories.includes(t.value as ActivityCategory)
    return true
  })

  function renderButton(t: TypeDef) {
    const count = t.categories
      ? t.categories.reduce((sum, c) => sum + (counts[c] || 0), 0)
      : (counts[t.value] || 0)
    const color = t.categories ? undefined : categoryColors[t.value]
    const isActive = selected === t.value
    const isExcluded = !t.categories && t.value !== 'all' && excludedTypes.includes(t.value as ActivityCategory)
    return (
      <button
        key={t.value}
        className={`type-btn ${isActive ? 'active' : ''} ${isExcluded ? 'excluded' : ''}`}
        onClick={e => {
          if ((e.metaKey || e.ctrlKey) && selected === 'all' && t.value !== 'all' && !t.categories) {
            e.preventDefault()
            onToggleExclude(t.value as ActivityCategory)
          } else {
            onChange(isActive && t.value !== 'all' ? 'all' : t.value)
          }
        }}
        style={color && !isActive ? { borderColor: color } : undefined}
      >
        {t.label}
        {count > 0 && <span className="type-badge">{count}</span>}
        {showExclude && !t.categories && t.value !== 'all' && (
          <span className="type-visibility">
            {isExcluded ? (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="type-selector">
      <label className="section-label">Activity Type</label>
      <div
        className="type-buttons-group"
        onMouseMove={e => setModHeld(e.metaKey || e.ctrlKey)}
        onMouseLeave={() => setModHeld(false)}
      >
        <div className="type-buttons-row">
          {visibleGroups.map(renderButton)}
        </div>
        <div className="type-buttons">
          {visibleIndividuals.map(renderButton)}
        </div>
      </div>
    </div>
  )
}
