---
name: ARCHITECTURE.md
description: Canonical Mota architecture entrypoint and focused module index.
---

# Architecture

This is the only normative architecture entrypoint for Mota. The application
is a pnpm/Turborepo modular monorepo deployed as one NestJS/Fastify service
with a React PWA.

## Module map

| Module | Responsibility |
|---|---|
| [Overview](architecture/overview.md) | Architecture style, dependency graph, and change placement |
| [Product and workspaces](architecture/product-and-workspaces.md) | Product boundary, workspace ownership, and browser composition |
| [API and transit](architecture/api-and-transit.md) | Nest HTTP surface and Seoul transit adapter flow |
| [Identity and settings](architecture/identity-and-settings.md) | Auth-gateway login proxy identity and versioned settings persistence |
| [Deployment](architecture/deployment.md) | Production image, static serving, networks, and persistence |

## Universal boundaries

- Applications do not import each other.
- `packages/contracts` has no framework or infrastructure dependency beyond Zod.
- `packages/db` owns Drizzle/PostgreSQL persistence and does not import Nest or React.
- Mota proxies Google login to the central auth-gateway and verifies its access tokens locally with JWKS.
- Mota has no users table; authenticated settings are keyed by Supabase `sub`.
- The active product shows at most three upcoming arrivals and excludes retired commute-planning scope.

## Related owners

- UI and accessibility: [../DESIGN.md](../DESIGN.md)
- HTTP response and endpoint contract: [OPEN_API_SPEC.md](OPEN_API_SPEC.md)
- Accepted structural decisions: [ADR.md](ADR.md)
- Operations and deployment procedure: [OPERATIONS.md](OPERATIONS.md)
