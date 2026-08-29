---
type: operations
title: Deployment and Configuration
description: How mota ships and runs — the multi-stage Node 24 Docker image, Compose wiring into home-server-infra networks, boot-time migrations, the Zod-validated environment-variable surface, cookie-prefix switching via PUBLIC_URL, container hardening, and the non-gating healthcheck.
tags: [deployment, docker, compose, configuration, environment-variables, healthcheck, container-hardening, migrations, networking, postgres]
verified:
  - by: openwiki/0.4.3
    at: 2026-08-29T08:06:29.177Z
sources:
  - id: openwiki-source-715dace563ef484b6e8bd1e2
    resource: repo://.dockerignore
  - id: openwiki-source-5f5b95b3d6a215fa02ceb945
    resource: repo://.env.example
  - id: openwiki-source-8037e2358a2c4f9b2c722a11
    resource: repo://AGENTS.md
  - id: openwiki-source-1ac92a537541dc012895d5ce
    resource: repo://apps/api/src/app.module.ts
  - id: openwiki-source-669985c3982b73dc3d09a1d6
    resource: repo://apps/api/src/auth/oauth.controller.ts
  - id: openwiki-source-e34dfd54118d6b71d2996c89
    resource: repo://apps/api/src/auth/session.ts
  - id: openwiki-source-95388414b2162ae474ae4782
    resource: repo://apps/api/src/auth/sessionCookies.test.ts
  - id: openwiki-source-b34d1b00223a158f6d488314
    resource: repo://apps/api/src/auth/sessionCookies.ts
  - id: openwiki-source-dad6cb941d1ce8e952e5ba16
    resource: repo://apps/api/src/config/env.test.ts
  - id: openwiki-source-7c7a4c4b81e392d6121624b8
    resource: repo://apps/api/src/config/env.ts
  - id: openwiki-source-21ae2b3d09bb360e3ca0d453
    resource: repo://apps/api/src/health/health.controller.ts
  - id: openwiki-source-ac07cae48b06bdae0960d54e
    resource: repo://apps/api/src/main.ts
  - id: openwiki-source-7ddf65432d74ce93153d4125
    resource: repo://apps/api/src/transit/managedCatalog.ts
  - id: openwiki-source-d49aac8ecf913761a2230ce8
    resource: repo://apps/api/src/transit/transitCatalog.service.ts
  - id: openwiki-source-f36c9e40c30794ec4fe6b2ad
    resource: repo://apps/api/src/upstream/subwayArrivals.ts
  - id: openwiki-source-882f4de81d7d8e4c6cc82784
    resource: repo://apps/api/src/web/web.controller.ts
  - id: openwiki-source-84e56751045c75cfc7a770e0
    resource: repo://apps/api/test/app.e2e.test.ts
  - id: openwiki-source-345c31f1252bb5cf22547bff
    resource: repo://apps/api/test/settings.postgres.integration.test.ts
  - id: openwiki-source-f2ee65046ab7a733e0270e35
    resource: repo://apps/api/test/transit-catalog-fallback.e2e.test.ts
  - id: openwiki-source-03f6dd3375679341910a29c1
    resource: repo://apps/web/vite.config.ts
  - id: openwiki-source-e201e686a785f09b6d899f0b
    resource: repo://compose.yaml
  - id: openwiki-source-bb1ebe868e35e9e500714501
    resource: repo://Dockerfile
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-7927dde6bb292da599ee4897
    resource: repo://packages/contracts/tsconfig.build.json
  - id: openwiki-source-b790b59441f9ab22da6834f4
    resource: repo://packages/db/src/migration.ts
  - id: openwiki-source-b610b934b44ccc3d3cd59e37
    resource: repo://packages/db/tsconfig.build.json
  - id: openwiki-source-40275cb92c3610938f16ade3
    resource: repo://pnpm-workspace.yaml
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-440ae1e215cb02721dda855c
    resource: repo://turbo.json
generated: { by: "openwiki/0.4.3", at: "2026-08-29T08:06:29.177Z" }
---

# Deployment and Configuration

Mota deploys as **one Node 24 container** that serves both the built Vite SPA and
the `/api/*` JSON surface. There is no separate frontend host, no sidecar, and no
per-service database: the container talks to a PostgreSQL database owned by
`../home-server-infra`, owns its own Google login against the shared Supabase
project, and publishes itself on the host loopback where a Cloudflare tunnel
picks it up. Everything an operator can turn is a single environment-variable
surface, validated by one Zod schema at boot.

