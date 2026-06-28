import { useState, useEffect, useCallback } from 'react'
import {
  getStoredTokens,
  saveTokens,
  clearTokens,
  initiateLogin,
  exchangeCode,
  getConfig,
  type StravaTokens,
} from '../lib/stravaAuth'
import type { AuthStatus } from '../types'

export interface AuthHook {
  auth: AuthStatus
  loading: boolean
  tokens: StravaTokens | null
  login: () => void
  logout: () => void
  needsSetup: boolean
}

export function useAuth(): AuthHook {
  const [tokens, setTokens] = useState<StravaTokens | null>(null)
  const [auth, setAuth] = useState<AuthStatus>({ authenticated: false })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    if (code) {
      // OAuth callback — exchange the code for tokens
      ;(async () => {
        try {
          const newTokens = await exchangeCode(code)
          saveTokens(newTokens)
          setTokens(newTokens)
          setAuth({
            authenticated: true,
            athlete: { firstname: newTokens.athlete.firstname, lastname: newTokens.athlete.lastname },
          })
        } catch {
          setAuth({ authenticated: false })
        } finally {
          // Remove ?code= and ?scope= from the URL without triggering a reload
          window.history.replaceState({}, '', window.location.pathname + window.location.hash)
          setLoading(false)
        }
      })()
    } else {
      const stored = getStoredTokens()
      if (stored) {
        setTokens(stored)
        setAuth({
          authenticated: true,
          athlete: { firstname: stored.athlete.firstname, lastname: stored.athlete.lastname },
        })
      }
      setLoading(false)
    }
  }, [])

  const login = useCallback(() => {
    initiateLogin()
  }, [])

  const logout = useCallback(() => {
    clearTokens()
    setTokens(null)
    setAuth({ authenticated: false })
  }, [])

  const { clientId, clientSecret } = getConfig()
  const needsSetup = !clientId || !clientSecret

  return { auth, loading, tokens, login, logout, needsSetup }
}
