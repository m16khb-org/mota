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
  → the subway arrival route reserves from the shared subway request
    budget first; a local denial returns 429 (owned by OPEN_API_SPEC.md)
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
  ← generated OSM subway GeoJSON (subway-only)

React EventSource
  → GET /api/transit-map/events with the same viewport
  ← ready → availability + complete vehicles → heartbeat

SubwayPositionCollector (one process-wide poll, budget-paced to one
  position request every 288 seconds)
  → persisted budget reservation, then official Seoul realtimePosition
    for the round-robin-selected line
  ← station-segment vehicle snapshot shared by every subscriber
```

The subway network is a generated, deterministic TypeScript artifact from
OpenStreetMap route/platform data and is filtered in memory per viewport.

Live collectors are process-local and single-flight. The subway collector is
shared across all subscribers. A source poll replaces the complete subway
snapshot; a failure emits an empty snapshot instead of retaining stale vehicle
positions. Vehicle observations older than 90 seconds are dropped, so a stale
upstream timestamp presents as unavailable rather than frozen movement.
Closing an SSE connection releases the subway subscription.

Subway arrivals and position turns share one persisted, rolling 24-hour
request budget spread across `subway_request_budget_scopes` and
`subway_request_reservations` (table inventory in
[identity-and-settings.md](identity-and-settings.md)): 900 requests per
window, split 600 arrivals and 300 positions, paced at 144 and 288 seconds.
Reservations happen before the upstream call, so failed requests consume
budget too. A provider `ERROR-337` response persists a 24-hour cooldown that
survives restarts; Seoul publishes no reset instant, so the cooldown always
lasts a full day. The budget meters only mota's calls, so an external
consumer sharing the same key can still exhaust it.

`GET /api/health` remains non-gating liveness. `transitCatalogs` reports
nearby catalog state, while `liveTransit` reports bounded bus/subway source
success, failure, consecutive-failure, timestamp, duration, and availability
metrics without vehicle or user identifiers. All sharing is intentionally
single-process; multiple replicas would require a separate distributed
collection decision.

Server adapters validate untrusted upstream payloads. The browser clients
re-validate server JSON. Arrival presentation remains capped at the product
boundary; the 3D map vehicle stream does not apply that presentation limit.
