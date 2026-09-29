import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'carto_api_key'
const CHANGE_EVENT = 'carto-key-change'

/** Read the saved Carto basemap API key ('' if none). */
export function getCartoKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Save (or clear, if empty) the Carto key and notify subscribed components. */
export function saveCartoKey(key: string) {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // localStorage unavailable; ignore
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb)
  window.addEventListener('storage', cb) // other tabs
  return () => {
    window.removeEventListener(CHANGE_EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}

/** React hook: re-renders when the key changes. */
export function useCartoKey(): string {
  return useSyncExternalStore(subscribe, getCartoKey, () => '')
}

/**
 * Carto raster tile URL template for a style (e.g. 'voyager_nolabels').
 * With a key: keyed, subdomain-less endpoint. Without: the legacy public subdomain endpoint.
 */
export function cartoTileUrl(style: string, key: string): string {
  return key
    ? `https://basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`
    : `https://{s}.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}.png`
}
