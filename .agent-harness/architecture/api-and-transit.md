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
```

HTTP status and request/response contracts are owned by
[OPEN_API_SPEC.md](../OPEN_API_SPEC.md).

## Transit flow

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
accepted center rectangle plus the maximum bus search radius. The subway snapshot loads the quarterly official Seoul T-Data station-master
CSV. Canonical line/station rows remain separate until query-specific distance
filtering, after which same-name transfer rows select the nearest element.

`GET /api/health` remains non-gating liveness and reports each catalog's ready
state, item count, update time, last failure time, and next refresh time.
Catalogs are process-local and are intentionally not shared across replicas.
Arrival endpoints remain realtime and are not part of the location catalog.

Server adapters validate untrusted upstream payloads. The browser client
re-validates server JSON. Nearby searches occur only after an explicit user
action, and arrival presentation remains capped by the product contract.
