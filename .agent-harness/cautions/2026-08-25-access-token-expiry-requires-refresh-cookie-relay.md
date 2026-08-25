---
name: 2026-08-25-access-token-expiry-requires-refresh-cookie-relay
description: Mota must rotate expired access sessions from its own refresh cookie.
---

# Access-token expiry requires refresh rotation

- Date: 2026-08-25
- Trigger: A valid browser login appeared logged out after the Supabase access
  token lifetime elapsed.
- Root cause: Treating a missing or rejected access cookie as anonymous even
  while the 30-day refresh cookie was still valid.
- Fix: When local verification cannot authenticate and the mota refresh cookie
  exists, call the Supabase `grant_type=refresh_token` grant, relay both
  rotated `Set-Cookie` headers to the browser, and verify the rotated access
  token. Host-only `__Host-` cookies are mandatory; no `Domain` attribute.
- Evidence:
  - `apps/api/src/auth/session.ts`
  - `apps/api/src/auth/supabaseClient.ts`
  - `apps/api/src/auth/auth.controller.ts`
  - `apps/api/src/settings/settings.controller.ts`
  - `apps/api/test/auth.e2e.test.ts`
  - `apps/api/test/settings.e2e.test.ts`
