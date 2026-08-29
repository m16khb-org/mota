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
- Mota owns its Google login (PKCE against the shared Supabase project) and
  verifies Supabase access tokens locally with JWKS.
- Mota never stores a duplicate user record; identity is the Supabase `sub`.
- Untrusted HTTP, database JSON, and localStorage values are parsed with Zod.
- Transit rows are limited to three only at the presentation boundary.

## Authentication and settings

- Public login: `/api/auth/google` (PKCE, host-only flow cookies,
  `prompt=select_account` so Google always shows its account chooser).
- OAuth callback: `/api/auth/callback` (allow-listed in Supabase URL config).
- Logout: `POST /api/auth/logout` clears mota cookies and revokes the
  Supabase session best-effort.
- Session cookies: host-only `__Host-mota-access` / `__Host-mota-refresh`;
  never a `Domain` attribute, never forwarded to another service.
- Token verification is local: JWKS, ES256, issuer, audience, `role`
  claims; no per-request gateway call.
- Anonymous selections stay under `mota:transit-selections:v1`.
- Authenticated selections use `GET/PUT /api/settings`.
- Drizzle table: `user_settings`, keyed by Supabase `sub`.
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

<!-- OPENWIKI:START -->

## OpenWiki

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

The scheduled OpenWiki GitHub Actions workflow refreshes the repository wiki. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