Related pages: `/openwiki/architecture/api-service.md` (the composition root this
page boots), `/openwiki/architecture/database.md` (the `user_settings` table and
compare-and-swap repository), `/openwiki/concepts/transit-catalogs.md` (what
`TRANSIT_CATALOG_REFRESH_MS` actually schedules), and
`/openwiki/integrations/supabase.md` (what `SUPABASE_URL` / `SUPABASE_ANON_KEY`
are used for).

## The deployment invariants

From `AGENTS.md`, restated concretely by the files on this page:

- **Node 24 runtime.** Both Docker stages are `node:24-alpine`.
- **One container serves the built Vite app and `/api/*`.** `main.ts` mounts
  `@fastify/static` on `WEB_DIST_PATH` and `WebController` provides the SPA
  fallback; nothing else talks to the browser.
- **`home-server-infra` owns the `mota` PostgreSQL database.** Mota connects as
  the dedicated `mota` role to `home-server-pg:5432/mota` and never runs its own
  Postgres.
- **The container joins the external `cloudflare-tunnel` network (alias `mota`)
  and the external `home-server` network**, and is published at
  `127.0.0.1:3100`.

## The Docker image

`Dockerfile` is a two-stage build. The build stage does the compiling; the
runtime stage is a fresh `node:24-alpine` that only receives artifacts.

```mermaid
flowchart TD
  Base["node:24-alpine plus corepack pnpm"] --> Inst["pnpm install --frozen-lockfile"]
  Inst --> TC["tsc packages/contracts tsconfig.build.json"]
  TC --> TDB["tsc packages/db tsconfig.build.json"]
  TDB --> VB["vite build apps/web"]
  VB --> NB["nest build apps/api"]
  NB --> RT

  subgraph RT["runtime stage, USER node, EXPOSE 3000"]
    NM["node_modules copied wholesale"]
    Pkg["packages/contracts and packages/db dist plus package.json"]
    WebD["apps/web/dist copied to /app/web"]
    Drz["packages/db/drizzle copied to /app/drizzle"]
    Sym["symlinks node_modules/@mota/contracts and @mota/db"]
    Cmd["CMD node apps/api/dist/main.js"]
  end
```

*Build order and runtime layout: the two shared packages are compiled with `tsc`
before either app builds, and the runtime image re-links them by hand.*

Three details matter more than they look:

1. **`packages/contracts` and `packages/db` are compiled first, with `tsc`.**
   Each has a `tsconfig.build.json` that emits `dist/` with declarations. The
   `nest build` of `apps/api` and the `vite build` of `apps/web` then consume
   those `dist` outputs (the web build aliases `@mota/contracts` to source, the
   API build resolves it through `node_modules`).
2. **The runtime image recreates the workspace links.** The whole `node_modules`
   tree is copied from the build stage, then
   `node_modules/@mota/contracts` and `node_modules/@mota/db` are created as
   symlinks to `../../packages/contracts` and `../../packages/db`, whose copied
   `package.json` `main` fields point at their copied `dist`. This works because
   the repo sets `nodeLinker: hoisted` in `pnpm-workspace.yaml` — a flat
   `node_modules` that survives being copied in one piece. Without those two
   symlinks, `apps/api/dist/main.js` could not resolve `@mota/db` and
   `@mota/contracts` at runtime.
3. **The `drizzle` folder is copied to `/app/drizzle`.** That path is exactly
   what `MIGRATIONS_PATH` defaults to (and what both the image `ENV` and Compose
   set), so boot-time migrations never depend on the source tree.

The runtime stage also pins `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3000`,
`WEB_DIST_PATH=/app/web`, and `MIGRATIONS_PATH=/app/drizzle`. `.dockerignore`
excludes `.env` and `.env.*` (plus `node_modules`, `dist`, `.git`, `.turbo`,
`coverage`), so secrets never enter the image or the build context; everything
secret arrives at run time through Compose environment variables.

Note that the image activates pnpm through corepack (`corepack prepare
pnpm@11.21.0 --activate`) while `package.json` declares `packageManager:
pnpm@11.23.0`; if you bump one, check the other.

## The boot sequence

`apps/api/src/main.ts` is the entire entrypoint (`CMD ["node",
"apps/api/dist/main.js"]`). Ordering is deliberate: credentials are validated and
the database schema is current *before* the HTTP listener exists.

