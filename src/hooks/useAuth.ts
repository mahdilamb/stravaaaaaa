import { useState, useEffect, useCallback } from 'react'
import type { AuthStatus } from '../types'

export function useAuth() {
  const [auth, setAuth] = useState<AuthStatus>({ authenticated: false })
  const [loading, setLoading] = useState(true)

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status', { credentials: 'include' })
      const data = await res.json()
      setAuth(data)
    } catch {
      setAuth({ authenticated: false })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const login = () => {
    window.location.href = '/api/auth/strava'
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setAuth({ authenticated: false })
  }

  return { auth, loading, login, logout }
}
