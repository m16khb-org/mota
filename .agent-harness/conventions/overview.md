---
name: overview
description: Mota TypeScript, dependency, validation, composition, and error conventions.
---

# Conventions Overview

Canonical index: [CONVENTIONS.md](../CONVENTIONS.md).

## TypeScript and modules

- One strict root TypeScript configuration covers all workspaces.
- Use relative imports within a workspace and package exports across workspaces; no app-to-app imports, path aliases, or barrels.
- Preserve branded stop/route identity and five-digit ARS IDs. Never identify a transit point by display name alone.
- Prefer discriminated unions and exhaustive switches for domain variation.

## Dependency and design rules

- `packages/contracts`: Zod plus sibling contract modules only.
- `packages/db`: contracts plus Drizzle/postgres.js only.
- Nest controllers parse/delegate/map; upstream parsing stays in adapters and persistence stays in repositories.
- React hooks orchestrate state and transport; components do not parse upstream payloads.
- Prefer small pure functions and caller-specific interfaces. Use classes at framework/error/repository boundaries, not inheritance hierarchies in shared transit logic.
- Apply KISS/YAGNI: single-use logic stays local; add a port only for an actual substitutable boundary, as with session verification and settings persistence.

## Validation

Parse, do not cast, at these boundaries:

- Nest query/path/body input.
- Seoul/Overpass/Supabase responses.
- Browser `fetch().json()` responses.
- localStorage and JSONB reads.

Shared wire/persistence schemas live in `packages/contracts`; do not fork equivalent app-local schemas.

## Errors

- Use typed errors for infrastructure/domain conflicts (`AuthUpstreamUnavailableError`, `SettingsVersionConflictError`).
- Controllers map them to the HTTP semantics owned by [OPEN_API_SPEC.md](../OPEN_API_SPEC.md).
- Preserve the last successful UI state on transient network failure and expose a short Korean retry/error state.
- Never swallow errors or surface upstream technical details to users.

## UI and content

Follow [../../DESIGN.md](../../DESIGN.md): short Korean task language, keyboard/list alternatives for map actions, no color-only state, no gradients/glass/nested-card decoration, and reduced-motion support.
