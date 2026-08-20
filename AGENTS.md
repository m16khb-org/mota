# PROJECT KNOWLEDGE BASE

**Generated:** 2026-08-17T15:12:50Z
**Commit:** cb2dfa4
**Branch:** main

## OVERVIEW

Korean commute-bus web app: React 19/Vite frontend plus Bun/Hono server adapter.
The server normalizes Seoul transit stop and arrival payloads; the browser stores multiple
named company/home places with multiple bus stops and subway route points per place. A web
manifest and service worker make the production build installable with an offline app shell.

## STRUCTURE

```text
mota/
├── server/                 # Bun/Hono API adapter and production static server
├── public/                 # PWA manifest, install icon, registration, offline worker
├── src/
│   ├── api/                # Browser API response validation
│   ├── components/         # UI, Leaflet map, picker, arrival presentation
│   ├── domain/             # Shared browser/server schemas and normalization
│   ├── hooks/              # Versioned multi-place localStorage persistence
│   ├── App.tsx             # Browser orchestration root
│   ├── main.tsx            # React/Vite entry point
│   └── styles.css          # Global design system and responsive layout
├── DESIGN.md               # Product, visual, interaction, and accessibility contracts
└── package.json            # pnpm scripts; Bun runtime
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Change bus stop/arrival contracts | `src/domain/bus.ts` | Shared by browser and server |
| Change subway station contracts | `src/domain/subway.ts` | OSM station normalization |
| Change upstream request handling | `server/app.ts` | Hono routes, route timeouts (8s; subway mirrors race with 1.5s stagger in a 16s budget), 400/502 mapping |
| Change production bind/static serving | `server/index.ts`, `server/config.ts` | Serves prebuilt `dist/` |
| Change browser API calls | `src/api/client.ts` | Re-validates server JSON with Zod |
| Change app state/refresh flow | `src/App.tsx` | Direction, active place/stop, arrivals |
| Change saved places/stops | `src/hooks/useCommuteStops.ts`, `src/hooks/commuteStopsStorage.ts` | v2 storage; migrates v1 |
| Change place/route controls | `src/components/CommutePlaceManager.tsx`, `src/components/RoutePointList.tsx` | Bus and subway points |
| Change map behavior/accessibility | `src/components/MapCanvas.tsx` | Used by main view and picker |
| Change bus marker picker | `src/components/MapPicker.tsx` | Explicit multi-select search |
| Change subway marker picker | `src/components/SubwayPicker.tsx` | Overpass multi-select search |
| Change explicit route options | `src/domain/commute.ts`, `src/hooks/useCommuteRouteOptions.ts` | v3 stop/station references |
| Change route wait ranking | `src/domain/routeComparison.ts`, `src/components/RouteComparison.tsx` | Live boarding wait only |
| Change install/offline behavior | `src/components/InstallPrompt.tsx`, `public/manifest.webmanifest`, `public/sw.js` | Samsung fallback, shell-only cache |
| Change global appearance | `DESIGN.md`, then `src/styles.css` | CSS is global, not component-scoped |
| Change tests | Colocated `*.test.ts(x)` | jsdom declared per React test file |

## CODE MAP

| Symbol | Type | Location | Refs | Role |
|--------|------|----------|-----:|------|
| `BusStop` | interface | `src/domain/bus.ts` | 38 | Shared stop identity and coordinates |
| `App` | function | `src/App.tsx` | 9 | Frontend composition and arrival lifecycle |
| `createApp` | function | `server/app.ts` | 7 | API router and upstream adapter |
| `fetchArrivals` | function | `src/api/client.ts` | 7 | Browser arrival transport boundary |
| `CommutePlaceManager` | function | `src/components/CommutePlaceManager.tsx` | 3 | Named places and multi-stop controls |
| `MapPicker` | function | `src/components/MapPicker.tsx` | 7 | Bus marker multi-selection and modal focus |
| `SubwayPicker` | function | `src/components/SubwayPicker.tsx` | 3 | Nearby subway multi-select |
| `MapCanvas` | function | `src/components/MapCanvas.tsx` | 5 | Leaflet rendering and marker keyboard adapter |
| `normalizeNearbyStops` | function | `src/domain/bus.ts` | 5 | Official stop payload normalization |
| `normalizeArrivals` | function | `src/domain/bus.ts` | 5 | BIS payload normalization and ETA sorting |
| `useCommuteStops` | hook | `src/hooks/useCommuteStops.ts` | 5 | Multi-place state mutations and persistence |
| `fetchNearbyStops` | function | `src/api/client.ts` | 3 | Explicit map-center stop lookup |

## CONVENTIONS

- One strict `tsconfig.json` covers browser, server, tests, and tool configs.
- Browser and server share `src/domain/bus.ts`; `src/` is not frontend-only.
- Parse untrusted values with Zod at every boundary: upstream, route input, browser JSON,
  and localStorage.
- Persist named place collections under `commute-bus-web:stops:v2`; preserve v1 migration.
- Preserve branded `StopId`, `ArsId`, and `RouteId`; ARS IDs are five-digit strings.
- Relative imports only; no path aliases, barrels, or separate package boundaries.
- Tests live beside implementations. Server tests call Hono in memory with injected upstream
  fetch; React tests opt into jsdom with a file directive.
- Async UI tests await rendered state (`findBy*`/`waitFor`); no sleeps or live transit calls.
- Both browser and server network paths use `AbortSignal.timeout(8_000)`, except
  nearby-subway search: static OSM station data tolerates a longer wait, so the
  server races the four global Overpass mirrors (1.5s stagger, first response
  wins) within a 16s budget and the browser allows 20s.
- Subway route points come from OpenStreetMap Overpass; selecting a saved station
  fetches live Seoul subway arrivals via the arrival proxy upstream.
- `commute-bus-web:stops:v3` stores explicit start-stop/optional-transfer route options.
- Route comparison ranks only fresh first-bus boarding waits; it is not a total travel-time estimate.
- The service worker precaches only the same-origin app shell; `/api/*` and map tiles stay live.
- Samsung Internet needs explicit 192px and 512px PNG manifest icons; keep both raster assets.
- User-facing copy is short Korean task language. Keep technical upstream details out of errors.
- Treat `DESIGN.md` as the contract for layout, motion, accessibility, and content.

## ANTI-PATTERNS (THIS PROJECT)

- Do not fetch nearby stops continuously while the map moves; search only from
  `이 위치에서 찾기`.
- Do not fetch subway stations continuously or imply that route points include live arrivals.
- Do not overwrite a saved stop until explicit save; closing the picker preserves it.
- Do not identify a stop by name alone. Keep name, five-digit ARS ID, and map/direction context.
- Do not clear saved stops or arrivals silently on timeout/error; preserve state and expose retry.
- Do not bypass shared domain schemas or parse Seoul upstream payloads inside UI components.
- Do not let color carry state alone or remove keyboard/list alternatives for map actions.
- Do not announce every map movement to assistive technology.
- Do not cache `/api/*` responses or imply that offline mode includes current transit data.
- Do not label boarding-wait rank as the fastest commute or infer walking/transfer duration.
- Do not add gradients, glass effects, nested cards, excessive rounding, decorative illustration,
  or large empty hero space.

## UNIQUE STYLES

- Urban-utility visual language: high-contrast black/white, lime `--signal`, blue map focus.
- Desktop is a 400px control rail plus full map; below 960px it becomes map plus bottom sheet.
- Desktop stop discovery happens on the main map: explicit search button renders dashed
  pending markers that a click adds to the active place; the modal picker stays for mobile.
- Place selection uses compact horizontal controls; each active place exposes its stop list.
- Bus and subway selection uses synchronized multi-marker/list state and an explicit add action.
- Map zoom stays center-anchored so repeated gestures cannot drift the search area.
- Arrival rows prioritize route number and numeric ETA; inactive routes sort after active routes.
- Motion is restrained and collapses to 1ms under `prefers-reduced-motion`.

## COMMANDS

```bash
pnpm install
pnpm dev:api              # Bun watcher on :3000
pnpm dev:web              # Vite on 127.0.0.1:5173, proxies /api
pnpm typecheck
pnpm check                # Biome lint only; not a format check
pnpm test
pnpm build
pnpm start                # Requires dist/; run from repository root
HOST=127.0.0.1 pnpm start # Local-only production bind
docker compose up -d --build
docker compose logs -f web
```

## NOTES

- Production defaults to `HOST=0.0.0.0`, `PORT=3000`.
- Production needs outbound access to Seoul transit endpoints; the arrivals upstream is HTTP.
- Subway arrivals route through the personal k-skill proxy (holds the Seoul Open API
  key); override with `SUBWAY_ARRIVAL_UPSTREAM` if that moves.
- The production build is an installable PWA; offline mode restores the shell and saved local data,
  while live arrivals and new stop searches still require a connection.
- `pnpm test:e2e` is declared, but no Playwright config or E2E spec currently exists.
- No repository CI/deploy configuration exists; validation and artifact creation are external.
- `dist/` is ignored and must be built before `pnpm start`.