```mermaid
sequenceDiagram
    autonumber
    participant C as Container CMD
    participant Env as loadEnv Zod schema
    participant Pg as home-server Postgres
    participant Mod as AppModule.register
    participant Cat as TransitCatalogService
    participant Srv as Fastify listener

    C->>Env: process.env
    Env-->>C: ApiEnv or process exits
    C->>Pg: createDatabase postgres-js pool max 5
    C->>Pg: migrateDatabase from /app/drizzle
    Pg-->>C: schema up to date
    C->>Mod: repository, upstream origin, catalog knobs, oauthConfig
    Mod->>Cat: onModuleInit warmup load of both catalogs
    C->>Srv: app.listen 0.0.0.0:3000
    Srv-->>C: static SPA plus /api routes ready
```

*Every boot: validate env, migrate, then listen. A failed migration means the
container never starts serving.*

Consequences operators should internalize:

- **Migrations run at every boot, before `listen`.** `migrateDatabase` delegates
  to Drizzle's `migrate({ migrationsFolder })`, so `docker compose up` is
  self-healing for schema drift — and a database that is unreachable or refuses
  the migration fails the boot loudly rather than serving a broken API.
- **Production hardening is chosen here, not in the module.** `main.ts` passes
  `warmTransitCatalogs: true`, `minimumBusCatalogItems: 10_000`, and
  `minimumSubwayCatalogItems: 100` — the completeness gates that make a
  truncated bus catalog fall back to the live nearby lookup. Tests default those
  to `1`/`false`.
- **Shutdown is graceful.** `app.enableShutdownHooks()` plus `SIGTERM`/`SIGINT`
  handlers end the postgres-js client; catalog refresh timers are `unref()`ed and
  cleared by `TransitCatalogService.onModuleDestroy`.
- **Fastify is created with `requestTimeout: 65_000`**, comfortably above the web
  client's 35-second allowance for a cold subway-catalog load.
- **One process serves both halves of the surface.** `useStaticAssets({ root:
  env.webDistPath, prefix: "/", wildcard: false })` serves the built SPA assets,
  and `WebController`'s `@Get("*")` returns `index.html` for HTML navigations
  that are not under `/api/` (anything else is a 404). The service worker never
  caches `/api/*`.

## Compose wiring

`compose.yaml` defines a single service — named `web`, though it runs the API
container that serves both halves — building the `runtime` target:

```yaml
ports:
  - "127.0.0.1:3100:3000"
networks:
  cloudflare-tunnel:
    aliases:
      - mota
  home-server:
```

- **Loopback-only publication.** `127.0.0.1:3100:3000` means the host port is
  reachable only from the host itself. External traffic arrives through the
  `cloudflare-tunnel` network, where the container is resolvable by the alias
  `mota`.
- **Both networks are `external: true`.** Compose never creates them; they belong
  to `home-server-infra`. Deploying without that stack present fails at network
  attach.
- **`restart: unless-stopped`** keeps the container up across host reboots and
  crashes; the healthcheck (below) decides whether it is actually usable.
