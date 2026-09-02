---
name: 2026-09-03-move-mota-onto-the-auth-gateway-login-proxy-superseding-its
description: Accepted decision record with rationale, alternatives, and consequences.
---

# Move mota onto the auth-gateway login proxy, superseding its own PKCE flow

- Date: 2026-09-03
- Kind: `adr`
- Source: SSO unification session
- Summary: Mota now proxies Google login to the central auth-gateway like liar-game and ai-character-chat, instead of running its own PKCE flow against Supabase.
- Context: Supersedes 2026-08-25-mota-owns-its-supabase-browser-session. That record was written when the gateway had just made its cookies host-only, and concluded mota should run its own flow. Since then two sibling services adopted the gateway's documented login-proxy pattern, and on 2026-09-03 the user asked for all services to be unified on the gateway. Running a second OAuth client also meant mota carried a Supabase anon key and duplicated the code exchange, refresh, and revocation the gateway already implements.
- Decision: Mota keeps its own host-only session but stops minting it. GET /api/auth/google proxies the gateway with return_to=$PUBLIC_URL<path> and callback_to=$PUBLIC_URL/auth/callback, relaying Location and every Set-Cookie. The callback route moves from /api/auth/callback to /auth/callback because the gateway accepts a callback target only at exactly that path; it is declared before the SPA catch-all. POST /api/auth/logout and the session refresh both proxy the gateway and send mota's PUBLIC_URL as Origin, which its CSRF check requires. GET /api/auth/session still verifies the token offline with jose against the same Supabase JWKS. Deleted: pkce.ts, supabaseClient.ts, oauth.controller.ts, and all cookie serialization; SUPABASE_ANON_KEY is no longer an input.
- Consequences: Mota no longer holds a Supabase key, and compose no longer passes SUPABASE_ANON_KEY; SUPABASE_URL remains only as the JWKS issuer. New input AUTH_GATEWAY_URL defaults to https://auth.m16khb.xyz. Mota's origin must stay in the gateway's AUTH_ALLOWED_REDIRECT_URLS and CSRF_ALLOWED_ORIGINS, and https://mota.m16khb.xyz/** must remain a Supabase redirect URL — the wildcard matters because the gateway appends ?state= to callback_to. A gateway outage now surfaces as 503 rather than a silent sign-out. The old /api/auth/callback path is gone; its stale Supabase redirect entry can be removed once no in-flight login can use it.
- Evidence:
  - apps/api/src/auth/gatewayAuth.controller.ts
  - apps/api/src/auth/gatewayClient.ts
  - apps/api/src/auth/session.ts
  - apps/api/test/fake-gateway.ts
  - apps/api/test/auth.e2e.test.ts
  - pnpm check, pnpm typecheck, pnpm test (api 51, web 93, contracts 7, db 1), pnpm build
- Alternatives / rejected options:
  - Keep the 2026-08-25 decision: rejected because the user asked for one login mechanism across services, and a second OAuth client is duplicated security surface with no remaining benefit.
  - Adopt the gateway but drop refresh rotation, matching liar-game and ai-character-chat exactly: rejected because it would silently shorten mota sessions from 30 days to one access-token lifetime; the gateway's own /auth/refresh keeps the behaviour.
  - Consume gateway cookies directly instead of proxying: impossible, they are host-only by contract.
  - Migrate user_settings rows: unnecessary, the gateway signs with the same Supabase project so auth_user_id (the sub claim) is unchanged.
