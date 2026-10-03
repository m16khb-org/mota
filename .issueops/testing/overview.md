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
| Chromium browser E2E | `pnpm --filter @mota/web test:e2e` | Production Vite build with deterministic bus API fixtures |
| Web watch | `pnpm test:watch` | Web workspace only |

## Test placement and seams

- Tests live beside implementations except Nest HTTP tests under `apps/api/test`.
- Nest tests create an in-memory Fastify application and inject upstream fetch, session verifier, settings repository, and catalog options.
- Browser component tests use Testing Library/jsdom and mocked transport.
- Playwright tests use deterministic bus REST fixtures and controlled map tiles; they do not call live transit services.
- Database integration tests create unique auth user IDs, verify cross-user isolation and version conflict, and clean their rows.
- Contract tests assert machine-consumed Zod behavior, not prose or prompt wording.

## Deterministic async behavior

Subscribe to the exact rendered state or promise before triggering work, then await that signal with a bounded timeout. Do not use fixed sleeps, polling delays, live upstream calls, or timing luck. A mock must preserve the behavior being asserted so the integration can still fail for the target regression.

Bus browser tests cover selection persistence, independent commute contexts, arrival failure/retry, responsive layout and legacy preview navigation. Contract and repository tests preserve legacy bus settings while ignoring retired subway fields; HTTP tests require retired APIs to return 404 without upstream calls.

## Behavior-change sequence

1. Write one failing test at the owning seam.
2. Confirm it fails for the intended regression.
3. Implement the smallest fix.
4. Run the focused test once and make it reliable.
5. Run the workspace/root gates appropriate to the changed boundary.
6. Manually use the matching browser/API/runtime surface.
