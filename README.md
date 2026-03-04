# Stravaaaaaa

Visualize your Strava activities on an interactive map with filtering, color-coded routes, timeline animation, and city clustering.

## Features

- **Activity map** — Polyline routes rendered on Leaflet with zoom-proportional line weights
- **9 activity categories** — Ride, Run, Walk, Trail, Swim, Water, Winter, Workout, Sport
- **Composite types** — "All Runs" groups Run + Trail; filtering and colors handled client-side
- **Timeline animation** — Chronological playback with trail drawing, speed control (1x–100x), follow/overview modes
- **Color schemes** — Strava, Neon, Pastel, Vapor, Mono; switchable via sidebar dropdown
- **Distance filtering** — Per-category chips (5k/10k/21.1k/42.2k for runs, etc.) with color brackets
- **Date filtering** — Year/quarter/month chips with custom range inputs
- **City clustering** — Activities grouped by geocoded city, with boundary polygons on borders layer
- **Map layers** — Streets, Satellite, Terrain, Grey, Borders, Strava Heatmap, None
- **Strava Heatmap tiles** — Public low-res or authenticated high-res via CloudFront cookies
- **URL hash state** — Filters, map position, speed, mode, layer, and scheme persisted in the URL
- **NDJSON streaming** — Activities stream to the client page-by-page for progressive loading

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Leaflet / react-leaflet |
| Backend | Express 5, TypeScript (tsx), ioredis |
| Cache | Redis 7 (Docker, AOF persistence) |
| Maps | OpenStreetMap, Stadia, CARTO, Esri, Natural Earth borders |
| Testing | Vitest |
| UI Dev | Storybook 10 |
| CI | GitHub Actions (typecheck, test, build, storybook) |

## Quick Start

### Prerequisites

- Node.js 20+
- Docker (for Redis)
- A [Strava API application](https://www.strava.com/settings/api) (Client ID + Secret)

### Setup

```bash
# Install dependencies
yarn install

# Start Redis
docker compose up -d redis

# Configure environment
cp .env.backend.example .env.backend
# Edit .env.backend with your STRAVA_CLIENT_SECRET

# Start dev servers (frontend :5173, backend :3001)
yarn dev
```

Open http://localhost:5173, connect with Strava, and your activities will load.

### Docker (production)

```bash
docker compose up --build
```

Runs Redis, backend, and nginx-fronted frontend on port 5173.

## Environment Variables

See `.env.backend.example`:

| Variable | Default | Description |
|----------|---------|-------------|
| `STRAVA_CLIENT_ID` | — | Strava app client ID |
| `STRAVA_CLIENT_SECRET` | — | Strava app client secret |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `SERVER_PORT` | `3001` | Backend port |
| `FRONTEND_URL` | `http://localhost:5173` | CORS origin |

## Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | Start frontend + backend concurrently |
| `yarn build` | TypeScript compile + Vite production build |
| `yarn test` | Run Vitest test suite |
| `yarn typecheck` | TypeScript type checking |
| `yarn storybook` | Start Storybook on port 6006 |

## Project Structure

```
src/
  components/   App, Map, Sidebar, ActivityTypeSelector,
                DateRangeSelector, DistanceFilter, TimelineSlider, CitySelector
  hooks/        useAuth, useActivities, useTimeline, useGeocodeCache, useActivityStreams
  contexts/     ColorSchemeContext
  types/        Activity, FilterState, ActivityCategory
  utils/        colors, constants, filters, hash, polyline
  styles/       App.css, Sidebar.css, Timeline.css, Map.css
server/
  index.ts      Express routes (activities, geocoding, heatmap proxy)
  auth.ts       Strava OAuth 2.0 (cookie sessions, token refresh)
  strava.ts     Strava API client with pagination + Redis cache
  cache.ts      Redis wrapper
```

## License

MIT
