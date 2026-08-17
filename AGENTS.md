# PROJECT KNOWLEDGE BASE

**Generated:** 2026-08-17T15:12:50Z
**Commit:** cb2dfa4
**Branch:** main

## OVERVIEW

Korean commute-bus web app: React 19/Vite frontend plus Bun/Hono server adapter.
The server normalizes Seoul transit stop and arrival payloads; the browser stores multiple
named company/home places with multiple direction-specific stops per place.

## STRUCTURE

```text
commute-bus-web/
├── server/                 # Bun/Hono API adapter and production static server
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
| Change stop/arrival data contracts | `src/domain/bus.ts` | Shared by browser and server |
| Change upstream request handling | `server/app.ts` | Hono routes, 8s timeout, 400/502 mapping |
| Change production bind/static serving | `server/index.ts`, `server/config.ts` | Serves prebuilt `dist/` |
| Change browser API calls | `src/api/client.ts` | Re-validates server JSON with Zod |
| Change app state/refresh flow | `src/App.tsx` | Direction, active place/stop, arrivals |
| Change saved places/stops | `src/hooks/useCommuteStops.ts`, `src/hooks/commuteStopsStorage.ts` | v2 storage; migrates v1 |
| Change place/stop controls | `src/components/CommutePlaceManager.tsx` | Add, rename, select, remove |
| Change map behavior/accessibility | `src/components/MapCanvas.tsx` | Used by main view and picker |
| Change stop search/selection modal | `src/components/MapPicker.tsx` | Explicit search and save |
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
| `MapPicker` | function | `src/components/MapPicker.tsx` | 7 | Search, candidate selection, modal focus |
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
- Both browser and server network paths use `AbortSignal.timeout(8_000)`.
- User-facing copy is short Korean task language. Keep technical upstream details out of errors.
- Treat `DESIGN.md` as the contract for layout, motion, accessibility, and content.

## ANTI-PATTERNS (THIS PROJECT)

- Do not fetch nearby stops continuously while the map moves; search only from
  `이 위치에서 찾기`.
- Do not overwrite a saved stop until explicit save; closing the picker preserves it.
- Do not identify a stop by name alone. Keep name, five-digit ARS ID, and map/direction context.
- Do not clear saved stops or arrivals silently on timeout/error; preserve state and expose retry.
- Do not bypass shared domain schemas or parse Seoul upstream payloads inside UI components.
- Do not let color carry state alone or remove keyboard/list alternatives for map actions.
- Do not announce every map movement to assistive technology.
- Do not add gradients, glass effects, nested cards, excessive rounding, decorative illustration,
  or large empty hero space.

## UNIQUE STYLES

- Urban-utility visual language: high-contrast black/white, lime `--signal`, blue map focus.
- Desktop is a 400px control rail plus full map; below 960px it becomes map plus bottom sheet.
- Place selection uses compact horizontal controls; each active place exposes its stop list.
- Stop selection uses synchronized marker/list state and an explicit add action.
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
```

## NOTES

- Production defaults to `HOST=0.0.0.0`, `PORT=3000`.
- Production needs outbound access to Seoul transit endpoints; the arrivals upstream is HTTP.
- `pnpm test:e2e` is declared, but no Playwright config or E2E spec currently exists.
- No repository CI/deploy configuration exists; validation and artifact creation are external.
- `dist/` is ignored and must be built before `pnpm start`.
