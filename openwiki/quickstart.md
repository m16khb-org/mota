---
type: quickstart
title: Mota Quickstart
description: Entry point into mota and this wiki — what the four-workspace monorepo contains, the minimal install/run/verify command set, the environment the API needs (the mota Postgres database and the home-server-infra secret file), and a task-to-page routing map to the page that covers each kind of change.
tags: [quickstart, getting-started, commands, development, environment, routing, monorepo, pnpm, turbo]
verified:
  - by: openwiki/0.4.3
    at: 2026-08-29T08:06:29.177Z
sources:
  - id: openwiki-source-5f5b95b3d6a215fa02ceb945
    resource: repo://.env.example
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-80276df55c8da3940ca5955f
    resource: repo://apps/api/package.json
  - id: openwiki-source-b34d1b00223a158f6d488314
    resource: repo://apps/api/src/auth/sessionCookies.ts
  - id: openwiki-source-7c7a4c4b81e392d6121624b8
    resource: repo://apps/api/src/config/env.ts
  - id: openwiki-source-21ae2b3d09bb360e3ca0d453
    resource: repo://apps/api/src/health/health.controller.ts
  - id: openwiki-source-ac07cae48b06bdae0960d54e
    resource: repo://apps/api/src/main.ts
  - id: openwiki-source-f36c9e40c30794ec4fe6b2ad
    resource: repo://apps/api/src/upstream/subwayArrivals.ts
  - id: openwiki-source-345c31f1252bb5cf22547bff
    resource: repo://apps/api/test/settings.postgres.integration.test.ts
  - id: openwiki-source-03f6dd3375679341910a29c1
    resource: repo://apps/web/vite.config.ts
  - id: openwiki-source-e201e686a785f09b6d899f0b
    resource: repo://compose.yaml
  - id: openwiki-source-bb1ebe868e35e9e500714501
    resource: repo://Dockerfile
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-a62851a006529d8fbf774ab5
    resource: repo://packages/contracts/package.json
  - id: openwiki-source-fcf655c5ad67eaa2d029c7df
    resource: repo://packages/db/drizzle.config.ts
  - id: openwiki-source-5dfb476f661ea873868a4a09
    resource: repo://packages/db/package.json
  - id: openwiki-source-90a67949f5e74d37a9a40b56
    resource: repo://packages/db/src/migrate.ts
  - id: openwiki-source-9d10bdf130b53f8b5ce12782
    resource: repo://packages/db/src/repository.integration.test.ts
  - id: openwiki-source-22f6a46d0cbec478f7e449e3
    resource: repo://packages/db/src/schema.ts
  - id: openwiki-source-40275cb92c3610938f16ade3
    resource: repo://pnpm-workspace.yaml
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-440ae1e215cb02721dda855c
    resource: repo://turbo.json
generated: { by: "openwiki/0.4.3", at: "2026-08-29T08:06:29.177Z" }
---

# Mota Quickstart

Mota is a React and NestJS application for checking the next Seoul bus or
subway arrivals: pick a bus stop or a subway station/direction and see at most
three upcoming arrivals. This page is the front door of the wiki. It gives the
shortest path to a running checkout, the exact command set the README and
`AGENTS.md` use for verification, and a table that routes "what do you want to
do" to the page that covers it. Everything deeper lives on those pages — the
generated folder index pages carry the full navigation, so this page only
routes by task.

## What you are working with

A pnpm workspace managed by Turborepo, with exactly four workspaces:

| Workspace | Package | Role |
|---|---|---|
| `apps/web` | `@mota/web` | React 19 + Vite PWA: UI, Leaflet map, browser adapters, anonymous `localStorage` storage |
| `apps/api` | `@mota/api` | NestJS 11 on Fastify: `/api/*` controllers, Seoul upstream adapters, Supabase PKCE login, JWKS verification |
| `packages/contracts` | `@mota/contracts` | Shared Zod schemas — the only code both apps share |
| `packages/db` | `@mota/db` | Drizzle ORM: PostgreSQL schema, migrations, the `user_settings` repository |

Only `apps/api` ever runs as a process. In production it is one Node 24
container (started with `node apps/api/dist/main.js`; locally `pnpm start`)
serving **both** the built Vite app and `/api/*`; `apps/web` exists as a source
tree that is built into static assets served by that container. In development
the two are separate processes that meet at an HTTP proxy (below).

Toolchain notes: pnpm is pinned by the root `packageManager` field
(`pnpm@11.23.0`), the Docker build activates corepack `pnpm@11.21.0` — bump one,
check the other. Lint/format is Biome, tests are Vitest, and there is no ESLint,
Prettier, or Jest anywhere.

## First run

```bash
pnpm install
```

Then configure the environment. The API cannot boot without a database and a
Supabase project:

