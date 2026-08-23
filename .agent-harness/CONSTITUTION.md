---
name: CONSTITUTION.md
description: Mota instruction priority, product invariants, and safety baseline.
---

# Constitution

Read this document at session start after `AGENTS.md`; use MCP `project_docs_route` to select the remaining task-specific documents.

## Source-of-truth order

1. The user's current request and the nearest applicable `AGENTS.md`.
2. Project contracts: `.agent-harness/ARCHITECTURE.md`, root `DESIGN.md`, root `README.md`, and current package/config files.
3. The task-specific `.agent-harness` document routed by MCP.
4. Current source, schemas, migrations, and executable command output.

When prose and code disagree, verify the current behavior and update the stale owner rather than duplicating a correction elsewhere.

## Product invariants

- Mota shows only the next bus or subway arrivals, with at most three results.
- auth-gateway is the sole authentication and user-identity authority.
- Mota forwards `agw-access` to auth-gateway `/me`; it does not verify Supabase/JWKS tokens directly.
- Mota stores no local user directory. `user_settings.auth_user_id` is the shared auth-gateway `sub`.
- Anonymous local selections and authenticated server settings remain isolated.
- Workspace dependency direction follows [ARCHITECTURE.md](ARCHITECTURE.md).

## Safety and evidence

- Parse untrusted HTTP, upstream, browser JSON, and persisted JSON with the owning Zod schema.
- Never document or print real `.env` values, access tokens, database passwords, or session cookies.
- Do not claim CI, OpenAPI generation, E2E coverage, or deployment behavior without a file or executed command proving it.
- A change is complete only after the smallest relevant automated check and real-surface verification pass.
