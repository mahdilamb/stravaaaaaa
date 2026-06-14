import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { authRouter, getValidToken, getVisitorId } from './auth.js'
import { getAllActivities, getActivitiesPage, getActivityStreams, mapSportType } from './strava.js'
import { cacheGet, cacheSet, redis } from './cache.js'
import { registerHeatmapRoutes } from './heatmap.js'
import { registerTileRoutes } from './tiles.js'
import { webhookRouter } from './webhook.js'

const app = express()
const PORT = process.env.SERVER_PORT || 3001

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }))
app.use(cookieParser())
app.use(express.json())

app.use('/api/auth', authRouter)

app.get('/api/activities', async (req, res) => {
  try {
    const visitorId = getVisitorId(req)
    if (!visitorId) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    const token = await getValidToken(visitorId)
    const { sport_type, after, before, stream } = req.query

    if (stream === '1') {
      // Stream NDJSON: one line per page for progress tracking
      res.setHeader('Content-Type', 'application/x-ndjson')
      res.setHeader('Transfer-Encoding', 'chunked')
      let page = 1
      while (true) {
        const activities = await getActivitiesPage(
          token,
          visitorId,
          page,
          after ? Number(after) : undefined,
          before ? Number(before) : undefined
        )
        let filtered = activities
        if (sport_type && sport_type !== 'all') {
          filtered = activities.filter(a => mapSportType(a.sport_type) === sport_type)
        }
        res.write(JSON.stringify({ activities: filtered, done: activities.length < 200 }) + '\n')
        if (activities.length < 200) break
        page++
      }
      res.end()
      return
    }

    const activities = await getAllActivities(token, visitorId, {
      after: after ? Number(after) : undefined,
      before: before ? Number(before) : undefined,
    })

    // Filter by sport type (Strava API doesn't support this natively)
    let filtered = activities
    if (sport_type && sport_type !== 'all') {
      filtered = activities.filter(a => mapSportType(a.sport_type) === sport_type)
    }

    res.json(filtered)
  } catch (err) {
    console.error('Failed to fetch activities:', err)
    res.status(500).json({ error: 'Failed to fetch activities' })
  }
})

app.get('/api/activities/:id/streams', async (req, res) => {
  try {
    const visitorId = getVisitorId(req)
    if (!visitorId) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    const token = await getValidToken(visitorId)
    const latlngs = await getActivityStreams(token, Number(req.params.id))
    res.json(latlngs)
  } catch (err) {
    console.error('Failed to fetch streams:', err)
    res.status(500).json({ error: 'Failed to fetch streams' })
  }
})

registerHeatmapRoutes(app)
registerTileRoutes(app)
app.use('/api/webhook', webhookRouter)

// Rate-limit geocoding: sequential with 1.1s delay (Nominatim policy)
let geocodeQueue: Promise<void> = Promise.resolve()

function geocodeThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const result = geocodeQueue.then(async () => {
    await new Promise(r => setTimeout(r, 1100))
    return fn()
  })
  geocodeQueue = result.then(() => {}, () => {})
  return result
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&accept-language=en`

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'StravaActivityMap/1.0' } })

      if (response.status === 429) {
        const wait = (attempt + 1) * 5000
        console.log(`[geocode] 429 rate-limited, waiting ${wait}ms...`)
        await new Promise(r => setTimeout(r, wait))
        continue
      }

      if (!response.ok) return null

      const data = await response.json()
      const addr = data.address
      if (!addr) return null
      const place = addr.city || addr.town || addr.village || addr.county || addr.state || null
      if (!place) return null
      const cc = addr.country_code?.toUpperCase() || null
      return cc ? `${place}, ${cc}` : place
    } catch (err) {
      console.error(`[geocode] fetch error:`, err)
      return null
    }
  }

  return null
}

app.post('/api/geocode/reverse-batch', async (req, res) => {
  try {
    const coords: { lat: number; lng: number }[] = req.body?.coords
    if (!Array.isArray(coords) || coords.length === 0) {
      res.status(400).json({ error: 'coords array required' })
      return
    }

    // Group by rounded coords to deduplicate
    const roundedMap = new Map<string, { rlat: number; rlng: number; origKeys: string[] }>()
    for (const { lat, lng } of coords) {
      const rlat = Number(Number(lat).toFixed(1))
      const rlng = Number(Number(lng).toFixed(1))
      const rKey = `${rlat},${rlng}`
      const origKey = `${lat},${lng}`
      const entry = roundedMap.get(rKey)
      if (entry) {
        entry.origKeys.push(origKey)
      } else {
        roundedMap.set(rKey, { rlat, rlng, origKeys: [origKey] })
      }
    }

    const results: Record<string, string | null> = {}
    const toFetch: { rKey: string; rlat: number; rlng: number; origKeys: string[] }[] = []

    // Check cache for each unique rounded coord
    for (const [rKey, entry] of roundedMap) {
      const cached = await cacheGet<string>(`geocode:${rKey}`)
      if (cached !== null) {
        for (const k of entry.origKeys) results[k] = cached
      } else {
        toFetch.push({ rKey, ...entry })
      }
    }

    console.log(`[geocode] batch: ${coords.length} coords, ${roundedMap.size} unique, ${toFetch.length} uncached`)

    // Fetch uncached sequentially via throttle
    for (const { rKey, rlat, rlng, origKeys } of toFetch) {
      const name = await geocodeThrottle(() => reverseGeocode(rlat, rlng))
      if (name) {
        await cacheSet(`geocode:${rKey}`, name, 60 * 60 * 24 * 30)
      }
      console.log(`[geocode] ${rlat}, ${rlng} → ${name}`)
      for (const k of origKeys) results[k] = name
    }

    res.json({ results })
  } catch (err) {
    console.error('Geocode batch error:', err)
    res.status(500).json({ error: 'Geocode failed' })
  }
})

app.get('/api/geocode/cached', async (_req, res) => {
  try {
    const results: Record<string, string> = {}
    let cursor = '0'
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'geocode:*', 'COUNT', 200)
      cursor = next
      if (keys.length > 0) {
        const values = await redis.mget(...keys)
        for (let i = 0; i < keys.length; i++) {
          if (values[i]) {
            // key is "geocode:lat,lng" → extract "lat,lng"
            const coord = keys[i].slice('geocode:'.length)
            results[coord] = JSON.parse(values[i]!)
          }
        }
      }
    } while (cursor !== '0')
    res.json({ results })
  } catch (err) {
    console.error('Failed to fetch cached geocodes:', err)
    res.status(500).json({ error: 'Failed to fetch cached geocodes' })
  }
})

// Fetch city boundary polygon from Nominatim
async function fetchCityBoundary(cityName: string, countryCode: string): Promise<GeoJSON.Feature | null> {
  const cacheKey = `boundary:${cityName},${countryCode}`
  const cached = await cacheGet<GeoJSON.Feature | null>(cacheKey)
  if (cached !== null) return cached

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const q = encodeURIComponent(cityName)
      const cc = countryCode.toLowerCase()
      const url = `https://nominatim.openstreetmap.org/search?q=${q}&countrycodes=${cc}&format=json&polygon_geojson=1&limit=1&featuretype=city`
      const response = await fetch(url, { headers: { 'User-Agent': 'StravaActivityMap/1.0' } })

      if (response.status === 429) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 5000))
        continue
      }
      if (!response.ok) return null

      const data = await response.json()
      if (!data[0]?.geojson) {
        await cacheSet(cacheKey, null, 60 * 60 * 24 * 30)
        return null
      }

      const feature: GeoJSON.Feature = {
        type: 'Feature',
        properties: { name: cityName, country: countryCode },
        geometry: data[0].geojson,
      }
      await cacheSet(cacheKey, feature, 60 * 60 * 24 * 30)
      return feature
    } catch {
      return null
    }
  }
  return null
}

app.post('/api/geocode/boundaries', async (req, res) => {
  try {
    const cities: { city: string; country: string }[] = req.body?.cities
    if (!Array.isArray(cities) || cities.length === 0) {
      return res.json({ features: [] })
    }

    const features: GeoJSON.Feature[] = []

    // Check cache first for all cities
    const cacheKeys = cities.map(c => `boundary:${c.city},${c.country}`)
    const cached = await redis.mget(...cacheKeys)
    const uncached: { city: string; country: string; idx: number }[] = []

    for (let i = 0; i < cities.length; i++) {
      if (cached[i]) {
        const parsed = JSON.parse(cached[i]!)
        if (parsed) features.push(parsed)
      } else {
        uncached.push({ ...cities[i], idx: i })
      }
    }

    // Fetch uncached boundaries with throttle
    for (const c of uncached) {
      const feature = await fetchCityBoundary(c.city, c.country)
      if (feature) features.push(feature)
      if (uncached.indexOf(c) < uncached.length - 1) {
        await new Promise(r => setTimeout(r, 1100))
      }
    }

    res.json({ features })
  } catch (err) {
    console.error('Failed to fetch boundaries:', err)
    res.status(500).json({ error: 'Failed to fetch boundaries' })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
