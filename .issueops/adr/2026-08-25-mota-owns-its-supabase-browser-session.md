---
name: 2026-08-25-mota-owns-its-supabase-browser-session
description: Accepted decision record with rationale, alternatives, and consequences.
---

# Mota owns its Supabase browser session

> **Superseded on 2026-09-03** by [Move mota onto the auth-gateway login proxy](2026-09-03-move-mota-onto-the-auth-gateway-login-proxy-superseding-its.md). Mota no longer runs its own PKCE flow; it proxies the central auth-gateway like its sibling services.

- Date: 2026-08-25
- Kind: `adr`
- Summary: Mota runs its own Google authorization-code + PKCE login against
  the shared Supabase project, keeps host-only session cookies, and verifies
  access tokens locally with the project JWKS.
- Context: auth-gateway moved to host-only `__Host-` cookies
  (`fix(security): isolate browser sessions and runtime secrets`), so gateway
  session cookies are never sent to sibling services. Its integration guide
  directs services to verify tokens locally or own a separate host-only
  session.
- Decision: `GET /api/auth/google` starts the PKCE flow with short-lived
  host-only flow cookies; `GET /api/auth/callback` exchanges the code and sets
  `__Host-mota-access`/`__Host-mota-refresh` (httpOnly, Secure, SameSite=Lax,
  no Domain). The API verifies access tokens with `jose` (ES256, issuer,
  audience `authenticated`, role claim) and rotates expired sessions with the
  Supabase refresh-token grant. `auth_user_id` remains the Supabase `sub`, so
  existing settings rows keep their owner.
- Consequences: No per-request dependency on auth-gateway; Supabase Auth and
  its JWKS must stay reachable. The callback URL must remain allow-listed in
  the Supabase URL configuration. Anonymous transit usage is unaffected.
- Alternatives rejected:
  - Keep forwarding `agw-*` cookies to the gateway — impossible; gateway
    cookies are host-only by contract now.
  - Mint a cross-service session from a one-time login result — requires new
    gateway endpoints that do not exist.
  - Replicate Supabase users into a Mota users table — rejected; the verified
    `sub` claim already identifies the user.
- Evidence:
  - `apps/api/src/auth/oauth.controller.ts`
  - `apps/api/src/auth/session.ts`
  - `apps/api/src/auth/supabaseJwt.ts`
  - `apps/api/test/auth.e2e.test.ts`
