---
name: 2026-08-23-auth-gateway-owns-user-identity
description: Accepted decision record with rationale, alternatives, and consequences.
---

# Auth gateway owns user identity

- Date: 2026-08-23
- Kind: `adr`
- Source: project-bootstrap enrichment
- Summary: Mota delegates authentication and user identity to auth-gateway and stores settings by the shared gateway sub.
- Context: The web needs account login and per-user settings without duplicating the shared user directory.
- Decision: Forward agw-access to auth-gateway /me, use the returned sub as auth_user_id, and keep no Mota users table or direct Supabase token verifier.
- Consequences: Mota depends on auth-gateway availability for authenticated requests; anonymous transit usage remains available.
- Evidence:
  - apps/api/src/auth/gateway.ts
  - apps/api/src/settings/settings.controller.ts
  - packages/db/src/schema.ts
  - AGENTS.md
- Alternatives / rejected options:
  - Verify Supabase/JWKS tokens directly inside Mota
  - Replicate auth-gateway users into a Mota users table
