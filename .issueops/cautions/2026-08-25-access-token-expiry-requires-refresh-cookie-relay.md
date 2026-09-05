---
name: 2026-08-25-access-token-expiry-requires-refresh-cookie-relay
description: Mota must rotate expired access sessions instead of reporting them as anonymous.
---

# Access-token expiry requires refresh rotation

- Date: 2026-08-25
- Trigger: A valid browser login appeared logged out after the Supabase access
  token lifetime elapsed.
- Root cause: Treating a missing or rejected access cookie as anonymous even
  while the 30-day refresh cookie was still valid.
- Fix: When local verification cannot authenticate and the refresh cookie
  exists, rotate the session, relay both rotated `Set-Cookie` headers to the
  browser, and verify the rotated access token. Host-only `__Host-` cookies
  are mandatory; no `Domain` attribute.
- Still applies after 2026-09-03: the rotation moved to the auth-gateway's
  `POST /auth/refresh`, which the proxy calls with mota's `PUBLIC_URL` as
  `Origin` because the gateway's CSRF check requires an allow-listed one.
  Dropping rotation to match the sibling services would have shortened
  sessions from 30 days to one access-token lifetime.
- Evidence:
  - `apps/api/src/auth/session.ts`
  - `apps/api/src/auth/gatewayClient.ts`
  - `apps/api/src/auth/auth.controller.ts`
  - `apps/api/src/settings/settings.controller.ts`
  - `apps/api/test/auth.e2e.test.ts`
  - `apps/api/test/settings.e2e.test.ts`
