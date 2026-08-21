# PROJECT KNOWLEDGE BASE

**Generated:** 2026-08-21T19:00:00Z
**Commit:** aec1657
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
│   ├── app.ts              # Hono routes: parse → upstream adapter → error mapping
│   ├── upstream/           # Driven adapters: Seoul BIS, Overpass mirror race, subway proxy
│   ├── index.ts            # Production bind + static serving of dist/
│   └── config.ts           # Host/port configuration
├── public/                 # PWA manifest, install icon, registration, offline worker
├── src/
│   ├── api/                # Browser transport boundary; owns the injected LiveArrivalsPort
│   ├── components/         # UI, Leaflet map, picker, arrival presentation
│   ├── domain/             # Shared browser/server kernel: Zod schemas, estimators, query derivation
│   ├── hooks/              # Application layer: use-case orchestration, persistence, transitions
│   │   ├── commuteIdentity.ts       # Id + identity-key factories
│   │   ├── commuteProjections.ts    # Read queries over the aggregate
│   │   ├── commuteTransitions.ts    # Aggregate state transitions and invariants
│   │   ├── commutePointCleanup.ts   # Stop/station deletion cascades
│   │   └── commuteStopsStorage.ts   # Versioned localStorage repository (v1→v4)
│   ├── App.tsx             # Composition root: wires ports into hooks
│   ├── main.tsx            # React/Vite entry point
│   └── styles.css          # Global design system and responsive layout
├── ARCHITECTURE.md         # DDD/hexagonal/clean/OOP/SOLID contract for code structure
├── DESIGN.md               # Product, visual, interaction, and accessibility contracts
└── package.json            # pnpm scripts; Bun runtime
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Change bus stop/arrival contracts | `src/domain/bus.ts` | Shared by browser and server |
| Change subway station contracts | `src/domain/subway.ts` | OSM station normalization |
| Change upstream adapters (BIS/Overpass/proxy) | `server/upstream/` | Driven adapters: fetch + normalize; routes stay thin |
| Change HTTP routes/error shapes | `server/app.ts` | Parse → adapter → 400/502 mapping only |
| Change production bind/static serving | `server/index.ts`, `server/config.ts` | Serves prebuilt `dist/` |
| Change browser API calls | `src/api/client.ts` | Re-validates server JSON with Zod; owns `liveArrivalsPort` |
| Change live query derivation/freshness | `src/domain/liveCommuteQueries.ts` | Port type + pure derive/snapshot logic; no client import |
| Change app state/refresh flow | `src/App.tsx`, `src/hooks/useLiveCommuteSnapshots.ts` | Composition root wires the port into the controller |
| Change saved places/stops | `src/hooks/useCommuteStops.ts`, `commuteTransitions.ts`, `commutePointCleanup.ts`, `commuteStopsStorage.ts` | v4 storage; transitions own aggregate invariants; cleanup owns deletion cascades |
| Change procedure/favorite identity rules | `src/hooks/commuteIdentity.ts` | Id factories + exact identity keys |
| Change read queries over the aggregate | `src/hooks/commuteProjections.ts` | Active place/stop/projection lookups |
| Change place/route controls | `src/components/CommutePlaceManager.tsx`, `src/components/RoutePointList.tsx` | Bus and subway points |
| Change the ETA estimator | `src/domain/commuteEstimate.ts` | Pure; injected `now`; live-only leave guidance |
| Change architecture/layering rules | `ARCHITECTURE.md` | Read before moving modules across layers |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `BusStop` | interface | `src/domain/bus.ts` | Shared stop identity and coordinates |
| `estimateCommuteProcedure` | function | `src/domain/commuteEstimate.ts` | Pure ETA/leave-by estimator |
| `deriveLiveQueries` | function | `src/domain/liveCommuteQueries.ts` | Deduped active-query derivation |
| `LiveArrivalsPort` | type | `src/domain/liveCommuteQueries.ts` | Domain-named transport port |
| `liveArrivalsPort` | object | `src/api/client.ts` | Concrete port implementation (injected) |
| `App` | function | `src/App.tsx` | Composition root wiring ports into hooks |
| `createApp` | function | `server/app.ts` | Thin Hono routing; upstream injected |
| `fetchArrivals` | function | `src/api/client.ts` | Browser arrival transport boundary |
| `commuteTransitions` | module | `src/hooks/commuteTransitions.ts` | Aggregate state transitions and invariants |
| `commuteProjections` | module | `src/hooks/commuteProjections.ts` | Read queries over the aggregate |
| `commuteIdentity` | module | `src/hooks/commuteIdentity.ts` | Id factories + exact identity keys |
| `useLiveCommuteSnapshots` | hook | `src/hooks/useLiveCommuteSnapshots.ts` | Foreground-only refresh controller |
| `useCommuteStops` | hook | `src/hooks/useCommuteStops.ts` | Aggregate state, persistence, place mutations |
| `MapCanvas` | function | `src/components/MapCanvas.tsx` | Leaflet rendering and marker keyboard adapter |

