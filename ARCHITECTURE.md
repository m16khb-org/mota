# ARCHITECTURE

Architectural analysis and contract for 모타 (mota). This document maps the
codebase onto DDD, hexagonal (ports & adapters), clean architecture, OOP, and
SOLID, records the deliberate deviations, and defines the refactoring rules
that follow from it. `DESIGN.md` remains the product/visual contract; this file
is the code-structure contract. Update it before changing layer boundaries.

## Style in one paragraph

Pragmatic layered/hexagonal architecture in a functional-first TypeScript
idiom: immutable data, Zod-branded value objects, discriminated unions, and
pure functions instead of class taxonomies. React owns presentation; a thin
application layer of hooks orchestrates use cases; a pure `src/domain` shared
kernel holds entities and domain services; adapters translate Seoul BIS,
Overpass, the subway proxy, and localStorage into domain shapes. Dependencies
point inward only — domain imports nothing outward.

## Layer map

| Layer | Location | Rules |
|---|---|---|
| Domain (shared kernel) | `src/domain/` | Pure: Zod schemas, branded value objects, estimators, query derivation, snapshot freshness. No React, no fetch, no storage imports. Imported by browser and server alike. |
| Application | `src/hooks/` | Use-case orchestration bound to React: refresh controller, persistence effect, mutation façades, arrival-detail coordination. May import domain and adapters; never imported by domain. |
| Presentation | `src/components/`, `src/App.tsx` | Rendering, a11y, layout. `App.tsx` is the composition root that wires ports into hooks. No schema parsing of upstream payloads, no persistence logic. |
| Outbound adapters (browser) | `src/api/client.ts` | Transport + Zod re-validation of server JSON. Owns the concrete `liveArrivalsPort` implementation injected into the refresh controller. |
| Persistence adapter | `src/hooks/commuteStopsStorage.ts` | Versioned localStorage repository (v1→v4 migration). No React imports; colocated with hooks as a documented boundary decision. |
| Server (driving + driven) | `server/app.ts`, `server/upstream/` | `app.ts` owns Hono routing, request validation, and error mapping only. `server/upstream/*` are the driven adapters: Seoul BIS fetch, Overpass mirror race with cache/cooldown, subway arrival proxy. |
| Composition roots | `src/main.tsx`, `src/App.tsx`, `server/index.ts` | Framework bootstrap. `createApp(upstreamFetch, deps)` receives the upstream port for in-memory tests. |

## Clean architecture dependency rule

```
presentation (components, App)      server routes (app.ts)
        │                                  │
        ▼                                  ▼
application (hooks) ─────────▶ domain (src/domain) ◀── normalization at the edge
        │                                  ▲
        ▼                                  │
adapters (api/client, storage, server/upstream)
```

- Domain depends on nothing but Zod and itself.
- Adapters depend inward (they import domain types and schemas).
- Application and presentation never appear in domain imports.
- The single historical violation (domain `liveCommuteQueries` importing
  `api/client`) was removed by introducing the `LiveArrivalsPort` abstraction;
  the concrete port lives in `api/client.ts` and is injected by callers.

## DDD mapping

| DDD concept | Code | Notes |
|---|---|---|
| Entity | `SavedCommuteProcedure`, `CommuteFavorite` | Identity by branded id; lifecycle states modeled explicitly. |
| Aggregate | `CommuteStops` → per-direction `DirectionCollection` → `CommutePlace` | Invariants enforced in `commuteTransitions.ts`: procedures must reference saved points, ready procedures never survive dangling references, favorites dedupe by identity key, cascade cleanup on point deletion. |
| Value object | Branded ids (`StopId`, `ArsId`, `RouteId`, `CommuteProcedureId`, …), minute durations, `LiveQuery`, `LiveSnapshot` | Branded primitives + `strictObject` schemas; no behavior-bearing classes needed. |
| Domain service | `estimateCommuteProcedure`, `deriveLiveQueries` + `snapshotBasis` | Pure; time is injected (`now`), never read from the wall clock inside. |
| Repository | `commuteStopsStorage.ts` | Versioned localStorage persistence with migration; the only module allowed to touch the storage key family. |
| Anti-corruption layer | `normalizeNearbyStops`, `normalizeArrivals`, `normalizeNearbySubwayStations`, `normalizeSubwayArrivals` + `apiStationName` aliasing | Upstream Seoul/OSM dialects are translated to domain shapes at the edge; UI never sees raw payloads. |
| Ubiquitous language | 절차 (procedure), 즐겨찾기 (favorite), 회사/집 (company/home), 방면 (direction) | Korean UI copy maps 1:1 onto domain identifiers; keep new features aligned. |

Key invariants (enforced by transitions, guarded by tests):

- Identity is exact, never fuzzy: bus `stopId+arsId+routeId+normalized direction`;
  subway `stationId+apiStationName+subwayId+updnLine`. Display labels never
  participate in matching.
- A latest success is live for at most 90 seconds; leave guidance requires a
  live first transit leg; nothing persisted contains snapshots, ETAs, or raw
  payloads.
- superseded v3 route options are discarded on migration (never kept as
  drafts); zero/negative durations are unrepresentable (`int().min(1)`).

## Hexagonal ports & adapters

Driving side (world → app): Hono routes in `server/app.ts`; React UI.

Driven side (app → world), each a named port with injected implementations:

