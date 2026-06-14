import type { Express } from 'express'
import { cacheGet, cacheSet } from './cache.js'

type HeatmapSport = 'all' | 'ride' | 'run' | 'water' | 'winter'
const HEATMAP_SPORTS: readonly HeatmapSport[] = ['all', 'ride', 'run', 'water', 'winter']

const DEFAULT_COLOR = process.env.HEATMAP_COLOR || 'blue'
const TILE_VERSION = '19'
const PROBE_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

type Tier = 'direct' | 'public'

let currentTier: Tier = 'direct'

// --- Tier 1: Direct fetch from content-a.strava.com ---

async function fetchTileDirect(
  sport: HeatmapSport,
  z: string,
  x: string,
  y: string,
): Promise<Buffer | null> {
  const url = `https://content-a.strava.com/identified/globalheat/${sport}/${DEFAULT_COLOR}/${z}/${x}/${y}@2x.png?v=${TILE_VERSION}`
  try {
    const res = await fetch(url, {
      headers: {
        Referer: 'https://www.strava.com/maps/global-heatmap',
        Origin: 'https://www.strava.com',
      },
    })
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    return null
  } catch {
    return null
  }
}

// --- Tier 2: old public tiles (low-res, max zoom 12) ---

async function fetchTilePublic(
  sport: HeatmapSport,
  z: string,
  x: string,
  y: string,
): Promise<Buffer | null> {
  const url = `https://heatmap-external-a.strava.com/tiles/${sport}/hot/${z}/${x}/${y}.png?px=256`
  try {
    const res = await fetch(url)
    if (res.ok) return Buffer.from(await res.arrayBuffer())
    return null
  } catch {
    return null
  }
}

// --- Fetch using current tier only ---

const TIER_FETCHERS: Record<Tier, typeof fetchTileDirect> = {
  direct: fetchTileDirect,
  public: fetchTilePublic,
}

async function fetchTile(
  sport: HeatmapSport,
  z: string,
  x: string,
  y: string,
): Promise<Buffer | null> {
  return TIER_FETCHERS[currentTier](sport, z, x, y)
}

// --- Probe: try direct, fall back to public ---

let probing = false

async function probe(): Promise<void> {
  if (probing) return
  probing = true
  try {
    const direct = await fetchTileDirect('all', '8', '126', '85')
    if (direct) {
      if (currentTier !== 'direct') console.log('[heatmap] Switched to direct tier')
      currentTier = 'direct'
      return
    }
    if (currentTier !== 'public') console.log('[heatmap] Switched to public tier')
    currentTier = 'public'
  } finally {
    probing = false
  }
}

// --- Express route registration ---

export function registerHeatmapRoutes(app: Express): void {
  probe().then(() => console.log(`[heatmap] Active tier: ${currentTier}`))
  setInterval(() => probe(), PROBE_INTERVAL_MS)

  app.get('/api/heatmap/status', (_req, res) => {
    res.json({ tier: currentTier })
  })

  app.get('/api/heatmap/:type/:z/:x/:y.png', async (req, res) => {
    try {
      const { type, z, x, y } = req.params
      const sport: HeatmapSport = HEATMAP_SPORTS.includes(type as HeatmapSport)
        ? (type as HeatmapSport)
        : 'all'

      const cacheKey = `heatmap:${sport}:${z}:${x}:${y}`
      const cached = await cacheGet<string>(cacheKey)
      if (cached) {
        res.setHeader('Content-Type', 'image/png')
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.setHeader('X-Heatmap-Tier', 'cache')
        res.send(Buffer.from(cached, 'base64'))
        return
      }

      const buf = await fetchTile(sport, z, x, y)
      if (!buf) {
        res.status(204).end()
        return
      }

      await cacheSet(cacheKey, buf.toString('base64'), 86400)
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.setHeader('X-Heatmap-Tier', currentTier)
      res.send(buf)
    } catch {
      res.status(500).end()
    }
  })
}
