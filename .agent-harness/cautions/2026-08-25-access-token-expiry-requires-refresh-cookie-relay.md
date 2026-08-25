---
name: 2026-08-25-access-token-expiry-requires-refresh-cookie-relay
description: Mota must refresh expired gateway access cookies and relay both rotated cookies.
---

# Access-token expiry requires refresh-cookie relay

- Date: 2026-08-25
- Trigger: A valid browser login appeared logged out after the Supabase access
  token lifetime elapsed.
- Root cause: Mota forwarded only `agw-access` to auth-gateway `/me`. It mapped
  a missing or rejected access cookie directly to anonymous even while the
  30-day `agw-refresh` cookie was still valid.
- Fix: When access verification cannot authenticate and `agw-refresh` exists,
  call auth-gateway `POST /auth/refresh`, relay every returned `Set-Cookie`
  header unchanged, then verify the rotated access token through `/me`.
- Deployment requirement: auth-gateway must issue both cookies for the shared
  parent domain so the browser sends them to Mota. Production runtime was
  observed with `COOKIE_DOMAIN=.m16khb.xyz`.
- Evidence:
  - `apps/api/src/auth/gateway.ts`
  - `apps/api/src/auth/gateway.test.ts`
  - `apps/api/src/auth/auth.controller.ts`
  - `apps/api/src/settings/settings.controller.ts`
  - `apps/api/test/auth.e2e.test.ts`
  - `apps/api/test/settings.e2e.test.ts`
