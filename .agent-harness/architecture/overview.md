---
name: overview
description: Mota architecture style, dependency graph, and change placement.
---

# Architecture Overview

Canonical index: [ARCHITECTURE.md](../ARCHITECTURE.md).

## Style

Mota is a modular monorepo and a single deployable service. It uses selective ports-and-adapters boundaries where substitution is useful:

- `SessionVerifier` isolates auth-gateway session verification from Nest controllers.
- `UserSettingsRepository` isolates Drizzle/PostgreSQL from the settings controller.
- Shared Zod packages define wire/persistence shapes used by both applications.

It is not documented as full DDD: no bounded-context map, aggregate hierarchy, or domain-event model is present. Avoid adding tactical DDD ceremony to this small transit application.

## Workspace graph

```text
apps/web ───────────────► packages/contracts
apps/api ───────────────► packages/contracts
apps/api ───────────────► packages/db ─────► packages/contracts
packages/contracts ─────► zod only
```

`apps/web` and `apps/api` never import each other. `packages/contracts` imports only Zod and its own modules. `packages/db` imports contracts and Drizzle/postgres.js, never Nest or React.

Cross-workspace imports use package exports, not relative paths. These rules
are architectural boundaries, not optional style preferences.

## Change placement

- Wire or persisted shape: `packages/contracts` first.
- Database schema/repository/migration: `packages/db`.
- HTTP or upstream behavior: `apps/api`.
- UI, browser storage, or browser transport: `apps/web`.
- Product or workspace scope: [product-and-workspaces.md](product-and-workspaces.md).
- UI presentation and accessibility: [../../DESIGN.md](../../DESIGN.md).

## Runtime detail

- Browser composition and product scope: [product-and-workspaces.md](product-and-workspaces.md)
- HTTP and transit adapters: [api-and-transit.md](api-and-transit.md)
- Authentication and persistence: [identity-and-settings.md](identity-and-settings.md)
- Production topology: [deployment.md](deployment.md)
