import type { Activity, ActivityFilterType } from '../types'
import { DISTANCE_BRACKETS, DEFAULT_POLYLINE_COLOR, CATEGORY_COLORS, resolveCategories } from './constants'

export function getActivityColor(
  activity: Activity,
  activityType: ActivityFilterType,
  distanceFilter: number | null,
  categoryColors: Record<string, string> = CATEGORY_COLORS,
  defaultColor: string = DEFAULT_POLYLINE_COLOR
): string {
  const categories = resolveCategories(activityType)

  // In 'all' mode or composite mode with no distance filter, color by activity category
  if ((!categories || categories.length > 1) && distanceFilter === null) {
    return (activity.category && categoryColors[activity.category]) || defaultColor
  }

  if (distanceFilter !== null) {
    return defaultColor
  }

  const category = activity.category
  if (!category || !DISTANCE_BRACKETS[category]) {
    return defaultColor
  }

  const brackets = DISTANCE_BRACKETS[category]
  const bracket = brackets?.find(b => activity.distance <= b.max)
  return bracket?.color ?? defaultColor
}
