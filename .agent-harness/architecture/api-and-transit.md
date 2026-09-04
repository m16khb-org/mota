---
name: api-and-transit
description: NestJS HTTP surface and Seoul transit adapter flow.
---

# API and Transit

Canonical index: [ARCHITECTURE.md](../ARCHITECTURE.md).

## API boundary

`apps/api` runs NestJS 11 on the Fastify adapter.

- Controllers parse untrusted input with shared Zod schemas.
- Transit controllers delegate upstream parsing and normalization to adapters.
- Nest serves `apps/web/dist` and the SPA fallback from the same process.
- `/api/*` never falls through to `index.html`.

Routes:

```text
GET  /api/health
GET  /api/auth/session
GET  /api/auth/google
GET  /auth/callback
POST /api/auth/logout
GET  /api/settings
PUT  /api/settings
GET  /api/stops/nearby
GET  /api/arrivals/:arsId
GET  /api/subway/nearby
GET  /api/subway/arrivals
GET  /api/transit-map/network
GET  /api/transit-map/events
```

HTTP status and request/response contracts are owned by
[OPEN_API_SPEC.md](../OPEN_API_SPEC.md).

## Nearby and arrival flow

```text
React browser
  → Nest TransitController
  → TransitCatalogService for nearby stop/station searches
  → in-memory Seoul bus and subway catalogs
  ← request-specific distance filtering and Zod-normalized response

TransitCatalogService warmup/scheduler
  → Seoul bus catalog or official Seoul T-Data station-master CSV
  ← atomically replaced catalog snapshot

Realtime arrival routes
  → Seoul bus/subway arrival adapter on every refresh
```

Nearby searches never call public transit catalogs per map position. The
single Nest process warms complete location catalogs asynchronously, refreshes
each source independently after `TRANSIT_CATALOG_REFRESH_MS` (24 hours by
default) with positive jitter, and retries a failed refresh after 15 minutes.
Concurrent loads share one promise; a failed refresh retains the last complete
snapshot, while a cold load still reports the established upstream error.

The bus snapshot covers a 45 km circle around `37.55,127`, which includes the
accepted center rectangle plus the maximum bus search radius. The subway
snapshot loads the quarterly official Seoul T-Data station-master CSV.
Canonical line/station rows remain separate until query-specific distance
filtering, after which same-name transfer rows select the nearest element.

## Live 3D transit flow

```text
React /3d-preview
  → GET /api/transit-map/network with bbox + zoom
  ← generated OSM subway GeoJSON + eligible Seoul bus topology

React EventSource
  → GET /api/transit-map/events with the same viewport
  ← ready → availability + complete vehicles → heartbeat

SubwayPositionCollector (one process-wide 10 s poll)
  → official Seoul realtimePosition by line
  ← station-segment vehicle snapshot shared by every subscriber

BusPositionCollectorRegistry (15 s poll per referenced route)
  → official Seoul route position API
  ← GPS snapshot shared by matching viewport subscribers
```

The subway network is a generated, deterministic TypeScript artifact from
OpenStreetMap route/platform data and is filtered in memory per viewport. Bus
topology calls are limited to eight concurrent requests and share 24-hour
promise caches for stop routes and route path/station data. Bus topology is
eligible only at zoom 16 or greater, at 4 km² or less, and at 40 routes or less.

Live collectors are process-local and single-flight. The subway collector is
shared across all subscribers. The bus registry reference-counts route
collectors and stops a route poll when its last subscriber leaves. A source
poll replaces its complete mode snapshot; a failure emits an empty snapshot
instead of retaining stale vehicle positions. Closing an SSE connection
releases all associated subscriptions.

`GET /api/health` remains non-gating liveness. `transitCatalogs` reports
nearby catalog state, while `liveTransit` reports bounded bus/subway source
success, failure, consecutive-failure, timestamp, duration, and availability
metrics without vehicle or user identifiers. All sharing is intentionally
single-process; multiple replicas would require a separate distributed
collection decision.

Server adapters validate untrusted upstream payloads. The browser clients
re-validate server JSON. Arrival presentation remains capped at the product
boundary; the 3D map vehicle stream does not apply that presentation limit.
