---
name: identity-and-settings
description: Auth-gateway login proxy identity and versioned Drizzle commute settings persistence.
---

# Identity and Settings

Canonical index: [ARCHITECTURE.md](../ARCHITECTURE.md).

## Authentication

Mota logs users in through the central auth-gateway, the same way liar-game
and ai-character-chat do. The gateway keeps its cookies host-only, so mota
runs a same-origin login proxy and ends up owning an independent session on
its own origin. Mota holds no Supabase key.

1. The browser navigates to `GET /api/auth/google` with a same-site
   `return_to` path. The API calls the gateway's `/auth/google` with
   `return_to=$PUBLIC_URL<path>` and `callback_to=$PUBLIC_URL/auth/callback`,
   then relays its `Location` and every `Set-Cookie` header verbatim.
2. Supabase calls back at `GET /auth/callback` — **not** under `/api`, because
   the gateway accepts a callback target only at exactly that path. The route
   is declared before the SPA catch-all in the module's controller list. It
   proxies to the gateway's `/auth/callback` with the browser's cookies and
   relays the response, so the session cookies `agw-access` and `agw-refresh`
   (`__Host-` prefixed over https) land on mota's origin.
3. Access tokens are verified locally with `jose` against the project JWKS:
   ES256, issuer `$SUPABASE_URL/auth/v1`, audience `authenticated`, and
   `role === "authenticated"`. No per-request gateway call.
4. When the access token is missing, expired, or rejected and the refresh
   cookie exists, the API calls the gateway's `POST /auth/refresh` and relays
   the rotated cookies. That route enforces an allow-listed `Origin`, so the
   proxy sends mota's `PUBLIC_URL` as the origin of its own server-side call.
5. Mota uses only the verified `sub` claim as `auth_user_id`. The gateway signs
   with the same Supabase project, so the user id is unchanged from the era
   when mota ran its own PKCE flow — existing `user_settings` rows keep working.
6. `POST /api/auth/logout` proxies the gateway's `/auth/logout` with the same
   `Origin` header and relays its clearing cookies; anonymous selections are
   restored from localStorage.

Mota stores no user rows. A refused refresh becomes an anonymous session; an
unreachable gateway or JWKS surfaces as `503`, never as a signed-out user.

Prerequisites outside this repository: mota's origin must appear in the
gateway's `AUTH_ALLOWED_REDIRECT_URLS` and `CSRF_ALLOWED_ORIGINS`, and the
Supabase project must allow `https://mota.m16khb.xyz/**` as a redirect URL —
the wildcard matters because the gateway appends `?state=` to `callback_to`.

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
cross-database foreign key or local user copy. Rows written under either
earlier flow keep working because the `sub` value is the same Supabase user
id in all of them.

The canonical `selections` document contains two independent contexts:

```text
selections.commutes.toWork  -> bus stops, watched stop ids, subway stations, selected station id
selections.commutes.toHome  -> bus stops, watched stop ids, subway stations, selected station id
```

A mutation targets exactly one context. A legacy flat selection document is
parsed at the shared Zod boundary and copied into both contexts so existing
anonymous and authenticated users lose no saved points; the next save writes
the canonical nested shape. The JSONB column needs no SQL migration.

Writes use compare-and-swap versions:

- version `0`: insert version `1`;
- later saves update only when the expected version matches;
- conflicts return `409`.

Authenticated settings load/save through the API. Anonymous selections remain
in their separate browser-local document and are restored after logout.
