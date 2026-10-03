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
```

HTTP status and request/response contracts are owned by
[OPEN_API_SPEC.md](../OPEN_API_SPEC.md).

## Nearby and arrival flow

```text
React browser
  → Nest TransitController
  → TransitCatalogService for nearby bus-stop searches
  → in-memory Seoul bus catalog
  ← request-specific distance filtering and Zod-normalized response

TransitCatalogService warmup/scheduler
  → Seoul bus catalog
  ← atomically replaced catalog snapshot

Realtime arrival routes
  → Seoul bus arrival adapter on every refresh
```

Nearby searches never call public transit catalogs per map position. The
single Nest process warms the complete bus-stop catalog asynchronously, refreshes
the bus catalog after `TRANSIT_CATALOG_REFRESH_MS` (24 hours by
default) with positive jitter, and retries a failed refresh after 15 minutes.
Concurrent loads share one promise; a failed refresh retains the last complete
snapshot, while a cold load still reports the established upstream error.

The bus snapshot covers a 45 km circle around `37.55,127`, which includes the
accepted center rectangle plus the maximum bus search radius.

## Bus-only lifecycle

Subway lookup, catalog warmup, position collection, request-budget runtime and
transit-map REST/SSE endpoints are retired. No subway API key is read or needed.
`GET /api/health` reports bus catalog state and remains non-gating liveness.
Historical SQL migrations and quota table definitions are retained but unused.

Adapters validate upstream payloads and browser clients re-validate server JSON.
Arrival rows are capped at three only at the presentation boundary.