| Port | Abstraction | Adapter | Injected at |
|---|---|---|---|
| Upstream fetch (server) | `UpstreamFetch = typeof fetch` | `server/upstream/*` call sites | `createApp(upstreamFetch, deps)` — tests pass an in-memory fake |
| Live arrivals (browser) | `LiveArrivalsPort(query) → {updatedAt, arrivals}` | `liveArrivalsPort` in `api/client.ts` | `useLiveCommuteSnapshots` / tests pass it into `refreshLiveQueries` |
| Persistence | `loadCommutes`/`saveCommutes` | `commuteStopsStorage.ts` | Module boundary; swappable in tests via storage fixtures |
| Clock & timers | `now`, `sleep`, `AbortSignal.timeout` | callers of estimators/controllers | `estimateCommuteProcedure(..., now)`, `createApp` deps |

Server upstream adapters (`server/upstream/`):

- `seoulBus.ts` — nearby-stops and ARS arrivals fetch + normalize.
- `overpassStations.ts` — mirror race (1.5 s stagger, 16 s budget), 24 h result
  cache, 60 s per-mirror failure cooldown, stale-cache fallback.
- `subwayArrivals.ts` — k-skill proxy fetch + normalize.

Routes stay thin: parse → call adapter → map `UpstreamError` details to the
fixed 400/502 JSON shapes. Keep it that way; new endpoints follow the same
split.

## OOP in this codebase

The stack is React + Zod, so "object-oriented" is applied structurally, not by
adding classes:

- **Sum types over inheritance**: steps `walk | bus | subway`, favorites
  `bus | subway`. Exhaustive `switch`
  narrowing replaces visitor/polymorphism and is compiler-enforced.
- **Interfaces for structure**: ports are structural function/object types,
  not class hierarchies.
- **Behavior near data, not on it**: transitions and estimators are free
  functions over immutable shapes; mutation happens by producing new aggregate
  values.
- **Where classes exist** (`ApiError`, Leaflet wrappers), they are framework
  boundaries or error taxonomy, not domain models.

Rule: do not introduce abstract base classes or inheritance hierarchies into
`src/domain`. Prefer a discriminated union plus an exhaustive switch.

## SOLID mapping

- **S — Single responsibility**: one module, one reason to change. The former
  490-LOC `commuteStopsSelectors.ts` was split into `commuteIdentity.ts` (id +
  identity-key factories), `commuteProjections.ts` (read queries),
  `commuteTransitions.ts` (aggregate state transitions), and
  `commutePointCleanup.ts` (stop/station deletion cascades). `server/app.ts`
  was split from routing-plus-upstream-IO into routing + `upstream/` adapters.
- **O — Open/closed**: new arrival sources or storage versions extend by new
  adapter implementations and schema versions; existing domain switches stay
  closed (the compiler flags non-exhaustive handling).
- **L — Liskov**: no subtype hierarchies; structural typing plus branded
  primitives makes substitution trivial and makes illegal mixes (ARS id as
  stop id) unrepresentable.
- **I — Interface segregation**: ports are minimal — `LiveArrivalsPort` is a
  single function; `UpstreamFetch` mirrors `fetch`; consumers depend on
  exactly what they call.
- **D — Dependency inversion**: domain and routes name abstractions
  (`LiveArrivalsPort`, `UpstreamFetch`, injected `now`); concrete adapters are
  bound only at composition roots (`App.tsx`/hooks, `createApp`).

## Deliberate deviations (accepted, documented)

- `App.tsx` is a ~380-LOC composition root. It wires ports and state, and its
  internal units are extracted (MapStage, useCommuteDailyLive, useArrivalDetail).
  Further splitting would scatter wiring without reducing risk.
- The persistence repository lives in `src/hooks/` although it has no React
  imports — colocated because every consumer is a hook; moving it would churn
  imports for zero behavior change. Revisit only if a non-hook consumer
  appears.
- `src/domain` is a browser/server shared kernel rather than a separate
  package (repo rule: no package boundaries, relative imports only).
- Dev-only React StrictMode double-mount causes one extra refresh generation;
  the generation guard already rejects stale results.

## Refactoring rules derived from this document

1. Domain purity is load-bearing: `src/domain/**` must not import React,
   `src/api`, `src/hooks`, `src/components`, or `server/**`. If domain needs an
   effect, define a port type in domain and implement it in an adapter.
2. New upstream sources go into `server/upstream/` (or a browser adapter) with
   normalization; routes only parse/validate/map errors.
3. Aggregate changes go through `commuteTransitions.ts` (deletion cascades
   live in `commutePointCleanup.ts`); keep invariants there, keep functions
   pure, and extend tests in
   `useCommuteStops.test.tsx`/`commuteStopsStorage.test.ts`.
4. Do not grow god-modules: when a hooks- or server file crosses ~300 pure
   LOC or gains a second responsibility, split it the way the selectors were
   split.
5. Ports stay narrow and injected; no module reaches outward for a concrete
   implementation it can receive as an argument.
6. Model domain variation with sum types (discriminated unions + exhaustive
   `switch`), not inheritance: a new `kind` literal must make every consumer
   fail to compile until handled. Do not introduce abstract base classes,
   deep type hierarchies, or `instanceof` chains into `src/domain`; reserve
   classes for framework boundaries and error taxonomy. Keep behavior near
   data as pure functions over immutable values; aggregate invariants are
   enforced in transitions, not in constructors or setters.
