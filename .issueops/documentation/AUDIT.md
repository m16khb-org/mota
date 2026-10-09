---
name: documentation-audit
description: Measured inventory and preservation ledger for project-doc restructuring.
---

# Documentation Audit

## 2026-08-23 architecture consolidation

Trigger: the user explicitly requested that the repository-root architecture
contract be consolidated into issueops.

### Before inventory

| Document | Lines | Responsibility before move |
|---|---:|---|
| `ARCHITECTURE.md` | 116 | Product, workspace, web, API, auth, DB, and deployment contract |
| `.issueops/ARCHITECTURE.md` | 23 | Harness routing index |
| `.issueops/architecture/overview.md` | 60 | Style, dependency graph, runtime flow, placement |

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
| `.issueops/ARCHITECTURE.md` | 36 | Canonical root and module navigation |
| `.issueops/architecture/overview.md` | 48 | Style, dependency graph, placement |
| `.issueops/architecture/product-and-workspaces.md` | 47 | Product, workspaces, browser composition |
| `.issueops/architecture/api-and-transit.md` | 46 | HTTP and transit adapters |
| `.issueops/architecture/identity-and-settings.md` | 49 | Identity and persistence |
| `.issueops/architecture/deployment.md` | 38 | Production topology |

Strict verification after consolidation:

```text
documents_checked: 29
families_checked: 6
violations: 0
stale external root references: 0
```

Every architecture root and module remains below the 250-line manifest budget.

## 2026-10-09 plans directory declaration

Before: `documents_checked: 40`, `families_checked: 6`, 1 violation
(`undeclared_directory` for `.issueops/plans`).

Inventory: `.issueops/plans/bus-only.md` is the plan for the bus-only conversion.
It has no issue number, so the plan-without-issue rule keeps it in `plans/`.
Nothing links to it and no code reads its path. It was declared in
`manifest.json` `directories` rather than moved or deleted. No files moved and
no links were rewritten.

## 2026-10-09 record index ownership

Before: the checker reported 0 violations, but record lists were duplicated and
stale. `ADR.md` was missing 3 of 8 ADR records and `adr/overview.md` listed only 2.
`CAUTIONS.md` was missing 2 of 8 caution records and `cautions/overview.md`
listed only 4.

Change: `ADR.md` and `CAUTIONS.md` are now the only record lists and include
every dated record. Superseded ADRs and retired-subsystem cautions are marked.
The family `overview.md` modules keep only their recording criteria and link to
the root index. No files moved; dated records were not edited.

After: every `adr/2026-*.md` and `cautions/2026-*.md` record is linked from its
root index. Checker: 41 documents, 0 violations.
