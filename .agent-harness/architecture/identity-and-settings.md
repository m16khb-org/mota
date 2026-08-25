---
name: identity-and-settings
description: auth-gateway identity ownership and versioned Drizzle settings persistence.
---

# Identity and Settings

Canonical index: [ARCHITECTURE.md](../ARCHITECTURE.md).

## Authentication

auth-gateway is the only authentication authority.

1. The browser navigates to `https://auth.m16khb.xyz/auth/google`.
2. auth-gateway owns Google OAuth, Supabase, JWT validation, and its user DB.
3. auth-gateway writes shared-domain `agw-access` and `agw-refresh` cookies.
4. Mota sends `agw-access` as Bearer auth to the internal `auth-gateway /me`
   endpoint.
5. When the access cookie is absent or rejected, Mota sends `agw-refresh` to
   `auth-gateway /auth/refresh`, relays both rotated `Set-Cookie` headers to
   the browser, and verifies the new access token through `/me`.
6. Mota uses only the returned `sub` as the shared `auth_user_id`.

Mota does not verify Supabase tokens, query Supabase, or create a duplicate
user table. A rejected refresh becomes an anonymous session; gateway outages
return `503`.

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

`auth_user_id` references the auth-gateway identity logically; there is no
cross-database foreign key or local user copy.

Writes use compare-and-swap versions:

- version `0`: insert version `1`;
- later saves update only when the expected version matches;
- conflicts return `409`.

Authenticated settings load/save through the API. Anonymous selections remain
in their separate browser-local document and are restored after logout.