1. **Copy `.env.example` to `.env`** and set `DATABASE_PASSWORD` for the
   dedicated `mota` role. The `mota` PostgreSQL database is managed by
   `../home-server-infra`; `.env.example` points local development at
   `127.0.0.1:15432` with database and user `mota`. Note the API's own env
   schema defaults to port `5432` on host `home-server-pg` — the `.env`
   values are what steer local dev to your local tunnel/port-forward.
2. **Set `SUPABASE_URL` and `SUPABASE_ANON_KEY`** to the shared Supabase
   project (the same project the other home-server services use). Both are
   required with no default.
3. **Make sure the values actually reach the process you start.** Nothing in
   the repository's own code or scripts loads a dotenv file: `loadEnv()`
   (`apps/api/src/config/env.ts`), `packages/db/src/migrate.ts`, and the API
   tests all read `process.env`, and `loadEnv` throws on a missing or
   malformed value before any socket opens. Export the file into your shell
   (`set -a; . ./.env; set +a`) rather than assuming `pnpm dev:api` will find
   `.env` by itself. The one partial exception is the Drizzle CLI, below.

Start the two dev processes (either shell works):

```bash
pnpm dev:web   # Vite on 127.0.0.1:5173, proxies /api to 127.0.0.1:3000
pnpm dev:api   # nest start --watch, listens on 0.0.0.0:3000 by default
```

`pnpm dev` runs both through turbo. Both scripts are `turbo run dev --filter=…`,
so the shared packages are compiled (`^build`) once before either watcher
starts. Open `http://localhost:5173` — the browser talks to the API through the
Vite proxy, so you need both processes for anything beyond the static shell.

Smoke test the API directly:

```bash
curl http://127.0.0.1:3000/api/health
```

`GET /api/health` answers `{ "status": "ok", "service": "mota",
"transitCatalogs": … }`; it is the cheapest proof that boot, env, and migrations
all succeeded.

## The command set

These are the commands `README.md` and `AGENTS.md` actually use. The
development and verification entries are `turbo run` invocations, so each runs
in every workspace that defines the task and builds the shared packages first;
the database entries bypass turbo and target one workspace.

**Development**

| Command | What it does |
|---|---|
| `pnpm dev:web` | Vite dev server for `apps/web` (persistent watcher) |
| `pnpm dev:api` | `nest start --watch` for `apps/api` (persistent watcher) |

**Verification**

| Command | What it does |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` in every workspace (needs package `dist` for the Node-side consumers) |
| `pnpm check` | Biome lint per workspace |
| `pnpm test` | Vitest unit + API e2e suites — no database required |
| `pnpm test:integration` | Postgres integration suites (see the gate below) |
| `pnpm build` | Builds all four workspaces to `dist` |

**Database** (these bypass turbo and call the `@mota/db` workspace directly;
`drizzle.config.ts` and `src/migrate.ts` both read `DATABASE_URL` and refuse to
run without it)

| Command | What it does |
|---|---|
| `pnpm db:generate` | `drizzle-kit generate` — diff `src/schema.ts` into SQL under `packages/db/drizzle` |
| `pnpm db:migrate` | `tsx src/migrate.ts` — apply the SQL in `./drizzle` to the database |
| `pnpm db:studio` | `drizzle-kit studio` |

One nuance about where configuration comes from: the `drizzle-kit` binary has
dotenv bundled in and auto-loads a `.env` from its own working directory — which
for `pnpm db:generate`/`db:studio` is `packages/db/`, not the repository root —
while `db:migrate` is plain `tsx` and reads only `process.env`. Exporting the
variables in your shell sidesteps the asymmetry entirely.

Note that nothing here is needed to boot the API: `main.ts` applies migrations
at startup from `MIGRATIONS_PATH` (default `/app/drizzle`, i.e. the container
layout), so `db:migrate` is for local schema work, not a deploy prerequisite.

**Deploy**

```bash
docker compose --env-file ../home-server-infra/.env up -d --build
```

See [Deployment and Configuration](/openwiki/operations/deployment.md) for the
image, networks, and the full environment-variable surface.

**Extras** also defined at the root but not part of the documented verification
set: `pnpm dev` (both watchers through turbo), `pnpm start` (run the built API
via `node dist/main.js`), `pnpm test:watch` (web Vitest watcher), and
`pnpm test:e2e` (forwards to `playwright test` in `apps/web`).

### The `test:integration` gate

`test:integration` is declared `cache: false` with `env: ["DATABASE_URL"]` in
`turbo.json`, and both integration suites (`apps/api`'s
`settings.postgres.integration.test.ts` and `@mota/db`'s
`repository.integration.test.ts`) wrap their whole body in
`describe.runIf(Boolean(process.env.DATABASE_URL))`. Export a `DATABASE_URL`
and the suites hit a real Postgres; don't, and the task is a silent no-op that
still passes. Never read a green `pnpm test:integration` as proof the database
layer ran — check that the variable was exported.

## Environment you actually set

Everything the API reads is validated by one Zod schema at boot
(`apps/api/src/config/env.ts`). Two resolution rules matter most when wiring up
a checkout:

- **`DATABASE_URL` wins.** If it is absent, the `DATABASE_*` parts are
  assembled into `postgres://user:password@host:port/name` with
  `encodeURIComponent` applied to user, password, and database name. If neither
  is present, boot fails with `DATABASE_URL or DATABASE_PASSWORD is required.`
