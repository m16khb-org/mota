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
GET  /api/auth/callback
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
  → Seoul bus/subway or Overpass adapter
  ← Zod-normalized response
```

Server adapters validate untrusted upstream payloads. The browser client
re-validates server JSON. Nearby searches occur only after an explicit user
action, and arrival presentation remains capped by the product contract.
