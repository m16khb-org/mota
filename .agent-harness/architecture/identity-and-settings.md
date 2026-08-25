---
name: identity-and-settings
description: Supabase PKCE identity ownership and versioned Drizzle settings persistence.
---

# Identity and Settings

Canonical index: [ARCHITECTURE.md](../ARCHITECTURE.md).

## Authentication

Mota owns its Google login end to end. The auth-gateway login stays a
separate, host-only session that never reaches this service.

1. The browser navigates to `GET /api/auth/google` with a same-site
   `return_to` path. The API issues short-lived host-only PKCE flow cookies
   (`mota-oauth-verifier`, `mota-oauth-state`, `mota-return-url`) and
   redirects to Supabase `/auth/v1/authorize` (Google, S256,
   `prompt=select_account` so Google always shows its account chooser).
2. Supabase calls back at `GET /api/auth/callback` (allow-listed in the
   Supabase URL configuration). The API validates `state`, exchanges the code
   server-side, clears the flow cookies, and sets host-only session cookies
   `__Host-mota-access` (session lifetime) and `__Host-mota-refresh` (30 days)
   — httpOnly, Secure, SameSite=Lax, Path=/, never a `Domain` attribute.
3. Access tokens are verified locally with `jose` against the project JWKS:
   ES256, issuer `$SUPABASE_URL/auth/v1`, audience `authenticated`, and
   `role === "authenticated"`. No per-request gateway or Supabase call.
4. When the access token is missing, expired, or rejected and the refresh
   cookie exists, the API rotates the session with the Supabase refresh-token
   grant and relays both rotated cookies to the browser.
5. Mota uses only the verified `sub` claim as `auth_user_id`. The shared
   Supabase project keeps the user id identical across sibling services.
6. `POST /api/auth/logout` clears both session cookies and revokes the
   Supabase session server-side (best-effort); anonymous selections are
   restored from localStorage.

Mota stores no user rows. A rejected refresh becomes an anonymous session;
Supabase Auth outages surface as `503`.

## Settings database

`home-server-infra` owns PostgreSQL. Mota uses the dedicated `mota` database
and `mota` login role over the external `home-server` Docker network.

Drizzle owns one table:

```text
user_settings
  auth_user_id text primary key
  version      integer not null
  selections   jsonb not null
  updated_at   timestamptz not null
```

`auth_user_id` references the Supabase identity logically; there is no
cross-database foreign key or local user copy. Existing rows written under
the previous gateway-era flow keep working because the `sub` value is the
same Supabase user id.

Writes use compare-and-swap versions:

- version `0`: insert version `1`;
- later saves update only when the expected version matches;
- conflicts return `409`.

Authenticated settings load/save through the API. Anonymous selections remain
in their separate browser-local document and are restored after logout.