- **`PUBLIC_URL` is a security switch, not just a URL.** It defaults to
  `http://localhost:5173` (matching the Vite dev origin); an `https` value
  selects `__Host-` cookie prefixes for the session cookies.

Notable optional knobs from `.env.example` (defaults are all sensible for dev):
`SUBWAY_ARRIVAL_UPSTREAM` overrides **only the origin** of the subway arrivals
proxy — the adapter appends `/v1/seoul-subway/arrival` itself — and
`TRANSIT_CATALOG_REFRESH_MS` (60 000–604 800 000, default 86 400 000) sets the
in-memory catalog refresh cadence.

Production Compose does **not** read `.env`: it loads
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `POSTGRES_PASSWORD` from
`../home-server-infra/.env` via `--env-file`, and `docker compose up` aborts
with a clear message if that file is missing any of them.

## Where a change lands

The boundaries in `AGENTS.md` decide the workspace before you open an editor:

- `packages/contracts` imports only Zod and its own modules — shared schema
  changes start here (the web app reads the source via a Vite alias, the API
  reads compiled `dist`).
- `packages/db` imports contracts and Drizzle, never Nest or React.
- Apps never import each other; the browser and the server meet only at HTTP.
- Identity is the Supabase `sub` claim; mota never stores a duplicate user
  record, and its only table is `user_settings`.
- Transit rows are limited to three **only at the presentation boundary** —
  adapters and schemas must not truncate.

## Task routing map

| I want to… | Read |
|---|---|
| Understand the system as a whole | [Repository Topology and Boundaries](/openwiki/architecture/overview.md) |
| Change API behavior (routes, controllers, DI, error shapes) | [API Service (NestJS + Fastify)](/openwiki/architecture/api-service.md) |
| Work on login, sessions, or token verification | [Google Login and Session Verification](/openwiki/workflows/authentication.md), [Supabase Auth Integration](/openwiki/integrations/supabase.md) |
| Understand the shape of bus/subway arrival data | [Transit Arrival Domain Models](/openwiki/concepts/transit-arrivals.md) |
| Change how arrivals are fetched, displayed, refreshed | [Arrival Display and Refresh](/openwiki/workflows/arrival-refresh.md) |
| Change saved stops/stations, commute contexts, or the document model | [Saved Selections Document Model](/openwiki/concepts/transit-selections.md) |
| Change how selections persist and sync (`/api/settings`, conflicts) | [Selections Persistence and Sync](/openwiki/workflows/settings-sync.md) |
| Understand or tune catalog caching (stop/station lists in memory) | [In-Memory Transit Catalogs](/openwiki/concepts/transit-catalogs.md) |
| Change the map, search, or stop discovery | [Inline Map Stop and Station Finder](/openwiki/workflows/stop-discovery.md) |
| Work against the external Seoul data sources | [Seoul Upstream Data Sources](/openwiki/integrations/seoul-upstreams.md) |
| Change the schema, repository, or migrations | [Database (Drizzle + PostgreSQL)](/openwiki/architecture/database.md) |
| Work on the React app structure, layout, or design constraints | [Web App (React 19 PWA)](/openwiki/architecture/web-app.md) |
| Understand offline/PWA behavior and the service worker | [PWA Service Worker and App Shell](/openwiki/architecture/pwa-service-worker.md) |
| Deploy, configure, or operate the service | [Deployment and Configuration](/openwiki/operations/deployment.md) |
| Write or debug tests | [Testing and Verification Stack](/openwiki/testing/overview.md) |

## When something refuses to start

- `DATABASE_URL or DATABASE_PASSWORD is required.` — neither database variable
  reached the process. Check that `.env` values are actually in the environment
  of the command you ran.
- Boot dies before listening — `main.ts` validates the env, opens the Postgres
  pool, and applies migrations **before** `app.listen`. An unreachable database
  or a failing migration is a boot failure, never a half-serving API.
- `pnpm dev:api` or `pnpm typecheck` cannot resolve `@mota/contracts` — the
  package `dist` is missing. Run `pnpm build` once (or just retry: turbo's
  `^build` normally builds them first).
- The app loads but every API call fails from the browser — only one dev
  process is running. The web origin (`:5173`) proxies `/api` to the API
  (`:3000`), so both must be up.
