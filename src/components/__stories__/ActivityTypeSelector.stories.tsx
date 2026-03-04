import type { Meta, StoryObj } from '@storybook/react-vite'
import { ActivityTypeSelector } from '../ActivityTypeSelector'
import { fn } from 'storybook/test'

const meta: Meta<typeof ActivityTypeSelector> = {
  title: 'Sidebar/ActivityTypeSelector',
  component: ActivityTypeSelector,
  args: {
    selected: 'all',
    onChange: fn(),
    onToggleExclude: fn(),
    excludedTypes: [],
    counts: { all: 342, ride: 120, run: 95, walk: 40, trail: 25, swim: 30, water: 12, winter: 8, workout: 7, sport: 5 },
  },
}

export default meta
type Story = StoryObj<typeof ActivityTypeSelector>

export const Default: Story = {}

export const RunSelected: Story = {
  args: { selected: 'run' },
}

export const WithExclusions: Story = {
  args: { excludedTypes: ['swim', 'winter'] },
}

export const FewTypes: Story = {
  args: { counts: { all: 50, ride: 30, run: 20 } },
}
