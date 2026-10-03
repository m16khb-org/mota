# Mota

React and NestJS application for checking the next Seoul bus arrivals.
Save independent bus-stop selections for 출근 and 퇴근, watch up to four
stops together, and see up to three arrival rows per stop.

## Workspaces

| Workspace | Purpose |
|---|---|
| `apps/web` | React 19, Vite, Leaflet, PWA |
| `apps/api` | NestJS 11, Fastify, auth-gateway login proxy and JWKS verification |
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

Mota actively reads and writes `user_settings`. User identity is the Supabase
`sub` claim verified from the auth-gateway session; there is no local user table.
Historical subway quota tables and migrations are retained but unused.
Legacy settings preserve bus stops and selected IDs while ignoring subway fields;
no bulk settings migration or table deletion is needed.

## Docker

Load the shared PostgreSQL password from home-server-infra:

```bash
docker compose --env-file ../home-server-infra/.env up -d --build
```

No subway API key is required. Subway APIs and the subway-only 3D preview
have been retired; old `/3d-preview` links open the bus home screen.

The service is published at `127.0.0.1:3100` and joins both the
`cloudflare-tunnel` and `home-server` networks.
