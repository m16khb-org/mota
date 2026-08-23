---
name: deployment
description: Mota production image, static serving, networks, migrations, and persistence.
---

# Deployment Architecture

Canonical index: [ARCHITECTURE.md](../ARCHITECTURE.md).

## Build and process

The Node 24 Docker image builds all Turbo workspaces, deploys the Nest API,
copies the Vite bundle, and runs Drizzle migrations before listening.

The Nest process:

1. loads validated environment configuration;
2. connects to the `mota` PostgreSQL database;
3. applies Drizzle migrations;
4. mounts built static assets without a wildcard route;
5. serves `/api/*` through controllers;
6. uses `WebController` only for HTML SPA fallback.

Unknown API and non-HTML paths remain 404 responses.

## Networks

The `web` container joins:

- `cloudflare-tunnel` as `mota` and to reach `auth-gateway`;
- `home-server` to reach `home-server-pg`.

The service is published locally at `127.0.0.1:3100`. The container filesystem
remains read-only. Durable persistence belongs to PostgreSQL, not the
container.

Operational commands and smoke checks are owned by
[OPERATIONS.md](../OPERATIONS.md).
