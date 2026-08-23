---
name: 2026-08-23-turborepo-nest-fastify-and-drizzle-topology
description: Accepted decision record with rationale, alternatives, and consequences.
---

# Turborepo Nest Fastify and Drizzle topology

- Date: 2026-08-23
- Kind: `adr`
- Source: project-bootstrap enrichment
- Summary: Mota is a pnpm/Turborepo monorepo with a React web app, NestJS/Fastify API, Zod contracts package, and Drizzle database package.
- Context: The browser, API, wire contracts, and persistence need explicit package boundaries while shipping as one product.
- Decision: Keep apps/web and apps/api as separate applications; share only packages/contracts and packages/db according to the dependency rules in the [architecture contract](../ARCHITECTURE.md).
- Consequences: Workspace builds must compile shared packages before consumers, and Docker runtime packaging must include their artifacts.
- Evidence:
  - package.json
  - pnpm-workspace.yaml
  - turbo.json
  - .agent-harness/ARCHITECTURE.md
  - Dockerfile
- Alternatives / rejected options:
  - Keep the legacy root src/server/public layout
  - Allow direct imports between applications
