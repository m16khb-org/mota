---
name: OPERATIONS.md
description: Index of Mota development, database, container, and smoke-check procedures.
---

# Operations

The operational runbook lives in [operations/guides/overview.md](operations/guides/overview.md).

## Quick links

- Repository setup and top-level commands: [../README.md](../README.md)
- Environment variable template: [../.env.example](../.env.example)
- Container definition: [../Dockerfile](../Dockerfile)
- Production composition: [../compose.yaml](../compose.yaml)
- Verification strategy: [TESTING.md](TESTING.md)

## Bus service configuration

The bus-only app uses the Seoul bus adapter and an in-memory stop catalog.
No subway key, quota cooldown or live-vehicle configuration is required.
`TRANSIT_CATALOG_REFRESH_MS` controls catalog refresh; see the runbook above.

## Bus smoke checks

```bash
curl -fsS http://127.0.0.1:3100/api/health
curl -fsS 'http://127.0.0.1:3100/api/stops/nearby?lat=37.5366&lng=127.1253&radius=800'
```

Health stays HTTP 200 and reports `transitCatalogs.bus`. Nearby lookup must
return validated bus stops; exercise arrivals with an ARS ID from that response.
Subway and transit-map API paths return 404. Old `/3d-preview` browser links
open the bus home screen.

Never copy actual secret values into documentation or command output.
