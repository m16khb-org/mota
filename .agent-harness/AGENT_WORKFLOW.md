---
name: AGENT_WORKFLOW.md
description: Mota agent exploration, implementation, verification, and doc-maintenance flow.
---

# Agent Workflow

## Start

1. Read `AGENTS.md` and `.agent-harness/CONSTITUTION.md`.
2. Call `project_docs_route` with the concrete task; read only the routed owners.
3. Inspect current source/config before making claims. [ARCHITECTURE.md](ARCHITECTURE.md) and root [DESIGN.md](../DESIGN.md) outrank generic templates.
4. Check the working tree and preserve unrelated user/agent changes.

## Implement

1. Identify the owning workspace and shared contract boundary.
2. For behavior changes, add a failing test at the affected seam before the minimum implementation.
3. Keep Zod parsing at external/persistence boundaries and respect workspace dependency direction.
4. Do not widen product scope or revive legacy commute/procedure/favorite features.

## Verify

- Focused change: workspace typecheck/lint/test plus real use of the affected surface.
- Cross-workspace change: root `pnpm typecheck`, `pnpm check`, `pnpm test`, and `pnpm build`.
- Database change: run `pnpm test:integration` with an explicit `DATABASE_URL` and apply migration against the target environment.
- Deployment change: build/start the container, hit `/api/health`, verify an API error path, and load the SPA.

## Maintain project docs

- New repo or missing family: `project-docs-bootstrap`.
- Durable solved incident or accepted decision: `project-docs-update` / `project_docs_append`.
- Over-budget roots, duplicate owners, or broken links: `project-docs-optimize`.
- Read with `project_docs_read` before `project_docs_revise`; supply the returned SHA.

## Finish

Report changed behavior/doc owners, command exit codes, manual QA evidence, unknowns, and uncommitted repository state. Do not commit unless explicitly requested.
