---
name: overview
description: Mota local development, database, Docker deployment, and smoke-check runbook.
---

# Operations Overview

Canonical index: [OPERATIONS.md](../../OPERATIONS.md).

## Prerequisites

- Node 24-compatible runtime.
- pnpm `12.3.4` as pinned in the root package manifest.
- The sibling `../home-server-infra` PostgreSQL service with `mota` database and role for full API/integration use.

## Install and develop

```bash
pnpm install
pnpm dev:web
pnpm dev:api
```

Copy `.env.example` to `.env` and supply values locally. Never commit the populated file. `dev:web` runs Vite; `dev:api` runs Nest watch mode.

## Database

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

The API also runs Drizzle migrations during production startup. `DATABASE_URL` is required by repository/API integration tests; the normal test suite skips those files when it is absent.

## Build and start

```bash
pnpm typecheck
pnpm check
pnpm test
pnpm build
pnpm start
```

`pnpm start` expects built workspace artifacts and the web distribution path configured for the Nest static server.

## Transit catalog cache

The production API asynchronously warms the complete bus-stop
catalog, answers nearby searches by local distance filtering, and refreshes
that catalog. `TRANSIT_CATALOG_REFRESH_MS` sets the successful
refresh interval and defaults to `86400000` (24 hours); accepted values are 1
minute through 7 days. A failed refresh keeps the last complete snapshot and
retries after 15 minutes.

`GET /api/health` remains a 200 liveness endpoint even while a catalog is
warming or an upstream source is unavailable. Inspect
`transitCatalogs.bus` for `ready`, `count`,
`updatedAt`, `lastErrorAt`, and `nextRefreshAt`. Production startup rejects
implausible successful replacements below 10,000 bus stops, but this does not make process liveness fail.

## Retired subway infrastructure

No subway API key or cooldown configuration is consumed by the app. The
subway catalog, arrivals, live map and budget runtime are removed. Historical
SQL migrations and quota table definitions remain; do not drop them as part of
this conversion. Legacy settings migrate at the shared parsing boundary and
retain all valid bus selections without a bulk database rewrite.

## Docker deployment

```bash
docker compose --env-file ../home-server-infra/.env up -d --build
```

The service binds `127.0.0.1:3100`, reaches Supabase Auth over outbound HTTPS, and PostgreSQL on `home-server`. Compose obtains the shared password and Supabase credentials from the sibling infra environment file.

## Smoke checks

```bash
curl -fsS http://127.0.0.1:3100/api/health
curl -fsS http://127.0.0.1:3100/api/auth/session
curl -sS -o /dev/null -w '%{http_code}
' http://127.0.0.1:3100/api/settings
curl -fsS -o /dev/null -w '%{http_code}
' http://127.0.0.1:3100/
```

Expected anonymous results are health 200, `{ "authenticated": false }`, settings 401, and SPA 200. Also exercise one real transit endpoint when outbound network is available. After a fresh production start, wait for `transitCatalogs.bus.ready` before treating nearby search warmup as complete.

## Unknown / not confirmed

The repository has an OpenWiki update workflow; application CI is not configured in that workflow. Deployment automation beyond `compose.yaml` and the external Cloudflare/home-server infrastructure is not documented here.
