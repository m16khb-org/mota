---
name: documentation
description: Manifest contract, canonical owner map, and restructuring history for Mota project docs.
---

# Project Documentation Contract

The required root documents under `.agent-harness/` are the canonical
agent entrypoints. Each root owns a universal summary and navigation; focused
detail belongs to its declared module directory.

## Architecture family

`.agent-harness/ARCHITECTURE.md` is the only normative architecture
entrypoint. The former repository-root `ARCHITECTURE.md` was consolidated into
these modules:

| Module | Single responsibility |
|---|---|
| `architecture/overview.md` | Architecture style, dependency graph, change placement |
| `architecture/product-and-workspaces.md` | Product boundary, workspace ownership, browser composition |
| `architecture/api-and-transit.md` | Nest HTTP surface and transit adapter flow |
| `architecture/identity-and-settings.md` | Auth-gateway login proxy identity and versioned settings persistence |
| `architecture/deployment.md` | Production image, static serving, networks, persistence |

Every module links back to the canonical root. Other document families link
to `.agent-harness/ARCHITECTURE.md` instead of restating architecture rules.

## Lifecycle

- Missing document family: `project-docs-bootstrap`.
- Durable solved incident or accepted decision: `project-docs-update`.
- Line-budget, ownership, or link violations: `project-docs-optimize`.

The machine contract is
[`manifest.json`](manifest.json). Restructuring measurements and preservation
evidence are recorded in [`AUDIT.md`](AUDIT.md).