- **Secrets come from the infra env file.** `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, and `POSTGRES_PASSWORD` use `${VAR:?...}` so a missing
  value aborts `docker compose up` with
  `run compose with ../home-server-infra/.env` rather than starting a container
  that would immediately crash:

```bash
docker compose --env-file ../home-server-infra/.env up -d --build
```

- **Database coordinates are pinned in Compose** (`DATABASE_HOST:
  home-server-pg`, port `5432`, name and user `mota`), matching the defaults in
  the env schema. `TRANSIT_CATALOG_REFRESH_MS` defaults to `86400000` in Compose
  and can be overridden from the same env file.

## The environment-variable surface

`apps/api/src/config/env.ts` is the only place that reads `process.env` (plus a
module-level default in the subway adapter). `loadEnv()` runs a Zod `parse`, so
any wrong type, out-of-range number, or missing required value throws and the
process exits before opening a socket.

| Variable | Kind | Default | Notes |
|---|---|---|---|
| `HOST` | string | `0.0.0.0` | must stay `0.0.0.0` inside a container for port mapping and the in-container healthcheck |
| `PORT` | int 1–65535 | `3000` | coerced from string |
| `SUPABASE_URL` | URL, **required** | — | shared Supabase project (same one auth-gateway uses) |
| `SUPABASE_ANON_KEY` | non-empty, **required** | — | travels as the `apikey` header only |
| `PUBLIC_URL` | URL | `http://localhost:5173` | the security switch, see below |
| `SUBWAY_ARRIVAL_UPSTREAM` | URL | `https://k-skill-proxy.nomadamas.org` | override the **origin only**; the adapter appends `/v1/seoul-subway/arrival` |
| `DATABASE_URL` | URL, optional | — | **wins over** the `DATABASE_*` parts |
| `DATABASE_HOST` | string | `home-server-pg` | |
| `DATABASE_PORT` | int 1–65535 | `5432` | |
| `DATABASE_NAME` | string | `mota` | |
| `DATABASE_USER` | string | `mota` | |
| `DATABASE_PASSWORD` | non-empty, optional | — | required unless `DATABASE_URL` is set |
| `WEB_DIST_PATH` | string | `/app/web` | where the built SPA is served from |
| `MIGRATIONS_PATH` | string | `/app/drizzle` | folder Drizzle migrates from at boot |
| `TRANSIT_CATALOG_REFRESH_MS` | int 60 000 – 604 800 000 | `86_400_000` (24 h) | catalog refresh cadence, bounded to 1 minute – 7 days |

Two resolution rules in `loadEnv` are worth memorizing:

- **`DATABASE_URL` wins.** Otherwise the parts are assembled into
  `postgres://user:password@host:port/name`, with `encodeURIComponent` applied to
  user, password, and database name — passwords such as `s/ecret` become
  `s%2Fecret`. If neither `DATABASE_URL` nor `DATABASE_PASSWORD` is present, boot
  throws `DATABASE_URL or DATABASE_PASSWORD is required.`.
- **Trailing slashes are stripped** from `SUPABASE_URL` and `PUBLIC_URL`, because
  both are used to build strings like `${supabaseUrl}/auth/v1` and
  `${publicUrl}/api/auth/callback`.

`SUBWAY_ARRIVAL_UPSTREAM` deserves one caveat: the fallback constant in
`apps/api/src/upstream/subwayArrivals.ts` itself reads `process.env` at module
import time, so the schema default and the module default agree in practice, but
only the Zod-validated value is passed into `ApiOptions`.

`.env.example` is the local-development template: it points
`DATABASE_HOST=127.0.0.1`, `DATABASE_PORT=15432` (a forwarded home-server
Postgres) and documents that production Compose loads `POSTGRES_PASSWORD` from
`../home-server-infra/.env`.

### `PUBLIC_URL` is a security switch

`secureCookies(publicUrl)` is literally `new URL(publicUrl).protocol ===
"https:"`. That single boolean selects the cookie name prefix **and** the
`Secure` attribute for all five cookies:

```ts
export function sessionCookieNames(secure: boolean) {
  const prefix = secure ? "__Host-" : "";
  return {
    access: `${prefix}mota-access`,
    refresh: `${prefix}mota-refresh`,
  };
}
```

- `https://mota.m16khb.xyz` (what Compose sets) → `__Host-mota-access`,
  `__Host-mota-refresh`, `__Host-mota-oauth-verifier`, `__Host-mota-oauth-state`,
  `__Host-mota-return-url`, all `HttpOnly; Secure; SameSite=Lax; Path=/` with no
  `Domain` attribute.
- `http://localhost:5173` (the schema default, used in development) → the same
  names without the prefix and without `Secure`, because browsers reject
  `__Host-` cookies on plain HTTP.

The flag is read from the same `oauth.publicUrl` at both ends — writing flow
cookies in `OAuthController`, writing/rotating session cookies in
`verifySupabaseSession`, and reading them back by name. Change `PUBLIC_URL` and
every cookie name changes with it, which invalidates existing sessions.
`PUBLIC_URL` is also the OAuth redirect origin
(`${publicUrl}/api/auth/callback`), so it must match the URL allow-listed in the
Supabase project.

For local testing this pairs with the Vite dev server in `apps/web/vite.config.ts`:
it binds `127.0.0.1:5173` and proxies `/api` to `http://127.0.0.1:3000`, so a
developer's `pnpm dev:api` on port 3000 with the default `PUBLIC_URL` produces
unprefixed cookies that the browser will actually store.

## Hardening and the healthcheck

The container runs with the defense-in-depth trio:

- `USER node` in the image — the process is never root.
- `read_only: true` — the root filesystem is immutable. This is safe because the
  process writes nothing: static assets and the drizzle folder are read, state
  lives in Postgres, and catalogs are in memory.
- `security_opt: [no-new-privileges:true]` — no `setuid`/`setcap` escalation.

Liveness is probed from inside the container with Node itself (alpine has no
curl, and no package is needed for a `fetch`):

```yaml
healthcheck:
  test:
    - CMD
    - node
    - -e
    - 'fetch("http://127.0.0.1:3000/api/health").then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))'
  interval: 10s
  timeout: 3s
  retries: 5
  start_period: 15s
```

Note it targets `127.0.0.1:3000` — the in-container port, not the published
`127.0.0.1:3100` — and that `HOST=0.0.0.0` is what makes that reachable.

`GET /api/health` (`HealthController`) always answers `200` with:

```json
{ "status": "ok", "service": "mota", "transitCatalogs": { "bus": { "…": "…" }, "subway": { "…": "…" } } }
```

The `transitCatalogs` block mirrors `ManagedCatalog.status()`: `ready`, `count`,
`updatedAt`, `lastErrorAt`, `nextRefreshAt` for each of bus and subway.
**Readiness is explicitly non-gating**: the route returns 200 whether or not
either catalog has ever loaded, so a cold or failed catalog never fails the
healthcheck or triggers a container restart. The e2e test pins this — `/api/health`
reports `ready: false, count: 0` for both catalogs before any request and
`bus: { ready: true, count: 1 }` after one nearby-stops call, both times with
HTTP 200. Use `/api/health` as a dashboard, not an alarm.

Catalog refresh outcomes are logged as one JSON line per attempt
(`event: "transit_catalog_refresh"`, source, trigger, outcome, `durationMs`,
`itemCount`, `nextRefreshAt`, detail — `warn` on failure, `log` on success), which
is the cheapest way to watch `TRANSIT_CATALOG_REFRESH_MS` behave in production.
Failed refreshes keep the stale snapshot and retry after 15 minutes; the bus
nearby endpoint additionally falls back to the live location-scoped upstream when
the catalog is below its minimum item count.

## Failure modes worth knowing

| Symptom | Cause | Result |
|---|---|---|
| `docker compose up` aborts | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, or `POSTGRES_PASSWORD` missing (`:?` interpolation) | container never created |
| container exits immediately | Zod rejects env (bad URL, port out of range, refresh interval under 1 minute or over 7 days) | boot fails before listen |
| container exits during startup | `DATABASE_URL`/`DATABASE_PASSWORD` absent, or Postgres unreachable / migration rejected | `migrateDatabase` throws before `app.listen` |
| requests 502 / stale arrivals | Seoul upstream down | catalogs keep stale data, retry after 15 min, bus falls back to live nearby lookup; health stays `ok` |
| sessions silently dropped | `PUBLIC_URL` changed (cookie names/attributes changed) | users must log in again |

## Tests that pin this contract

- `apps/api/src/config/env.test.ts` — pins the shared-service defaults
  (`0.0.0.0:3000`, `/app/web`, `/app/drizzle`, 24 h refresh), the encoded
  `DATABASE_*` → URL assembly (`s/ecret` → `s%2Fecret`, trailing-slash
  stripping), and both required-credential failure modes.
- `apps/api/src/auth/sessionCookies.test.ts` — pins the `__Host-` prefix switch
  (`https://mota.m16khb.xyz` → prefixed, `http://localhost:5173` → not) and the
  exact `HttpOnly; Secure; SameSite=Lax; Path=/` serialization with no `Domain`.
- `apps/api/test/app.e2e.test.ts` — pins non-gating health: 200 with
  `transitCatalogs.bus.ready: false` before, `true` after a catalog load.
- `apps/api/src/transit/managedCatalog.test.ts` — pins the refresh lifecycle the
  healthcheck observes (single-flight cold load, atomic swap, stale-keep on
  failure, proactive timer).
- `apps/api/test/settings.postgres.integration.test.ts` and
  `packages/db/src/repository.integration.test.ts` — run only when
  `DATABASE_URL` is set (`describe.runIf`), i.e. the same Postgres contract the
  boot migration produces.
- `turbo.json` gates `typecheck`, `test`, and `test:integration` on `^build`, so
  CI compiles the shared packages exactly the way the Docker build does.