## CONVENTIONS

- One strict `tsconfig.json` covers browser, server, tests, and tool configs.
- `ARCHITECTURE.md` is the binding layering contract: domain inward-only,
  adapters implement domain-named ports, composition roots inject them.
- `src/domain/**` imports only Zod and sibling domain modules — never React,
  `src/api`, `src/hooks`, `src/components`, or `server/**`.
- Browser and server share `src/domain/`; `src/` is not frontend-only.
- Parse untrusted values with Zod at every boundary: upstream, route input,
  browser JSON, and localStorage.
- Persist under `commute-bus-web:stops:v4`; the storage module owns v1→v4
  migration and is the only module touching that key family.
- Preserve branded `StopId`, `ArsId`, `RouteId`, `CommuteProcedureId`; ARS IDs
  are five-digit strings; persisted identity is never coerced.
- Model domain variation with discriminated unions + exhaustive `switch`;
  no abstract base classes, inheritance hierarchies, or `instanceof` chains
  in `src/domain`. Classes are for framework boundaries and error taxonomy.
- Aggregate invariants live in `commuteTransitions.ts` as pure functions;
  hooks validate with Zod then delegate to a transition.
- Relative imports only; no path aliases, barrels, or separate package boundaries.
- Tests live beside implementations. Server tests call Hono in memory with an
  injected upstream fetch; React tests opt into jsdom with a file directive.
- Async UI tests await rendered state (`findBy*`/`waitFor`); no sleeps or live transit calls.
- Both browser and server network paths use `AbortSignal.timeout(8_000)`,
  except nearby-subway search: the server races the four Overpass mirrors
  (1.5s stagger, 16s budget, 24h cache, 60s mirror cooldown) in
  `server/upstream/overpassStations.ts` and the browser allows 20s.
- A latest successful snapshot is live for at most 90 seconds; leave guidance
  requires a live first transit leg; persistence never stores snapshots/ETAs.
- The service worker precaches only the same-origin app shell; `/api/*` and map tiles stay live.
- Leave `beforeinstallprompt` to the browser; installation is exposed only through
  the address bar or browser menu, never an in-app install button.
- Samsung Internet needs explicit 192px and 512px PNG manifest icons; keep both raster assets.
- User-facing copy is short Korean task language. Keep technical upstream details out of errors.
- Treat `DESIGN.md` as the contract for layout, motion, accessibility, and content.

## ANTI-PATTERNS (THIS PROJECT)

- Do not import outward from `src/domain` (React, api, hooks, components, server);
  define a port type in domain and implement it in an adapter instead.
- Do not parse upstream payloads or add fetch/IO inside Hono routes; routes stay
  thin and delegate to `server/upstream/*` adapters.
- Do not add abstract base classes, inheritance hierarchies, `instanceof` chains,
  or constructor-enforced invariants to `src/domain`; use discriminated unions,
  exhaustive switches, and pure transition functions.
- Do not bypass `commuteTransitions.ts` when mutating the aggregate from a hook.
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
- Do not label the ETA as a fully live journey; it is live boarding waits plus
  saved travel estimates, and leave guidance needs a live first leg.
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
