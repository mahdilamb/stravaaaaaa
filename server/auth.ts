import { Router, type Request, type Response } from 'express'
import crypto from 'crypto'
import { cacheGet, cacheSet, cacheDel } from './cache.js'
import type { StravaTokens } from './types.js'

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize'
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'

const router = Router()

function getCallbackUrl(): string {
  return `http://localhost:${process.env.SERVER_PORT || 3001}/api/auth/callback`
}

// GET /api/auth/strava — redirect to Strava OAuth
router.get('/strava', (_req: Request, res: Response) => {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID || '',
    redirect_uri: getCallbackUrl(),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'activity:read_all',
  })
  res.redirect(`${STRAVA_AUTH_URL}?${params}`)
})

// GET /api/auth/callback — handle OAuth callback
router.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string | undefined
  if (!code) {
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?error=auth_failed`)
    return
  }

  try {
    const response = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      console.error(`[auth] Token exchange failed: ${response.status}`, body)
      throw new Error(`Token exchange failed: ${response.status}`)
    }

    const tokens = (await response.json()) as StravaTokens
    const sessionId = crypto.randomUUID()

    await cacheSet(`strava:token:${sessionId}`, tokens)

    // Reverse mapping: athlete ID → session (for webhook cache invalidation)
    if (tokens.athlete?.id) {
      await cacheSet(`strava:athlete:${tokens.athlete.id}`, sessionId)
    }

    console.log(`[auth] Login successful for ${tokens.athlete?.firstname} ${tokens.athlete?.lastname}, session: ${sessionId}`)

    res.cookie('strava_session', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    })

    res.redirect(process.env.FRONTEND_URL || 'http://localhost:5173')
  } catch (err) {
    console.error('[auth] Callback error:', err)
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}?error=auth_failed`)
  }
})

// GET /api/auth/status — check authentication
router.get('/status', async (req: Request, res: Response) => {
  const sessionId = req.cookies?.strava_session
  if (!sessionId) {
    res.json({ authenticated: false })
    return
  }

  const tokens = await cacheGet<StravaTokens>(`strava:token:${sessionId}`)
  if (!tokens) {
    res.json({ authenticated: false })
    return
  }

  res.json({
    authenticated: true,
    athlete: {
      firstname: tokens.athlete.firstname,
      lastname: tokens.athlete.lastname,
    },
  })
})

// POST /api/auth/logout — clear session
router.post('/logout', async (req: Request, res: Response) => {
  const sessionId = req.cookies?.strava_session
  if (sessionId) {
    await cacheDel(`strava:token:${sessionId}`)
  }
  res.clearCookie('strava_session')
  res.json({ ok: true })
})

// Helper: get visitor ID from cookie
export function getVisitorId(req: Request): string | null {
  return req.cookies?.strava_session || null
}

// Helper: get a valid access token, refreshing if needed
export async function getValidToken(visitorId: string): Promise<string> {
  const tokens = await cacheGet<StravaTokens>(`strava:token:${visitorId}`)
  if (!tokens) throw new Error('Not authenticated')

  const now = Math.floor(Date.now() / 1000)
  if (tokens.expires_at > now + 300) {
    return tokens.access_token
  }

  // Refresh the token
  const response = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) throw new Error('Token refresh failed')

  const refreshed = (await response.json()) as StravaTokens
  const updated: StravaTokens = {
    ...tokens,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: refreshed.expires_at,
  }

  await cacheSet(`strava:token:${visitorId}`, updated)
  return updated.access_token
}

export { router as authRouter }
