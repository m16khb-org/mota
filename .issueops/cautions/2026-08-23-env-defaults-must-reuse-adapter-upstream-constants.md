---
name: 2026-08-23-env-defaults-must-reuse-adapter-upstream-constants
description: Caution record for a solved false case or recurring risk.
---

# Env defaults must reuse adapter upstream constants

- Date: 2026-08-23
- Kind: `caution`
- Source: atomic-commit-push post-fix documentation
- Summary: A divergent env default for SUBWAY_ARRIVAL_UPSTREAM pointed at a non-existent host and broke all subway arrivals after the Nest migration.
- Context: The Hono adapter used https://k-skill-proxy.nomadamas.org, but the new env.ts schema default was written as https://k-skill.m16khb.xyz/api/subway, which does not resolve. Every subway lookup returned 502 within milliseconds while bus arrivals kept working.
- Resolution: Export SUBWAY_ARRIVAL_UPSTREAM_BASE from apps/api/src/upstream/subwayArrivals.ts and use it as the env schema default so adapter and env share one constant; env.test.ts asserts the constant, and .env.example documents the override contract.
- Evidence:
  - apps/api/src/upstream/subwayArrivals.ts
  - apps/api/src/config/env.ts
  - apps/api/src/config/env.test.ts
  - .env.example
  - mota commit 935491e
