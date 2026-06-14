import type { Express } from 'express'
import { cacheGet, cacheSet } from './cache.js'

interface TileProvider {
  buildUrl: (z: string, x: string, y: string) => string
  contentType: string
}

const SUBDOMAINS_ABC = ['a', 'b', 'c']
const SUBDOMAINS_ABCD = ['a', 'b', 'c', 'd']
let subdomainCounter = 0

function pickSubdomain(subdomains: string[]): string {
  return subdomains[subdomainCounter++ % subdomains.length]
}

const PROVIDERS: Record<string, TileProvider> = {
  osm: {
    buildUrl: (z, x, y) =>
      `https://${pickSubdomain(SUBDOMAINS_ABC)}.tile.openstreetmap.org/${z}/${x}/${y}.png`,
    contentType: 'image/png',
  },
  satellite: {
    buildUrl: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    contentType: 'image/jpeg',
  },
  terrain: {
    buildUrl: (z, x, y) =>
      `https://tiles.stadiamaps.com/tiles/stamen_terrain_background/${z}/${x}/${y}.png`,
    contentType: 'image/png',
  },
  carto: {
    buildUrl: (z, x, y) =>
      `https://${pickSubdomain(SUBDOMAINS_ABCD)}.basemaps.cartocdn.com/light_nolabels/${z}/${x}/${y}.png`,
    contentType: 'image/png',
  },
  'carto-dark': {
    buildUrl: (z, x, y) =>
      `https://${pickSubdomain(SUBDOMAINS_ABCD)}.basemaps.cartocdn.com/dark_nolabels/${z}/${x}/${y}.png`,
    contentType: 'image/png',
  },
  'carto-light': {
    buildUrl: (z, x, y) =>
      `https://${pickSubdomain(SUBDOMAINS_ABCD)}.basemaps.cartocdn.com/light_nolabels/${z}/${x}/${y}.png`,
    contentType: 'image/png',
  },
}

export function registerTileRoutes(app: Express): void {
  app.get('/api/tiles/:provider/:z/:x/:y.:ext', async (req, res) => {
    try {
      const { provider, z, x, y } = req.params
      const config = PROVIDERS[provider]
      if (!config) {
        res.status(400).json({ error: `Unknown provider: ${provider}` })
        return
      }

      const cacheKey = `tile:${provider}:${z}:${x}:${y}`
      const cached = await cacheGet<string>(cacheKey)
      if (cached) {
        res.setHeader('Content-Type', config.contentType)
        res.setHeader('Cache-Control', 'public, max-age=86400')
        res.send(Buffer.from(cached, 'base64'))
        return
      }

      const url = config.buildUrl(z, x, y)
      const upstream = await fetch(url, {
        headers: { 'User-Agent': 'StravaActivityMap/1.0' },
      })

      if (!upstream.ok) {
        res.status(upstream.status).end()
        return
      }

      const buf = Buffer.from(await upstream.arrayBuffer())
      await cacheSet(cacheKey, buf.toString('base64'), 86400)

      res.setHeader('Content-Type', config.contentType)
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.send(buf)
    } catch {
      res.status(500).end()
    }
  })
}
