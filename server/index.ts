import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { authRouter, getValidToken, getVisitorId } from './auth.js'
import { getAllActivities, getActivitiesPage, getActivityStreams, mapSportType } from './strava.js'
import { cacheGet, cacheSet, redis } from './cache.js'

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

// Heatmap cookie setup page — lets dev paste CloudFront cookies for high-res tiles
app.get('/api/heatmap/setup', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><title>Strava Heatmap Setup</title><style>
body{font-family:system-ui,sans-serif;max-width:600px;margin:40px auto;padding:0 20px;background:#1a1a2e;color:#e0e0e0}
a{color:#fc4c02}
input{width:100%;padding:8px;margin:4px 0 12px;background:#16213e;border:1px solid #444;color:#e0e0e0;border-radius:4px;box-sizing:border-box}
button{background:#fc4c02;color:white;border:none;padding:10px 20px;border-radius:4px;cursor:pointer;font-size:14px}
button:hover{background:#e04400}
.step{margin:16px 0;padding:12px;background:#16213e;border-radius:8px}
code{background:#0d1117;padding:2px 6px;border-radius:3px;font-size:13px}
.ok{color:#4caf50;font-weight:bold}.err{color:#f44336;font-weight:bold}
.status{margin:16px 0;padding:12px;border-radius:8px;font-weight:bold}
.status-ok{background:#1b3a1b;color:#4caf50;border:1px solid #4caf50}
.status-bad{background:#3a1b1b;color:#f44336;border:1px solid #f44336}
.status-none{background:#16213e;color:#888;border:1px solid #444}
.status-loading{background:#16213e;color:#aaa;border:1px solid #444}
</style></head><body>
<h2>Strava Heatmap Setup</h2>
<div id="status" class="status status-loading">Checking cookie status...</div>
<p>Enable high-resolution heatmap tiles by providing your Strava CloudFront cookies.</p>
<div class="step"><strong>Step 1:</strong> Open <a href="https://www.strava.com/heatmap" target="_blank">strava.com/heatmap</a> in a new tab (log in if needed)</div>
<div class="step"><strong>Step 2:</strong> Open DevTools (<code>F12</code>) &rarr; <strong>Application</strong> tab &rarr; <strong>Cookies</strong> &rarr; <code>heatmap-external-a.strava.com</code></div>
<div class="step"><strong>Step 3:</strong> Copy the three cookie values below:
<form id="f">
<label>CloudFront-Key-Pair-Id<input name="keyPairId" required></label>
<label>CloudFront-Policy<input name="policy" required></label>
<label>CloudFront-Signature<input name="signature" required></label>
<button type="submit">Save Cookies</button>
</form>
<div id="s"></div>
</div>
<script>
async function checkStatus(){
  const el=document.getElementById('status');
  try{
    const r=await fetch('/api/heatmap/status');const d=await r.json();
    if(d.stored&&d.valid){el.className='status status-ok';el.textContent='Cookies valid — high-res tiles active'}
    else if(d.stored){el.className='status status-bad';el.textContent='Cookies expired or invalid — please update below'}
    else{el.className='status status-none';el.textContent='No cookies stored — using low-res public tiles'}
    if(d.cookies){
      document.querySelector('[name=keyPairId]').value=d.cookies.keyPairId||'';
      document.querySelector('[name=policy]').value=d.cookies.policy||'';
      document.querySelector('[name=signature]').value=d.cookies.signature||'';
    }
  }catch{el.className='status status-none';el.textContent='Could not check status'}
}
checkStatus();
document.getElementById('f').addEventListener('submit',async e=>{
  e.preventDefault();const d=Object.fromEntries(new FormData(e.target));
  const el=document.getElementById('s');
  el.innerHTML='<p style="color:#aaa">Saving and validating...</p>';
  try{const r=await fetch('/api/heatmap/cookies',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});
  if(r.ok){el.innerHTML='';checkStatus()}
  else{el.innerHTML='<p class="err">Failed to save</p>'}
  }catch(err){el.innerHTML='<p class="err">'+err.message+'</p>'}
});
</script></body></html>`)
})

app.get('/api/heatmap/status', async (_req, res) => {
  try {
    const cf = await cacheGet<{ keyPairId: string; policy: string; signature: string }>('heatmap:cloudfront')
    if (!cf) {
      res.json({ stored: false, valid: false, cookies: null })
      return
    }
    // Test with a known-good tile (London, zoom 13 — requires auth)
    const testUrl = 'https://heatmap-external-a.strava.com/tiles-auth/all/hot/13/4093/2724.png?px=512'
    const cookie = `CloudFront-Key-Pair-Id=${cf.keyPairId}; CloudFront-Policy=${cf.policy}; CloudFront-Signature=${cf.signature}`
    const testRes = await fetch(testUrl, { method: 'HEAD', headers: { Cookie: cookie, Referer: 'https://www.strava.com/heatmap' } })
    res.json({ stored: true, valid: testRes.ok, cookies: cf })
  } catch {
    res.json({ stored: false, valid: false, cookies: null })
  }
})

app.post('/api/heatmap/cookies', async (req, res) => {
  try {
    const { keyPairId, policy, signature } = req.body
    if (!keyPairId || !policy || !signature) {
      res.status(400).json({ error: 'All three cookie values required' })
      return
    }
    await cacheSet('heatmap:cloudfront', { keyPairId, policy, signature }, 60 * 60 * 24 * 7)
    console.log('[heatmap] CloudFront cookies saved — tiles-auth enabled')
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Failed to save cookies' })
  }
})

// Proxy Strava heatmap tiles — uses tiles-auth with CloudFront cookies if available, else public tiles
const HEATMAP_TYPES = ['all', 'ride', 'run', 'water', 'winter'] as const
app.get('/api/heatmap/:type/:z/:x/:y.png', async (req, res) => {
  try {
    const { type, z, x, y } = req.params
    const heatType = HEATMAP_TYPES.includes(type as typeof HEATMAP_TYPES[number]) ? type : 'all'
    const cacheKey = `heatmap:${heatType}:${z}:${x}:${y}`
    const cached = await cacheGet<string>(cacheKey)
    if (cached) {
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'public, max-age=86400')
      res.send(Buffer.from(cached, 'base64'))
      return
    }

    // Try high-res tiles-auth first if CloudFront cookies are stored
    const cf = await cacheGet<{ keyPairId: string; policy: string; signature: string }>('heatmap:cloudfront')
    let buf: Buffer | null = null

    if (cf) {
      const authUrl = `https://heatmap-external-a.strava.com/tiles-auth/${heatType}/hot/${z}/${x}/${y}.png?px=512`
      const cookie = `CloudFront-Key-Pair-Id=${cf.keyPairId}; CloudFront-Policy=${cf.policy}; CloudFront-Signature=${cf.signature}`
      const authRes = await fetch(authUrl, { headers: { Cookie: cookie, Referer: 'https://www.strava.com/heatmap' } })
      if (authRes.ok) {
        buf = Buffer.from(await authRes.arrayBuffer())
      }
    }

    // Fall back to public tiles (max zoom 12)
    if (!buf) {
      const pubUrl = `https://heatmap-external-a.strava.com/tiles/${heatType}/hot/${z}/${x}/${y}.png?px=256`
      const pubRes = await fetch(pubUrl)
      if (!pubRes.ok) {
        // Return 204 (no content) so Leaflet shows empty tile instead of error
        res.status(204).end()
        return
      }
      buf = Buffer.from(await pubRes.arrayBuffer())
    }

    await cacheSet(cacheKey, buf.toString('base64'), 86400)
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(buf)
  } catch {
    res.status(500).end()
  }
})

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

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`[heatmap] Setup: http://localhost:${PORT}/api/heatmap/setup`)
})
