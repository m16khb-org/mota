---
name: documentation-audit
description: Measured inventory and preservation ledger for project-doc restructuring.
---

# Documentation Audit

## 2026-08-23 architecture consolidation

Trigger: the user explicitly requested that the repository-root architecture
contract be consolidated into agent-harness.

### Before inventory

| Document | Lines | Responsibility before move |
|---|---:|---|
| `ARCHITECTURE.md` | 116 | Product, workspace, web, API, auth, DB, and deployment contract |
| `.agent-harness/ARCHITECTURE.md` | 23 | Harness routing index |
| `.agent-harness/architecture/overview.md` | 60 | Style, dependency graph, runtime flow, placement |

Deterministic report before editing:

```text
documents_checked: 23
families_checked: 6
violations: 0
```

The restructure is user-directed rather than violation-driven.

### Classification

| Original section | Canonical destination |
|---|---|
| Product boundary, Turborepo, Web | `architecture/product-and-workspaces.md` |
| API and routes | `architecture/api-and-transit.md` |
| Authentication, Settings database | `architecture/identity-and-settings.md` |
| Deployment | `architecture/deployment.md` |
| Architecture style, dependency graph, placement | `architecture/overview.md` |

### Preservation requirements

- Preserve the next-three-arrivals product boundary and excluded legacy scope.
- Preserve every workspace dependency and app-import prohibition.
- Preserve browser composition, local/authenticated settings separation, and explicit searches.
- Preserve every API route and the `/api/*` SPA-fallback exclusion.
- Preserve auth-gateway-only identity, `503` outage behavior, and no local users table.
- Preserve Drizzle schema fields, logical identity reference, version CAS, and `409` conflict behavior.
- Preserve Node 24 build, migrations-before-listen, Docker networks, read-only filesystem, and PostgreSQL ownership.
- Remove every link to the retired root file and keep bidirectional module navigation.

### After inventory

| Document | Lines | Canonical responsibility |
|---|---:|---|
| `ARCHITECTURE.md` | removed | Retired duplicate entrypoint |
| `.agent-harness/ARCHITECTURE.md` | 36 | Canonical root and module navigation |
| `.agent-harness/architecture/overview.md` | 48 | Style, dependency graph, placement |
| `.agent-harness/architecture/product-and-workspaces.md` | 47 | Product, workspaces, browser composition |
| `.agent-harness/architecture/api-and-transit.md` | 46 | HTTP and transit adapters |
| `.agent-harness/architecture/identity-and-settings.md` | 49 | Identity and persistence |
| `.agent-harness/architecture/deployment.md` | 38 | Production topology |

Strict verification after consolidation:

```text
documents_checked: 29
families_checked: 6
violations: 0
stale external root references: 0
```

Every architecture root and module remains below the 250-line manifest budget.
