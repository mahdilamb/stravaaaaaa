import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './styles/App.css'
import './styles/Sidebar.css'
import './styles/Timeline.css'
import './styles/Map.css'
import { App } from './components/App'

// Apply saved theme before first paint to avoid flash
try {
  const theme = localStorage.getItem('borderMode')
  if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light')
} catch {}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/tile-cache-sw.js').catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
