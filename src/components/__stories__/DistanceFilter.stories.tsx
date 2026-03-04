import type { Meta, StoryObj } from '@storybook/react-vite'
import { DistanceFilter } from '../DistanceFilter'
import { fn } from 'storybook/test'
import type { Activity } from '../../types'

function makeActivities(category: string, distances: number[]): Activity[] {
  return distances.map((d, i) => ({
    id: i, name: `Activity ${i}`, sport_type: 'Run', category: category as Activity['category'],
    start_date: '2024-01-01T00:00:00Z', start_date_local: '2024-01-01T00:00:00Z',
    distance: d, moving_time: 1800, elapsed_time: 2000, total_elevation_gain: 50,
    polyline: null, start_latlng: null, end_latlng: null, coordinates: [],
  }))
}

const meta: Meta<typeof DistanceFilter> = {
  title: 'Sidebar/DistanceFilter',
  component: DistanceFilter,
  args: {
    selected: null,
    onChange: fn(),
  },
}

export default meta
type Story = StoryObj<typeof DistanceFilter>

export const AllMode: Story = {
  args: {
    activityType: 'all',
    activities: [],
  },
}

export const RunWithChips: Story = {
  args: {
    activityType: 'run',
    activities: makeActivities('run', [3000, 5200, 9800, 10500, 21000, 42500]),
  },
}

export const RunWith10kSelected: Story = {
  args: {
    activityType: 'run',
    selected: 10000,
    activities: makeActivities('run', [3000, 5200, 9800, 10500, 21000, 42500]),
  },
}

export const RideWithChips: Story = {
  args: {
    activityType: 'ride',
    activities: makeActivities('ride', [25000, 55000, 80000, 105000, 165000]),
  },
}
