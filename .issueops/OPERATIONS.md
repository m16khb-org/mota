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

## Live transit configuration

- `SEOUL_SUBWAY_API_KEY` enables official subway arrivals and live subway positions.
- `SEOUL_BUS_API_KEY` enables viewport-scoped bus routes, stops, and live GPS positions.
- Missing keys are valid degraded configuration: static subway network remains available and the browser shows `unconfigured` instead of fabricated movement.
- After changing either key, rebuild/restart the API container. Never print key-bearing upstream URLs.

## Live transit smoke checks

After the standard Compose deployment, use an API-valid Seoul viewport:

```bash
curl -fsS http://127.0.0.1:3100/api/health
curl -fsS 'http://127.0.0.1:3100/api/transit-map/network?west=127.10&south=37.52&east=127.12&north=37.54&zoom=16'
curl -N --max-time 20 'http://127.0.0.1:3100/api/transit-map/events?west=127.10&south=37.52&east=127.12&north=37.54&zoom=16'
```

Health stays HTTP 200 and reports `liveTransit.bus` and `liveTransit.subway`.
The network response must match the shared schema. The stream must emit
`ready`, `availability`, `vehicles`, and `heartbeat`; an empty vehicle
array with an honest non-live availability is valid.

Never copy actual secret values into documentation or command output.
