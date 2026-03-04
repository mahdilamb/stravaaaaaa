import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import './styles/App.css'
import './styles/Sidebar.css'
import './styles/Timeline.css'
import './styles/Map.css'
import { App } from './components/App'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/tile-cache-sw.js').catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
