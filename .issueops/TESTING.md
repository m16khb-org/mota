---
name: TESTING.md
description: Mota verification commands and test-design index.
---

# Testing

## Standard gates

Use the repository's Node 24 runtime for every gate:

```bash
pnpm typecheck
pnpm check
pnpm test
pnpm build
pnpm --filter @mota/web test:e2e
```

A fresh cross-workspace verification may combine the first four commands:

```bash
pnpm exec turbo run typecheck check test build --force
```

Database integration is a separate explicit gate:

```bash
DATABASE_URL=postgres://... pnpm test:integration
```

Details, test seams, and anti-flakiness rules: [testing/overview.md](testing/overview.md).

## Browser and bus coverage

`apps/web/playwright.config.ts` runs the production Vite build in Chromium.
The bus browser suite uses controlled arrivals, nearby stops and auth responses.
It covers bus-only controls, legacy preview navigation, settings reload and
commute isolation, arrival error/retry and responsive overflow. Keep map/list
alternatives and keyboard access covered when changing selection behavior.

API HTTP tests validate bus endpoints and require retired subway/transit-map
paths to return 404, even with HTML Accept headers, without upstream calls.
Catalog warmup and health cover buses only. Settings compatibility tests must
preserve buses and CAS versions when obsolete subway fields are malformed.

Browser fixture success is not evidence of live Seoul upstream health. A real
PostgreSQL integration gate requires an explicit test `DATABASE_URL`; report
skips accurately. Historical quota tables remain but have no runtime tests.
