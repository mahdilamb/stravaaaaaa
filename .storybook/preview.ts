import type { Preview } from '@storybook/react-vite'
import React from 'react'
import '../src/styles/App.css'
import '../src/styles/Sidebar.css'
import { ColorSchemeContext } from '../src/contexts/ColorSchemeContext'
import { COLOR_SCHEMES, type ColorSchemeName } from '../src/utils/constants'

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: 'dark',
      values: [{ name: 'dark', value: '#1a1a2e' }],
    },
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
    a11y: {
      test: 'todo'
    }
  },
  argTypes: {
    scheme: {
      control: 'select',
      options: ['strava', 'neon', 'pastel', 'vapor', 'mono'],
    },
  },
  args: {
    scheme: 'strava',
  },
  decorators: [
    (Story, context) => {
      const scheme = (context.args.scheme || 'strava') as ColorSchemeName
      const value = {
        ...COLOR_SCHEMES[scheme],
        scheme,
        setScheme: () => {},
      }
      return React.createElement(
        ColorSchemeContext.Provider,
        { value },
        React.createElement(Story)
      )
    },
  ],
};

export default preview;