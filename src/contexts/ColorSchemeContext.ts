import { createContext, useContext } from 'react'
import { COLOR_SCHEMES, type ColorSchemeName, type ColorScheme } from '../utils/constants'

interface ColorSchemeContextValue extends ColorScheme {
  scheme: ColorSchemeName
  setScheme: (scheme: ColorSchemeName) => void
}

export const ColorSchemeContext = createContext<ColorSchemeContextValue>({
  ...COLOR_SCHEMES.strava,
  scheme: 'strava',
  setScheme: () => {},
})

export function useColorScheme() {
  return useContext(ColorSchemeContext)
}
