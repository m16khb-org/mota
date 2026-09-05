---
name: TESTING.md
description: Mota verification commands and test-design index.
---

# Testing

## Standard gates

Use the repository's Node 24 runtime for every gate:

```bash
pnpm typecheck
pnpm check
pnpm test
pnpm build
pnpm --filter @mota/web test:e2e
```

A fresh cross-workspace verification may combine the first four commands:

```bash
pnpm exec turbo run typecheck check test build --force
```

Database integration is a separate explicit gate:

```bash
DATABASE_URL=postgres://... pnpm test:integration
```

Details, test seams, and anti-flakiness rules: [testing/overview.md](testing/overview.md).

## Browser and live-map coverage

`apps/web/playwright.config.ts` runs the production Vite build in Chromium.
The deterministic `apps/web/e2e/fixtures/mapPreviewFixtures.ts` blocks
unexpected external requests, serves a local 3D style, responds to viewport
network requests, and replaces `EventSource` with explicit
`emitVehicles`, `emitAvailability`, `disconnect`, and
`connectionCount` controls.

The suite covers direct/refresh/back navigation, home-route lazy loading,
static route/station/stop layers, bus zoom gating, two live vehicle snapshots,
reduced-motion snapshot jumps, mode-specific failure clearing, complete SSE
disconnect clearing and reconnection, keyboard toggles and selection,
accessible popup focus return, long Korean names, responsive overflow, style
failure, missing 3D buildings, and unsupported WebGL. Tests subscribe to the
expected DOM/source state before emitting stream events and use no fixed sleep.

API HTTP tests under `apps/api/test/transit-map.e2e.test.ts` validate real
SSE framing and network endpoint validation/caching. Focused adapter and
collector tests cover upstream normalization, single-flight sharing,
reference-counted teardown, failure-to-empty semantics, and bounded metrics.

## Schematic 3D transit objects

`transitMapLayers.test.ts` checks solid geometry for all four object types and polygon picking back to geographic anchors. `transitModels.test.ts` checks metre-scaled dimensions, clockwise rotation, centering, closed rings, and complete removal. `trainInterpolation.test.ts` checks route corners, reverse travel, initial track alignment, stationary heading, observation-gap rejection, and snapshot replacement. `MapLibrePreviewMap.test.tsx` exercises the animation frame consumer and selected popup together.

Aside visual evidence must distinguish real upstream data from controlled bus/train fixtures. An unconfigured bus key does not constitute a passed live-bus check. Schematic model dimensions are not surveyed building footprints.
