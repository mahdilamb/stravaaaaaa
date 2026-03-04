import { useMemo } from 'react'
import type { Activity, ActivityCategory, ActivityFilterType } from '../types'
import { DISTANCE_CHIPS, DISTANCE_BRACKETS, resolveCategories } from '../utils/constants'

interface Props {
  activityType: ActivityFilterType
  selected: number | null
  onChange: (meters: number | null) => void
  activities: Activity[]
}

export function DistanceFilter({ activityType, selected, onChange, activities }: Props) {
  const categories = resolveCategories(activityType)
  // Hide for 'all' or composite types
  if (!categories || categories.length > 1) return null

  const singleCategory = categories[0] as ActivityCategory
  const chips = DISTANCE_CHIPS[singleCategory]
  const brackets = DISTANCE_BRACKETS[singleCategory]

  const chipCounts = useMemo(() => {
    if (!chips) return []
    const typed = activities.filter(a => a.category === singleCategory)
    return chips.map(chip => {
      const tolerance = chip.meters * 0.1
      const count = typed.filter(a => a.distance >= chip.meters - tolerance).length
      return { ...chip, count }
    })
  }, [activities, activityType, chips])

  const visibleChips = chipCounts.filter(c => c.count > 0)

  if (!chips) return null

  return (
    <div className="distance-filter">
      <label className="section-label">Distance</label>
      {visibleChips.length > 0 && (
        <div className="distance-chips">
          {visibleChips.map(chip => (
            <button
              key={chip.meters}
              className={`chip ${selected === chip.meters ? 'active' : ''}`}
              onClick={() => onChange(selected === chip.meters ? null : chip.meters)}
            >
              {chip.label} <span className="chip-count">{chip.count}</span>
            </button>
          ))}
        </div>
      )}
      {selected === null && brackets && (
        <div className="color-legend">
          {brackets.map(b => (
            <div key={b.label} className="legend-item">
              <span className="legend-swatch" style={{ backgroundColor: b.color }} />
              <span className="legend-label">{b.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
