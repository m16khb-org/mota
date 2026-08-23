# PROJECT KNOWLEDGE BASE

## Overview

Mota is a Turborepo containing a React 19/Vite PWA and a NestJS 11/Fastify
API. It selects a bus stop or subway station/direction and shows at most three
upcoming arrivals.

## Structure

```text
apps/web/             React UI, browser adapters, local anonymous storage
apps/api/             Nest Fastify controllers and Seoul upstream adapters
packages/contracts/   Shared Zod contracts
packages/db/          Drizzle Postgres schema, migration, repository
```

## Boundaries

- `packages/contracts` imports only Zod and its own modules.
- `packages/db` imports contracts and Drizzle; it never imports Nest or React.
- Apps do not import each other.
- API ownership derives only from auth-gateway `/me.sub`.
- Mota never verifies Supabase tokens or stores a duplicate user record.
- Untrusted HTTP, database JSON, and localStorage values are parsed with Zod.
- Transit rows are limited to three only at the presentation boundary.

## Authentication and settings

- Public login: `https://auth.m16khb.xyz/auth/google`.
- Internal identity verification: `http://auth-gateway:3000/me`.
- Cookie: `agw-access`; the API forwards its token as Bearer auth.
- Anonymous selections stay under `mota:transit-selections:v1`.
- Authenticated selections use `GET/PUT /api/settings`.
- Drizzle table: `user_settings`, keyed by auth-gateway `sub`.
- Compare-and-swap versions prevent silent multi-tab overwrites.

## UI

- Keep the urban-utility black/white/lime design in `DESIGN.md`.
- Desktop: 420px control rail plus map.
- Mobile: map plus scrolling sheet.
- Keep map and list alternatives, 44px controls, keyboard tabs, and text state.
- Do not add commute procedures, favorites, journey ETA, gradients, glass, or
  decorative illustration.

## Commands

```bash
pnpm dev:web
pnpm dev:api
pnpm typecheck
pnpm check
pnpm test
pnpm test:integration
pnpm build
pnpm db:migrate
docker compose --env-file ../home-server-infra/.env up -d --build
```

## Deployment

- Node 24 runtime.
- Nest serves the built Vite app and `/api/*` from one container.
- `home-server-infra` owns the `mota` PostgreSQL database.
- The container joins `cloudflare-tunnel` and `home-server`.
- The service worker never caches `/api/*`.

<!-- AGENT_HARNESS:START -->
## agent-harness project docs

This repository uses agent-harness project docs. Read existing AGENTS.md rules first, then read only the additional documents relevant to the task.

- Architecture or large design changes: .agent-harness/ARCHITECTURE.md, .agent-harness/CONSTITUTION.md
- Testing or verification changes: .agent-harness/TESTING.md
- Endpoint/DTO/OpenAPI changes: .agent-harness/OPEN_API_SPEC.md
- Commit or PR work: .agent-harness/COMMIT_POLICY.md
- Code style or structure changes: .agent-harness/CONVENTIONS.md
- Dependency or tech-stack changes: .agent-harness/TECH_STACK.md
- Run, deploy, environment, or local development: .agent-harness/OPERATIONS.md
- Agent start, verification, and completion workflow: .agent-harness/AGENT_WORKFLOW.md
- Risky or recurring-failure work: .agent-harness/CAUTIONS.md
- Structural rationale, alternatives, and decisions: .agent-harness/ADR.md
- Session start, instruction conflicts, and principle decisions: .agent-harness/CONSTITUTION.md
<!-- AGENT_HARNESS:END -->
