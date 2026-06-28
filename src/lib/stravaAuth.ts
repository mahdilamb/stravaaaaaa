const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize'
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
const SCOPE = 'activity:read_all'

export interface StravaConfig {
  clientId: string
  clientSecret: string
  heatmapColor: string
}

export interface StravaTokens {
  access_token: string
  refresh_token: string
  expires_at: number
  athlete: {
    id: number
    firstname: string
    lastname: string
  }
}

export function getConfig(): StravaConfig {
  return {
    clientId: localStorage.getItem('strava_client_id') ?? '',
    clientSecret: localStorage.getItem('strava_client_secret') ?? '',
    heatmapColor: localStorage.getItem('strava_heatmap_color') ?? 'hot',
  }
}

export function saveConfig(config: Partial<StravaConfig>): void {
  if (config.clientId !== undefined) localStorage.setItem('strava_client_id', config.clientId)
  if (config.clientSecret !== undefined) localStorage.setItem('strava_client_secret', config.clientSecret)
  if (config.heatmapColor !== undefined) localStorage.setItem('strava_heatmap_color', config.heatmapColor)
}

export function getStoredTokens(): StravaTokens | null {
  try {
    const raw = localStorage.getItem('strava_tokens')
    return raw ? (JSON.parse(raw) as StravaTokens) : null
  } catch {
    return null
  }
}

export function saveTokens(tokens: StravaTokens): void {
  localStorage.setItem('strava_tokens', JSON.stringify(tokens))
}

export function clearTokens(): void {
  localStorage.removeItem('strava_tokens')
}

export function getRedirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`
}

export function initiateLogin(): void {
  const { clientId } = getConfig()
  if (!clientId) throw new Error('Client ID not configured')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    response_type: 'code',
    approval_prompt: 'auto',
    scope: SCOPE,
  })
  window.location.href = `${STRAVA_AUTH_URL}?${params}`
}

export async function exchangeCode(code: string): Promise<StravaTokens> {
  const { clientId, clientSecret } = getConfig()
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  return res.json() as Promise<StravaTokens>
}

// Deduplicated refresh: concurrent callers share the same in-flight request
let refreshPromise: Promise<StravaTokens> | null = null

async function doRefresh(tokens: StravaTokens): Promise<StravaTokens> {
  const { clientId, clientSecret } = getConfig()
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error('Token refresh failed')
  const refreshed = await (res.json() as Promise<StravaTokens>)
  return { ...tokens, ...refreshed }
}

export async function getValidToken(): Promise<string | null> {
  const tokens = getStoredTokens()
  if (!tokens) return null

  const now = Math.floor(Date.now() / 1000)
  if (tokens.expires_at > now + 300) return tokens.access_token

  if (!refreshPromise) {
    refreshPromise = doRefresh(tokens).finally(() => { refreshPromise = null })
  }
  const refreshed = await refreshPromise
  saveTokens(refreshed)
  return refreshed.access_token
}
