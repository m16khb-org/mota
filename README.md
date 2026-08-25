# Mota

React and NestJS application for checking the next Seoul bus or subway
arrivals.

## Workspaces

| Workspace | Purpose |
|---|---|
| `apps/web` | React 19, Vite, Leaflet, PWA |
| `apps/api` | NestJS 11, Fastify, Supabase PKCE login and JWKS verification |
| `packages/contracts` | Shared Zod contracts |
| `packages/db` | Drizzle ORM, PostgreSQL migration and settings repository |

## Development

```bash
pnpm install
pnpm dev:web
pnpm dev:api
```

The API requires the `mota` database managed by
`../home-server-infra`. Copy `.env.example` to `.env` and set the database
password used by the dedicated `mota` role.

## Verification

```bash
pnpm typecheck
pnpm check
pnpm test
pnpm test:integration
pnpm build
```

## Database

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

Mota stores only `user_settings`. User identity is the Supabase `sub` claim
verified from mota's own login; there is no local user table.

## Docker

Load the shared PostgreSQL password from home-server-infra:

```bash
docker compose --env-file ../home-server-infra/.env up -d --build
```

The service is published at `127.0.0.1:3100` and joins both the
`cloudflare-tunnel` and `home-server` networks.
