import type { Meta, StoryObj } from '@storybook/react-vite'
import { DateRangeSelector } from '../DateRangeSelector'
import { fn } from 'storybook/test'
import type { Activity } from '../../types'

function makeActivities(dates: string[]): Activity[] {
  return dates.map((d, i) => ({
    id: i, name: `Activity ${i}`, sport_type: 'Run', category: 'run' as const,
    start_date: d, start_date_local: d,
    distance: 5000, moving_time: 1800, elapsed_time: 2000, total_elevation_gain: 50,
    polyline: null, start_latlng: null, end_latlng: null, coordinates: [],
  }))
}

const meta: Meta<typeof DateRangeSelector> = {
  title: 'Sidebar/DateRangeSelector',
  component: DateRangeSelector,
  args: {
    onChange: fn(),
    dateRange: { start: null, end: null },
    animationDate: null,
    animationCategory: null,
  },
}

export default meta
type Story = StoryObj<typeof DateRangeSelector>

export const Default: Story = {
  args: {
    activities: makeActivities([
      '2022-03-15T00:00:00Z', '2022-08-20T00:00:00Z',
      '2023-01-10T00:00:00Z', '2023-06-05T00:00:00Z',
      '2024-02-14T00:00:00Z', '2024-09-30T00:00:00Z',
    ]),
  },
}

export const WithDateRange: Story = {
  args: {
    activities: makeActivities([
      '2023-01-01T00:00:00Z', '2023-06-01T00:00:00Z', '2024-01-01T00:00:00Z',
    ]),
    dateRange: { start: new Date('2023-01-01'), end: new Date('2023-12-31') },
  },
}
