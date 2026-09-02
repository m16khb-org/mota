---
name: OPEN_API_SPEC.md
description: Mota HTTP endpoint, validation, and error-contract owner.
---

# HTTP API Contract

Mota exposes NestJS controllers but does not currently configure Swagger or generate an OpenAPI document. Do not claim a published OpenAPI artifact exists.

## Endpoints

| Endpoint | Responsibility |
|---|---|
| `GET /api/health` | service liveness plus non-gating transit catalog state |
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

The HTML-only catch-all serves the SPA. `/api/*` and non-HTML unknown paths remain 404 responses.

## Health response

`GET /api/health` always returns HTTP 200 while the process is live. Its
`transitCatalogs.bus` and `transitCatalogs.subway` objects expose `ready`,
`count`, `updatedAt`, `lastErrorAt`, and `nextRefreshAt`. A warming or failed
catalog is observable there but does not fail service liveness; nearby transit
routes continue to use the established 502 error when no snapshot is available.

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
- `502`: transit upstream failure.
- `503`: auth-gateway or Supabase JWKS unreachable (`AUTH_UPSTREAM_UNAVAILABLE`), or auth unconfigured (`AUTH_NOT_CONFIGURED`).
- `404`: unknown API or non-HTML path.

When an endpoint changes, update the shared schema, controller, browser client, and in-memory Nest tests together. Add Swagger/OpenAPI gates only if generation is introduced as a real project capability.
