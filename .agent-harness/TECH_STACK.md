---
name: TECH_STACK.md
description: Confirmed Mota runtimes, frameworks, libraries, and toolchain versions.
---

# Tech Stack

Versions below are manifest constraints, not claims about a globally installed tool.

| Area | Confirmed stack | Evidence |
|---|---|---|
| Workspace | pnpm `11.23.0`, Turbo `^2.5.6` | `package.json`, `turbo.json` |
| Language | TypeScript `^5.9.2` | root/workspace manifests |
| Web | React `^19.1.1`, Vite `^7.1.2`, Leaflet/React Leaflet | `apps/web/package.json` |
| API | NestJS `^11.1.6`, Fastify `^5.6.1`, `@fastify/static` | `apps/api/package.json` |
| Contracts | Zod `^4.0.17` | `packages/contracts/package.json` |
| Persistence | Drizzle ORM `^0.45.2`, postgres.js `^3.4.7`, PostgreSQL | `packages/db/package.json`, `packages/db/src/schema.ts` |
| Tests | Vitest `^3.2.4`, Testing Library, Playwright dependency | workspace manifests |
| Quality | Biome `^2.2.0`, TypeScript, Turbo | root `package.json` |
| Container | Node 24 Alpine | `Dockerfile` |

## Runtime services

- `apps/api` serves `/api/*` and the built React SPA.
- auth-gateway owns login/session verification and is reached internally at `AUTH_GATEWAY_URL`.
- home-server-infra owns the PostgreSQL server and `mota` database/role.
- The production container joins `cloudflare-tunnel` and `home-server` networks.

## Not confirmed

No repository GitHub Actions workflow is present. Do not describe an automated CI pipeline until one is added and verified.
