import { Router, type Request, type Response } from 'express'
import { cacheGet, cacheDel, redis } from './cache.js'

const router = Router()

const VERIFY_TOKEN = process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || ''

interface WebhookEvent {
  object_type: 'activity' | 'athlete'
  aspect_type: 'create' | 'update' | 'delete'
  object_id: number
  owner_id: number
  subscription_id: number
  event_time: number
  updates?: Record<string, unknown>
}

// GET /api/webhook — Strava subscription validation
router.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'] as string | undefined
  const challenge = req.query['hub.challenge'] as string | undefined
  const token = req.query['hub.verify_token'] as string | undefined

  if (mode === 'subscribe' && VERIFY_TOKEN !== '' && token === VERIFY_TOKEN) {
    console.log('[webhook] Subscription validated')
    res.json({ 'hub.challenge': challenge })
    return
  }

  res.status(403).json({ error: 'Verification failed' })
})

// POST /api/webhook — handle Strava events
router.post('/', async (req: Request, res: Response) => {
  // Respond 200 immediately (Strava requires <2s response)
  res.status(200).json({ ok: true })

  const event = req.body as WebhookEvent
  if (event.object_type !== 'activity') return

  console.log(`[webhook] ${event.aspect_type} activity ${event.object_id} from athlete ${event.owner_id}`)

  try {
    // Look up session for this athlete
    const sessionId = await cacheGet<string>(`strava:athlete:${event.owner_id}`)
    if (!sessionId) {
      console.log(`[webhook] No session found for athlete ${event.owner_id}`)
      return
    }

    // Invalidate activity cache: scan for all keys matching strava:activities:{sessionId}:*
    let cursor = '0'
    let deletedCount = 0
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `strava:activities:${sessionId}:*`, 'COUNT', 100)
      cursor = next
      if (keys.length > 0) {
        await redis.del(...keys)
        deletedCount += keys.length
      }
    } while (cursor !== '0')

    // For delete events, also remove the specific stream cache
    if (event.aspect_type === 'delete') {
      await cacheDel(`strava:streams:${event.object_id}`)
    }

    console.log(`[webhook] Invalidated ${deletedCount} cache keys for session ${sessionId}`)
  } catch (err) {
    console.error('[webhook] Cache invalidation error:', err)
  }
})

export { router as webhookRouter }
