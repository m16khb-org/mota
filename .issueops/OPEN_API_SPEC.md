---
name: OPEN_API_SPEC.md
api_doc_mode: contract-tests
description: Mota HTTP endpoint, validation, and error-contract owner.
---

# HTTP API Contract

Mota exposes NestJS controllers but does not currently configure Swagger or generate an OpenAPI document. Do not claim a published OpenAPI artifact exists.

## Endpoints

| Endpoint | Responsibility |
|---|---|
| `GET /api/health` | service liveness plus non-gating bus catalog state |
| `GET /api/auth/session` | anonymous/authenticated session from the gateway cookie on this origin |
| `GET /api/auth/google` | starts Google login by proxying the auth-gateway, relaying its redirect and cookies |
| `GET /auth/callback` | completes login through the gateway proxy; **not** under `/api`, because the gateway accepts a callback target only at exactly this path |
| `POST /api/auth/logout` | proxies the gateway logout and relays its clearing cookies |
| `GET /api/settings` | authenticated user's versioned settings |
| `PUT /api/settings` | compare-and-swap settings update |
| `GET /api/stops/nearby` | nearby Seoul bus stops |
| `GET /api/arrivals/:arsId` | bus arrivals |

The HTML-only catch-all serves the SPA. `/api/*` and non-HTML unknown paths remain 404 responses.

## Retired routes

Mota is bus-only. `/api/subway/nearby`, `/api/subway/arrivals`,
`/api/transit-map/network` and `/api/transit-map/events` return 404 without
calling an upstream service. There is no SSE or subway quota API.

## Health response

`GET /api/health` returns HTTP 200 while the process is live. Its
`transitCatalogs.bus` object exposes `ready`, `count`, `updatedAt`,
`lastErrorAt`, and `nextRefreshAt`. Catalog warmup or upstream failure does
not fail service liveness. No subway or live-vehicle status is reported.

## Settings compatibility

Each commute context contains `busStops` and `selectedBusStopIds` only.
Legacy mixed documents are parsed at the shared boundary: obsolete subway
fields are ignored, while bus fields remain validated. Legacy flat settings
and singular `selectedBusStopId` are migrated on read. CAS versions and
anonymous/authenticated storage isolation remain unchanged.

## Contract ownership

- Request/response schemas: `packages/contracts/src/*.ts`.
- HTTP mapping: `apps/api/src/*/*.controller.ts`.
- Browser re-validation: `apps/web/src/api/client.ts`.
- Upstream normalization: `apps/api/src/upstream/*`.

Parse query/body/upstream/browser JSON at the boundary with Zod. Keep controllers thin: parse, delegate, and map errors.

## Error semantics

- `400`: invalid query/body.
- `400`: `return_to` that is not a same-site path; a gateway start or callback the gateway refused (`AUTH_GATEWAY_REJECTED`).
- `401`: settings endpoint without an authenticated session.
- `409`: settings version conflict.
- `502`: transit upstream failure on request/response endpoints.
- `503`: auth-gateway or Supabase JWKS unreachable (`AUTH_UPSTREAM_UNAVAILABLE`), or auth unconfigured (`AUTH_NOT_CONFIGURED`).
- `404`: unknown API or non-HTML path.

When an endpoint changes, update the shared schema, controller, browser client, and in-memory Nest tests together. Add Swagger/OpenAPI gates only if generation is introduced as a real project capability.
