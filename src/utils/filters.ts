import type { Activity, FilterState } from '../types'
import { resolveCategories } from './constants'

export function applyFilters(activities: Activity[], filters: FilterState): Activity[] {
  let result = activities

  const categories = resolveCategories(filters.activityType)
  if (categories) {
    result = result.filter(a => a.category != null && categories.includes(a.category))
  } else if (filters.excludedTypes.length > 0) {
    result = result.filter(a => !a.category || !filters.excludedTypes.includes(a.category))
  }

  if (filters.dateRange.start) {
    const start = filters.dateRange.start.getTime()
    result = result.filter(a => new Date(a.start_date).getTime() >= start)
  }
  if (filters.dateRange.end) {
    const end = filters.dateRange.end.getTime()
    result = result.filter(a => new Date(a.start_date).getTime() <= end)
  }

  if (filters.distanceFilter !== null) {
    const target = filters.distanceFilter
    const tolerance = target * 0.1
    result = result.filter(a => a.distance >= target - tolerance)
  }

  return result
}

export function sortByDate(activities: Activity[]): Activity[] {
  return [...activities].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  )
}
