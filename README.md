# Stravaaaaaa

**[mahdilamb.github.io/stravaaaaaa](https://mahdilamb.github.io/stravaaaaaa/)**

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
- **URL hash state** — Filters, map position, speed, mode, layer, and scheme persisted in the URL
- **IndexedDB cache** — Activities cached by ID; subsequent loads fetch from Strava only until a known activity ID is found, then serve the rest locally

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Leaflet / react-leaflet |
| Auth | Strava OAuth 2.0 — client-side code exchange, tokens in `localStorage` |
| Cache | IndexedDB — activities, geocodes, city boundaries |
| Maps | OpenStreetMap, Stadia, CARTO, Esri, Natural Earth borders |
| Geocoding | Nominatim (direct, client-side throttle) |
| Deployment | GitHub Pages via GitHub Actions |
| Testing | Vitest |
| UI Dev | Storybook 10 |
| CI | GitHub Actions (typecheck, test, build, storybook) |

## Setup

### 1. Create a Strava API application

Go to [strava.com/settings/api](https://www.strava.com/settings/api) and create an app.

Set the **Authorization Callback Domain** to your deployment domain:
- Local dev: `localhost`
- GitHub Pages: your Pages domain (e.g. `mahdilamb.github.io`)

Note the **Client ID** and **Client Secret**.

### 2. Run locally

```bash
yarn install
yarn dev
```

Open http://localhost:53609 (or the port Vite prints). On first load you'll see a setup screen — enter your Client ID and Client Secret. Credentials are stored in `localStorage` and sent only to Strava's OAuth endpoint.

### 3. Deploy to GitHub Pages

1. Enable GitHub Pages in your repo settings → **Pages → Source: GitHub Actions**
2. Push to `main` — the [deploy workflow](.github/workflows/deploy.yml) builds and publishes automatically

## How the cache works

Activities are stored in IndexedDB keyed by activity ID, with a master sorted ID list (`{athleteId}:ids`).

On each load the app fetches pages from Strava **until it finds an activity ID already in the cache**, then loads the remaining activities locally. This means:

- **First load** — all pages fetched from Strava, everything cached
- **After a new run** — only page 1 (or however many pages contain new activities) fetched; rest served from IndexedDB
- **No new activities** — only one Strava API call needed

Geocoding results (city names + boundary polygons) are cached in IndexedDB for 30 days with a client-side 1.1 s/request throttle respecting Nominatim's ToS.

To clear the cache, open Settings (gear icon in the sidebar) → **Clear cache**.

## Scripts

| Command | Description |
|---------|-------------|
| `yarn dev` | Start Vite dev server |
| `yarn build` | TypeScript compile + Vite production build |
| `yarn test` | Run Vitest test suite |
| `yarn typecheck` | TypeScript type checking |
| `yarn storybook` | Start Storybook on port 6006 |

## Project Structure

```
src/
  components/   App, Map, Sidebar, Settings,
                ActivityTypeSelector, DateRangeSelector,
                DistanceFilter, TimelineSlider, CitySelector
  hooks/        useAuth, useActivities, useTimeline,
                useGeocodeCache, useActivityStreams
  lib/          idb.ts (IndexedDB wrapper), stravaAuth.ts (OAuth + token refresh)
  contexts/     ColorSchemeContext
  types/        Activity, FilterState, ActivityCategory
  utils/        colors, constants, filters, hash, polyline
  styles/       App.css, Sidebar.css, Timeline.css, Map.css
```

## License

MIT
