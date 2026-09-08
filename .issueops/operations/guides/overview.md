---
name: overview
description: Mota local development, database, Docker deployment, and smoke-check runbook.
---

# Operations Overview

Canonical index: [OPERATIONS.md](../../OPERATIONS.md).

## Prerequisites

- Node 24-compatible runtime.
- Corepack with pnpm `11.21.0`.
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

The production API asynchronously warms complete bus-stop and subway-station
catalogs, answers nearby searches by local distance filtering, and refreshes
each source independently. `TRANSIT_CATALOG_REFRESH_MS` sets the successful
refresh interval and defaults to `86400000` (24 hours); accepted values are 1
minute through 7 days. A failed refresh keeps the last complete snapshot and
retries after 15 minutes.

`GET /api/health` remains a 200 liveness endpoint even while a catalog is
warming or an upstream source is unavailable. Inspect
`transitCatalogs.bus` and `transitCatalogs.subway` for `ready`, `count`,
`updatedAt`, `lastErrorAt`, and `nextRefreshAt`. Production startup rejects
implausible successful replacements below 10,000 bus stops or 100 subway
station elements, but this does not make process liveness fail.

## Seoul subway request budget

One issued `SEOUL_SUBWAY_API_KEY` serves both subway arrivals and the 3D map's
position collector, so every official call reserves from a single PostgreSQL
budget before the upstream request is made.

- The cap is 900 requests per rolling 24 hours, kept below the provider's
  documented 1,000 daily ceiling: 600 for arrivals, 300 for position turns.
- Calls are paced: at most one arrival request every 144 seconds and one
  position request every 288 seconds, with position turns rotating across the
  configured lines.
- A reservation is written before the upstream call, so failures and timeouts
  consume budget exactly like successful calls.
- `subway_request_budget_scopes` stores only the SHA-256 hash of the key
  (never the key), the position rotation cursor, and the cooldown deadline.
  `subway_request_reservations` stores one row per reserved request. Row
  locking keeps the cap accurate across restarts and concurrent processes.
- When the provider answers with quota code `ERROR-337`, the API persists a
  24-hour cooldown and refuses subway requests until it expires. Seoul
  documents a daily cap but no reset instant, so the cooldown lasts a full day
  instead of assuming a calendar-midnight reset.
- `SEOUL_SUBWAY_QUOTA_COOLDOWN_UNTIL` (ISO instant) seeds that cooldown at
  startup. Set it when the key is already exhausted so a fresh deploy does not
  probe the provider and burn another official request.
- The budget meters only mota's calls. External consumers sharing the same key
  can still exhaust it; nothing here protects against that.

Migration `0001_subway_request_budget.sql` is additive: two new tables, no
change to existing rows. Production startup applies pending migrations automatically.
For an exhausted key, export `SEOUL_SUBWAY_QUOTA_COOLDOWN_UNTIL` before running
Compose; the service forwards it to the API without storing the key or deadline
in a tracked file.

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

Expected anonymous results are health 200, `{ "authenticated": false }`, settings 401, and SPA 200. Also exercise one real transit endpoint when outbound network is available. After a fresh production start, wait for both `transitCatalogs.*.ready` values before treating nearby search warmup as complete.

## Unknown / not confirmed

No repository CI workflow was found. Deployment automation beyond `compose.yaml` and the external Cloudflare/home-server infrastructure is not documented here.
