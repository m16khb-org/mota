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
| `GET /api/health` | service liveness plus non-gating transit catalog and live-source state |
| `GET /api/auth/session` | anonymous/authenticated session from the gateway cookie on this origin |
| `GET /api/auth/google` | starts Google login by proxying the auth-gateway, relaying its redirect and cookies |
| `GET /auth/callback` | completes login through the gateway proxy; **not** under `/api`, because the gateway accepts a callback target only at exactly this path |
| `POST /api/auth/logout` | proxies the gateway logout and relays its clearing cookies |
| `GET /api/settings` | authenticated user's versioned settings |
| `PUT /api/settings` | compare-and-swap settings update |
| `GET /api/stops/nearby` | nearby Seoul bus stops |
| `GET /api/arrivals/:arsId` | bus arrivals |
| `GET /api/subway/nearby` | nearby subway stations |
| `GET /api/subway/arrivals` | subway arrivals |
| `GET /api/transit-map/network` | viewport-filtered static subway network |
| `GET /api/transit-map/events` | named SSE frames for live availability, complete vehicle snapshots, and heartbeat |

The HTML-only catch-all serves the SPA. `/api/*` and non-HTML unknown paths remain 404 responses.

## Transit map viewport

Both transit-map endpoints require `west`, `south`, `east`, `north`, and `zoom`. Coordinates must stay in the accepted Seoul rectangle (`126.7..127.3`, `37.3..37.8`), west must be less than east, south less than north, and zoom must be `8..20`. Invalid input returns `400 INVALID_TRANSIT_MAP_VIEWPORT`.

`GET /api/transit-map/network` returns shared Zod-validated GeoJSON with a revision and generated timestamp. It sends `Cache-Control: public, max-age=300`, an ETag derived from the revision, and `304` for an identical `If-None-Match`. Subway routes and stations are always viewport-filtered from the generated OpenStreetMap artifact. The response is subway-only and contains no bus routes or stops.

`GET /api/transit-map/events` is `text/event-stream` with named `ready`, `availability`, `vehicles`, and `heartbeat` events. The stream is subway-only: `ready.modes` is always `["subway"]` and `vehicles`/`availability` carry only subway fields. `vehicles` is a complete replacement snapshot, never a patch. `availability` uses `live`, `no-service`, `unavailable`, `unconfigured`, or `zoom-required`. Response headers disable intermediary buffering and transformation. A client disconnect releases its shared subway collector subscription.

## Subway request budget

`GET /api/subway/arrivals` shares one persisted, rolling 24-hour Seoul subway
budget with the 3D map's position collector: 900 requests per window, split
into 600 arrival and 300 position requests. A request the budget denies is
answered locally as `429` without calling upstream.

- `SUBWAY_QUOTA_COOLDOWN`: the provider returned its quota-exhausted code
  (`ERROR-337`), the key entered a persisted 24-hour cooldown, and `retryAt`
  carries the ISO instant the cooldown ends.
- `SUBWAY_REQUEST_RATE_LIMITED`: the rolling cap, lane cap, or pacing interval
  blocked the request. `retryAt` carries the ISO instant a retry can succeed
  and is omitted when it cannot be determined.

The SSE stream never returns `429`. A budget denial looks there like any other
live-source failure: `availability` reports a non-live state and the vehicle
array is empty.

## Health response

`GET /api/health` always returns HTTP 200 while the process is live. Its
`transitCatalogs.bus` and `transitCatalogs.subway` objects expose `ready`,
`count`, `updatedAt`, `lastErrorAt`, and `nextRefreshAt`. Its
`liveTransit.bus` and `liveTransit.subway` objects expose source status,
success/failure counts, consecutive failures, last success/failure timestamps,
and last duration. Catalog warmup or live-source failure is observable but does
not fail service liveness.

## Contract ownership

- Request/response schemas: `packages/contracts/src/*.ts`.
- HTTP mapping: `apps/api/src/*/*.controller.ts`.
- Browser re-validation: `apps/web/src/api/client.ts` and `apps/web/src/api/transitMapClient.ts`.
- Upstream normalization: `apps/api/src/upstream/*`.

Parse query/body/upstream/browser JSON at the boundary with Zod. Keep controllers thin: parse, delegate, and map errors.

## Error semantics

- `400`: invalid query/body, including an invalid transit-map viewport.
- `400`: `return_to` that is not a same-site path; a gateway start or callback the gateway refused (`AUTH_GATEWAY_REJECTED`).
- `401`: settings endpoint without an authenticated session.
- `409`: settings version conflict.
- `429`: subway arrivals denied by the Seoul subway request budget, with `error` set to `SUBWAY_QUOTA_COOLDOWN` or `SUBWAY_REQUEST_RATE_LIMITED`.
- `502`: transit upstream failure on request/response endpoints.
- `503`: auth-gateway or Supabase JWKS unreachable (`AUTH_UPSTREAM_UNAVAILABLE`), or auth unconfigured (`AUTH_NOT_CONFIGURED`).
- `404`: unknown API or non-HTML path.

Live transit source failure is represented inside SSE `availability` plus an empty subway vehicle array rather than stale data. A broken SSE transport makes the browser clear the subway vehicles before automatic reconnection.

When an endpoint changes, update the shared schema, controller, browser client, and in-memory Nest tests together. Add Swagger/OpenAPI gates only if generation is introduced as a real project capability.
