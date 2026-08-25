---
name: OPEN_API_SPEC.md
description: Mota HTTP endpoint, validation, and error-contract owner.
---

# HTTP API Contract

Mota exposes NestJS controllers but does not currently configure Swagger or generate an OpenAPI document. Do not claim a published OpenAPI artifact exists.

## Endpoints

| Endpoint | Responsibility |
|---|---|
| `GET /api/health` | service health |
| `GET /api/auth/session` | anonymous/authenticated session from mota's own cookies |
| `GET /api/auth/google` | starts the Google PKCE login (host-only flow cookies, account chooser) |
| `GET /api/auth/callback` | completes login, sets mota session cookies, redirects |
| `POST /api/auth/logout` | clears mota session cookies, revokes the Supabase session |
| `GET /api/settings` | authenticated user's versioned settings |
| `PUT /api/settings` | compare-and-swap settings update |
| `GET /api/stops/nearby` | nearby Seoul bus stops |
| `GET /api/arrivals/:arsId` | bus arrivals |
| `GET /api/subway/nearby` | nearby subway stations |
| `GET /api/subway/arrivals` | subway arrivals |

The HTML-only catch-all serves the SPA. `/api/*` and non-HTML unknown paths remain 404 responses.

## Contract ownership

- Request/response schemas: `packages/contracts/src/*.ts`.
- HTTP mapping: `apps/api/src/*/*.controller.ts`.
- Browser re-validation: `apps/web/src/api/client.ts`.
- Upstream normalization: `apps/api/src/upstream/*`.

Parse query/body/upstream/browser JSON at the boundary with Zod. Keep controllers thin: parse, delegate, and map errors.

## Error semantics

- `400`: invalid query/body.
- `401`: settings endpoint without an authenticated session; invalid OAuth callback.
- `409`: settings version conflict.
- `502`: transit upstream failure.
- `503`: Supabase Auth unavailable or auth unconfigured.
- `404`: unknown API or non-HTML path.

When an endpoint changes, update the shared schema, controller, browser client, and in-memory Nest tests together. Add Swagger/OpenAPI gates only if generation is introduced as a real project capability.
