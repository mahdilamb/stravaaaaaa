import { useState, useMemo } from 'react'
import type { ActivityCategory } from '../types'
import type { CityInfo } from '../hooks/useGeocodeCache'
import { useColorScheme } from '../contexts/ColorSchemeContext'

interface Props {
  cities: CityInfo[]
  animationCity: string | null
  animationCategory: ActivityCategory | null
  onCityClick: (city: CityInfo) => void
}

function parseCityCountry(name: string): { city: string; country: string } {
  const idx = name.lastIndexOf(', ')
  if (idx < 0) return { city: name, country: '' }
  return { city: name.slice(0, idx), country: name.slice(idx + 2) }
}

const MAX_VISIBLE = 8

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })

function displayCountry(code: string): string {
  if (!code || code.length !== 2) return code
  try {
    return countryNames.of(code.toUpperCase()) ?? code
  } catch {
    return code
  }
}

export function CitySelector({ cities, animationCity, animationCategory, onCityClick }: Props) {
  const { categoryColors } = useColorScheme()
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [showAllCountries, setShowAllCountries] = useState(false)
  const [showAllCities, setShowAllCities] = useState(false)

  const countries = useMemo(() => {
    const map = new Map<string, { count: number; cities: CityInfo[] }>()
    for (const c of cities) {
      const { country } = parseCityCountry(c.name)
      const key = country || 'Other'
      const existing = map.get(key)
      if (existing) {
        existing.count += c.count
        existing.cities.push(c)
      } else {
        map.set(key, { count: c.count, cities: [c] })
      }
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        cities: data.cities.sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => b.count - a.count)
  }, [cities])

  const selectedCities = useMemo(() => {
    if (!selectedCountry) return []
    return countries.find(c => c.name === selectedCountry)?.cities ?? []
  }, [selectedCountry, countries])

  const animCountry = animationCity ? (parseCityCountry(animationCity).country || 'Other') : null
  const animCityName = animationCity ? parseCityCountry(animationCity).city : null

  if (cities.length === 0) return null

  const visibleCountries = showAllCountries ? countries : countries.slice(0, MAX_VISIBLE)
  const visibleCities = showAllCities ? selectedCities : selectedCities.slice(0, MAX_VISIBLE)

  return (
    <div className="city-selector">
      <label className="section-label">Location</label>
      <div className="date-level">
        {visibleCountries.map(c => {
          const isActive = selectedCountry === c.name
          const isAnim = !isActive && animCountry === c.name
          const animColor = isAnim && animationCategory ? categoryColors[animationCategory] : undefined
          return (
            <button
              key={c.name}
              className={`date-chip ${isActive ? 'active' : ''}`}
              onClick={() => {
                setSelectedCountry(isActive ? null : c.name)
                setShowAllCities(false)
              }}
              style={animColor ? { borderColor: animColor } : undefined}
            >
              {displayCountry(c.name)} <span className="date-chip-count">{c.count}</span>
            </button>
          )
        })}
        {countries.length > MAX_VISIBLE && (
          <button
            className="date-chip date-chip-sm"
            onClick={() => setShowAllCountries(v => !v)}
          >
            {showAllCountries ? 'less' : `+${countries.length - MAX_VISIBLE} more`}
          </button>
        )}
      </div>

      {selectedCountry && selectedCities.length > 0 && (
        <>
          <div className="date-separator"><span>City</span></div>
          <div className="date-level">
            {visibleCities.map(c => {
              const { city } = parseCityCountry(c.name)
              const isAnim = animationCity === c.name
              const animColor = isAnim && animationCategory ? categoryColors[animationCategory] : undefined
              return (
                <button
                  key={c.name}
                  className="date-chip date-chip-sm"
                  onClick={() => onCityClick(c)}
                  style={animColor ? { borderColor: animColor } : undefined}
                >
                  {city} <span className="date-chip-count">{c.count}</span>
                </button>
              )
            })}
            {selectedCities.length > MAX_VISIBLE && (
              <button
                className="date-chip date-chip-sm"
                onClick={() => setShowAllCities(v => !v)}
              >
                {showAllCities ? 'less' : `+${selectedCities.length - MAX_VISIBLE} more`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
