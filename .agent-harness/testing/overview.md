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
| Web watch | `pnpm test:watch` | Web workspace only |

## Test placement and seams

- Tests live beside implementations except Nest HTTP tests under `apps/api/test`.
- Nest tests create an in-memory Fastify application and inject upstream fetch, session verifier, and settings repository dependencies.
- Browser tests use Testing Library/jsdom and mocked browser transport; they do not call live transit services.
- Database integration tests create unique auth user IDs, verify cross-user isolation and version conflict, and clean their rows.
- Contract tests assert machine-consumed Zod behavior, not prose or prompt wording.

## Deterministic async behavior

Subscribe to the exact rendered state or promise before triggering work, then await that signal with a bounded timeout. Do not use fixed sleeps, polling delays, live upstream calls, or timing luck. A mock must preserve the behavior being asserted so the integration can still fail for the target regression.

## Behavior-change sequence

1. Write one failing test at the owning seam.
2. Confirm it fails for the intended regression.
3. Implement the smallest fix.
4. Run the focused test once and make it reliable.
5. Run the workspace/root gates appropriate to the changed boundary.
6. Manually use the matching browser/API/runtime surface.

## Current gap

`pnpm test:e2e` is declared, but no Playwright config or E2E suite was found during bootstrap. Do not report it as passing coverage until those assets exist and the command runs successfully.
