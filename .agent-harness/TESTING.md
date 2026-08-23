---
name: TESTING.md
description: Mota verification commands and test-design index.
---

# Testing

## Standard gates

```bash
pnpm typecheck
pnpm check
pnpm test
pnpm build
```

Database integration is a separate explicit gate:

```bash
DATABASE_URL=postgres://... pnpm test:integration
```

Details, test seams, and anti-flakiness rules: [testing/overview.md](testing/overview.md).

`pnpm test:e2e` is declared in `package.json`, but no Playwright config or E2E suite was confirmed during bootstrap. Treat browser E2E automation as unavailable until those files exist; use real-surface manual QA in the meantime.
