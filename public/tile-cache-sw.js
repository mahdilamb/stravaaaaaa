const CACHE_NAME = 'osm-tiles-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = event.request.url
  // Only cache OSM tile requests
  if (!url.includes('tile.openstreetmap.org')) return

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((response) => {
          if (response.ok) {
            cache.put(event.request, response.clone())
          }
          return response
        })
      })
    )
  )
})
