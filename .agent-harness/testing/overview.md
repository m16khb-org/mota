---
name: overview
description: Mota test seams, command matrix, and deterministic async-test rules.
---

# Testing Overview

Canonical index: [TESTING.md](../TESTING.md).

## Command matrix

| Scope | Command | Notes |
|---|---|---|
| Type safety | `pnpm typecheck` | Turbo across all workspaces |
| Lint | `pnpm check` | Biome lint, not a format rewrite |
| Unit/in-memory integration | `pnpm test` | Vitest across workspaces |
| PostgreSQL integration | `DATABASE_URL=... pnpm test:integration` | Real Drizzle and Nest HTTP boundaries |
| Production artifacts | `pnpm build` | Contracts/DB before app consumers |
| Chromium browser E2E | `pnpm --filter @mota/web test:e2e` | Production Vite build with deterministic map/network/SSE fixtures |
| Web watch | `pnpm test:watch` | Web workspace only |

## Test placement and seams

- Tests live beside implementations except Nest HTTP tests under `apps/api/test`.
- Nest tests create an in-memory Fastify application and inject upstream fetch, scheduler, session verifier, settings repository, transit topology, and live collector dependencies.
- Browser component tests use Testing Library/jsdom and mocked transport.
- Playwright tests use a local 3D style plus deterministic REST and `EventSource` fixtures; they block unexpected external requests and do not call live transit services.
- Database integration tests create unique auth user IDs, verify cross-user isolation and version conflict, and clean their rows.
- Contract tests assert machine-consumed Zod behavior, not prose or prompt wording.
- Generated subway-network tests use a checked-in Overpass fixture for transformation determinism; refreshing the production artifact is an explicit networked command.

## Deterministic async behavior

Subscribe to the exact rendered state or promise before triggering work, then await that signal with a bounded timeout. Do not use fixed sleeps, polling delays, live upstream calls, or timing luck. A mock must preserve the behavior being asserted so the integration can still fail for the target regression.

Live-map browser tests emit named SSE frames only after the expected source/DOM state is subscribed. They assert complete snapshot replacement, mode-specific failure clearing, all-mode disconnect clearing, automatic reconnection, and reduced-motion jumps through observable state.

## Behavior-change sequence

1. Write one failing test at the owning seam.
2. Confirm it fails for the intended regression.
3. Implement the smallest fix.
4. Run the focused test once and make it reliable.
5. Run the workspace/root gates appropriate to the changed boundary.
6. Manually use the matching browser/API/runtime surface.
