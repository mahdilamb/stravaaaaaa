import { useState } from 'react'
import { getConfig, saveConfig } from '../lib/stravaAuth'
import { idbClear } from '../lib/idb'

interface Props {
  onClose?: () => void
  onSave?: () => void
}

export function Settings({ onClose, onSave }: Props) {
  const cfg = getConfig()
  const [clientId, setClientId] = useState(cfg.clientId)
  const [clientSecret, setClientSecret] = useState(cfg.clientSecret)
  const [saved, setSaved] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [cleared, setCleared] = useState(false)

  function handleSave() {
    saveConfig({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onSave?.()
  }

  async function handleClearCache() {
    setClearing(true)
    await Promise.all([
      idbClear('activities'),  // clears both :ids and individual :id entries
      idbClear('streams'),
      idbClear('geocode'),
      idbClear('boundary'),
    ])
    setClearing(false)
    setCleared(true)
    setTimeout(() => setCleared(false), 2000)
  }

  const isSetup = !cfg.clientId || !cfg.clientSecret

  return (
    <div className="settings-overlay" onClick={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="settings-panel">
        <div className="settings-header">
          <h2>{isSetup ? 'Setup' : 'Settings'}</h2>
          {!isSetup && onClose && (
            <button className="settings-close" onClick={onClose} aria-label="Close">✕</button>
          )}
        </div>

        <p className="settings-hint">
          Create a Strava API application at{' '}
          <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener noreferrer">
            strava.com/settings/api
          </a>{' '}
          and set the <strong>Authorization Callback Domain</strong> to{' '}
          <code>{window.location.hostname}</code>.
        </p>

        <label className="settings-label">
          Client ID
          <input
            className="settings-input"
            type="text"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            placeholder="12345"
            autoComplete="off"
          />
        </label>

        <label className="settings-label">
          Client Secret
          <input
            className="settings-input"
            type="password"
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            placeholder="••••••••••••••••••••••••"
            autoComplete="off"
          />
        </label>

        <p className="settings-security-note">
          Credentials are stored in your browser's localStorage and never sent anywhere except
          directly to Strava's OAuth endpoint.
        </p>

        <div className="settings-actions">
          <button
            className="settings-btn settings-btn-primary"
            onClick={handleSave}
            disabled={!clientId.trim() || !clientSecret.trim()}
          >
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>

        {!isSetup && (
          <div className="settings-section">
            <h3>Cache</h3>
            <p>Clear all locally cached activities, geocodes, and city boundaries.</p>
            <button
              className="settings-btn settings-btn-danger"
              onClick={handleClearCache}
              disabled={clearing}
            >
              {clearing ? 'Clearing…' : cleared ? 'Cleared!' : 'Clear cache'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
