# Live Transit 3D Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Mota's static `/3d-preview` with a trustworthy SSE-driven Seoul subway and zoom-gated viewport bus map that immediately hides vehicles whenever live data is unavailable.

**Architecture:** Nest owns validated static network catalogs, one shared subway collector, ref-counted bus-route collectors, and a typed SSE stream. React fetches cacheable network data, consumes one `EventSource`, and renders bulk network and vehicle GeoJSON through MapLibre while keeping selection and status in accessible DOM UI.

**Tech Stack:** Node 24, TypeScript 5.9, Zod 4, NestJS 11, Fastify 5, RxJS 7, React 19, MapLibre GL 6.7, Vitest 3, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-live-transit-3d-map-design.md`

## Global Constraints

- Keep `/` and its arrival/settings/authentication behavior unchanged.
- `packages/contracts` imports only Zod and its own modules.
- Parse every query, upstream response, generated network asset, REST response, and SSE event with the owning Zod schema.
- Never expose `SEOUL_SUBWAY_API_KEY`, `SEOUL_BUS_API_KEY`, cookies, or upstream URLs containing credentials to the browser or logs.
- Never display timetable-generated or stale vehicles.
- A failed source poll or `EventSource` error clears affected vehicles immediately.
- Desktop keeps a 420px rail; mobile keeps a map plus scrolling sheet; controls remain at least 44x44px.
- Use the existing black, white, lime, and official route-colour system. Do not add gradients, glass, illustration, or a new font.
- Bus live collection requires zoom at least 16, bbox area at most 4 km², and no more than 40 intersecting routes.
- Use 10-second subway polls, 15-second bus-route polls, and 15-second SSE heartbeats.
- Use Node 24 for local verification. Node 26's global Web Storage behavior breaks two existing jsdom suites.
- Do not commit, amend, or push unless the user separately authorizes Git operations. Commit commands below are prepared checkpoints, not standing authorization.

---

## File Structure

### Shared contracts

- Create `packages/contracts/src/transitMap.ts`: bbox, GeoJSON, vehicle, availability, network response, health, and SSE event schemas and types.
- Create `packages/contracts/src/transitMap.test.ts`: valid/invalid contract coverage.
- Modify `packages/contracts/src/index.ts`: export transit-map symbols.
- Modify `packages/contracts/package.json`: add `./transit-map` subpath export.

### API network and upstream adapters

- Create `apps/api/src/transit-map/data/subwayNetwork.generated.ts`: generated and validated subway route/station artifact.
- Create `apps/api/src/transit-map/subwayNetworkSource.ts`: generated-asset loader and bbox filtering.
- Create `apps/api/src/transit-map/subwayNetworkSource.test.ts`: source validation and filter tests.
- Create `scripts/generate-subway-network.mjs`: transform OpenStreetMap route relations into the generated TypeScript artifact.
- Create `scripts/fixtures/subway-network-overpass.json`: deterministic generator fixture.
- Create `scripts/generate-subway-network.test.mjs`: generator transformation tests.
- Create `apps/api/src/upstream/subwayPositions.ts`: official live subway position URL builder and normalizer.
- Create `apps/api/src/upstream/subwayPositions.test.ts`: success, no-service, malformed, and failure tests.
- Create `apps/api/src/upstream/seoulBusPositions.ts`: official bus topology and position URL builders and normalizers.
- Create `apps/api/src/upstream/seoulBusPositions.test.ts`: credential omission, GPS, path, membership, and malformed-row tests.

### API services and HTTP

- Create `apps/api/src/transit-map/transitMapNetwork.service.ts`: subway network and bus topology cache, bbox filtering, and bus eligibility.
- Create `apps/api/src/transit-map/transitMapNetwork.service.test.ts`: bounds, route threshold, and catalog cache tests.
- Create `apps/api/src/transit-map/liveSourceMetrics.ts`: bounded non-sensitive source metrics.
- Create `apps/api/src/transit-map/subwayPositionCollector.ts`: shared 10-second collector.
- Create `apps/api/src/transit-map/subwayPositionCollector.test.ts`: shared polling and immediate-clear tests.
- Create `apps/api/src/transit-map/busPositionCollectorRegistry.ts`: ref-counted 15-second per-route collectors.
- Create `apps/api/src/transit-map/busPositionCollectorRegistry.test.ts`: sharing, teardown, and any-route-failure tests.
- Create `apps/api/src/transit-map/transitMapStream.service.ts`: per-viewport event composition.
- Create `apps/api/src/transit-map/transitMapStream.service.test.ts`: event ordering, heartbeat, and cleanup tests.
- Create `apps/api/src/transit-map/transitMap.controller.ts`: network REST and SSE endpoints.
- Create `apps/api/test/transit-map.e2e.test.ts`: network validation and real HTTP SSE framing.
- Modify `apps/api/src/app.tokens.ts`: live-map configuration and scheduler injection seam.
- Modify `apps/api/src/app.module.ts`: register controller and services.
- Modify `apps/api/src/config/env.ts` and `env.test.ts`: bus key and live-map configuration.
- Modify `apps/api/src/health/health.controller.ts`: non-gating live-source metrics.
- Modify `apps/api/src/main.ts`: pass live-map configuration.
- Modify `compose.yaml`: pass the optional bus key without placing its value in source.

### Web transport, map, and UI

- Create `apps/web/src/api/transitMapClient.ts`: validated network fetch and typed EventSource adapter.
- Create `apps/web/src/api/transitMapClient.test.ts`: URL, parsing, event, and close tests.
- Create `apps/web/src/components/map-preview/useLiveTransitMap.ts`: network/stream lifecycle and immediate clearing.
- Create `apps/web/src/components/map-preview/useLiveTransitMap.test.tsx`: map move, failure, and reconnect tests.
- Create `apps/web/src/components/map-preview/transitMapLayers.ts`: MapLibre sources, layers, atomic `setData`, hit testing, and teardown.
- Create `apps/web/src/components/map-preview/transitMapLayers.test.ts`: source/layer order and replacement tests.
- Create `apps/web/src/components/map-preview/trainInterpolation.ts`: live-snapshot interpolation with reduced-motion bypass.
- Create `apps/web/src/components/map-preview/trainInterpolation.test.ts`: time and coordinate boundary tests.
- Modify `apps/web/src/components/map-preview/MapLibrePreviewMap.tsx`: viewport reporting and transit-layer lifecycle.
- Modify `apps/web/src/components/map-preview/MapLibrePreviewMap.test.tsx`: map callbacks, layer manager, selection, and cleanup.
- Modify `apps/web/src/components/map-preview/mapLibreTestRuntime.ts`: source/layer/query/bounds mocks.
- Modify `apps/web/src/components/map-preview/MapPreviewPage.tsx`: live operations-board rail and state UI.
- Modify `apps/web/src/components/map-preview/MapPreviewPage.test.tsx`: accessible controls and state coverage.
- Modify `apps/web/src/components/map-preview/MapPreviewPage.css`: corrected markers, live rail, responsive layout, and reduced motion.
- Modify `apps/web/src/components/map-preview/MapPreviewPage.css.test.ts`: explicit positioning, tokens, and responsive contracts.
- Delete `apps/web/src/components/map-preview/usePreviewNearbyPoints.ts` and its test after the live hook replaces it.
- Delete `apps/web/src/components/map-preview/mapPreviewPoints.ts` and its test after GeoJSON replaces point mapping.
- Delete `apps/web/src/components/map-preview/previewMarkers.ts` and its test after the selected-feature popup moves into the layer manager.

### Browser fixtures and project owners

- Modify `apps/web/e2e/fixtures/mapPreviewFixtures.ts`: network JSON and deterministic SSE fixtures.
- Modify `apps/web/e2e/map-preview.spec.ts`: projected positions, movement, failure clearing, zoom gating, and responsive flows.
- Modify `DESIGN.md`, `.issueops/OPEN_API_SPEC.md`, `.issueops/architecture/api-and-transit.md`, `.issueops/OPERATIONS.md`, and `.issueops/TESTING.md`.
- Append one accepted decision under `.issueops/adr/` and update `.issueops/ADR.md` through the project-docs workflow.

---

### Task 1: Restore Correct Projected Marker Positioning

**Files:**
- Modify: `apps/web/src/components/map-preview/MapPreviewPage.css`
- Modify: `apps/web/src/components/map-preview/MapPreviewPage.css.test.ts`
- Modify: `apps/web/e2e/map-preview.spec.ts`

**Interfaces:**
- Consumes: current `.map-preview-marker` DOM markers and deterministic near-centre fixtures.
- Produces: an explicit absolute-position contract that remains valid until Task 9 replaces bulk DOM markers.

- [ ] **Step 1: Add a failing CSS contract test**

Add this assertion to `MapPreviewPage.css.test.ts`:

```ts
it("does not override MapLibre marker projection with document flow positioning", () => {
  expect(previewStyles).toMatch(
    /\.map-preview-marker\s*\{[^}]*position:\s*absolute/s,
  );
  expect(previewStyles).not.toMatch(
    /\.map-preview-marker\s*\{[^}]*position:\s*relative/s,
  );
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web exec vitest run src/components/map-preview/MapPreviewPage.css.test.ts`

Expected: FAIL because `.map-preview-marker` currently uses `position: relative`.

- [ ] **Step 3: Add a projected-position browser assertion**

After `readyMap(page)` in the primary preview E2E test, calculate the map and near-centre marker boxes and assert containment:

```ts
const mapBox = await map.boundingBox();
const markerBox = await map
  .locator('[data-point-key="bus:bus-a"]')
  .boundingBox();
expect(mapBox).not.toBeNull();
expect(markerBox).not.toBeNull();
expect(markerBox!.x).toBeGreaterThanOrEqual(mapBox!.x);
expect(markerBox!.y).toBeGreaterThanOrEqual(mapBox!.y);
expect(markerBox!.x + markerBox!.width).toBeLessThanOrEqual(mapBox!.x + mapBox!.width);
expect(markerBox!.y + markerBox!.height).toBeLessThanOrEqual(mapBox!.y + mapBox!.height);
```

- [ ] **Step 4: Implement the minimal CSS correction**

Change only the positioning declaration:

```css
.map-preview-marker {
  position: absolute;
}
```

- [ ] **Step 5: Verify the focused unit and browser regression**

Run:

```bash
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web exec vitest run src/components/map-preview/MapPreviewPage.css.test.ts
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web test:e2e -- --grep "renders the local 3D scene"
```

Expected: both commands pass and the near-centre bus marker is inside the map bounds.

- [ ] **Step 6: Prepare the atomic commit if Git work is authorized**

```bash
git add apps/web/src/components/map-preview/MapPreviewPage.css apps/web/src/components/map-preview/MapPreviewPage.css.test.ts apps/web/e2e/map-preview.spec.ts
git commit -m "fix(web): restore projected preview marker positions"
```

### Task 2: Define Shared Transit-Map Contracts

**Files:**
- Create: `packages/contracts/src/transitMap.ts`
- Create: `packages/contracts/src/transitMap.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/package.json`

**Interfaces:**
- Consumes: no application/framework types.
- Produces: `transitMapQuerySchema`, `transitMapNetworkSchema`, `transitMapEventSchema`, `TransitMapQuery`, `TransitMapNetwork`, `TransitMapEvent`, `TransitVehicle`, and `TransitAvailability`.

- [ ] **Step 1: Write failing schema tests**

Cover a valid Seoul bbox, reversed bounds, excessive area, invalid coordinate order, every availability value, a network payload, and all four event kinds. Use this canonical query and vehicle:

```ts
const query = {
  west: 127.10,
  south: 37.52,
  east: 127.12,
  north: 37.54,
  zoom: 16,
};

const vehicle = {
  id: "subway:1002:2012",
  mode: "subway",
  routeId: "1002",
  routeName: "2호선",
  coordinates: [127.111, 37.531],
  bearing: 92,
  direction: "성수 방면",
  capturedAt: "2026-09-05T04:00:00.000Z",
  positionBasis: "station-segment",
};
```

- [ ] **Step 2: Run the contract test and confirm RED**

Run: `PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/contracts exec vitest run src/transitMap.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement schemas and inferred types**

Use a discriminated union with these exact event shapes:

```ts
export const transitAvailabilitySchema = z.enum([
  "live",
  "no-service",
  "unavailable",
  "unconfigured",
  "zoom-required",
]);

export const transitMapEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ready"),
    revision: z.string().min(1),
    modes: z.array(z.enum(["bus", "subway"])),
    serverTime: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("vehicles"),
    bus: z.array(transitVehicleSchema),
    subway: z.array(transitVehicleSchema),
    capturedAt: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("availability"),
    bus: transitAvailabilitySchema,
    subway: transitAvailabilitySchema,
    observedAt: z.string().datetime(),
  }),
  z.object({
    kind: z.literal("heartbeat"),
    serverTime: z.string().datetime(),
  }),
]);
```

Implement bbox area validation with a deterministic equirectangular approximation at the bbox midpoint and reject areas over 4 km² only when `zoom >= 16`; lower zoom remains valid for subway-only responses.

- [ ] **Step 4: Export the new module**

Add `export * from "./transitMap";` to `src/index.ts` and add a `./transit-map` entry to `package.json` matching the existing `./subway` shape.

- [ ] **Step 5: Verify contracts**

Run:

```bash
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/contracts test
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/contracts typecheck
```

Expected: all contract tests and typecheck pass.

- [ ] **Step 6: Prepare the atomic commit if authorized**

```bash
git add packages/contracts/src/transitMap.ts packages/contracts/src/transitMap.test.ts packages/contracts/src/index.ts packages/contracts/package.json
git commit -m "feat(contracts): define live transit map events"
```

### Task 3: Generate and Load the Subway Network

**Files:**
- Create: `scripts/fixtures/subway-network-overpass.json`
- Create: `scripts/generate-subway-network.mjs`
- Create: `scripts/generate-subway-network.test.mjs`
- Create: `apps/api/src/transit-map/data/subwayNetwork.generated.ts`
- Create: `apps/api/src/transit-map/subwayNetworkSource.ts`
- Create: `apps/api/src/transit-map/subwayNetworkSource.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: OpenStreetMap route relations within `[126.7, 37.3, 127.3, 37.8]` and `transitMapNetworkSchema`.
- Produces: `loadSubwayNetwork(): TransitMapNetwork["subway"]` and `filterSubwayNetwork(query: TransitMapQuery): TransitMapNetwork["subway"]`.

- [ ] **Step 1: Write a deterministic generator fixture and failing transformation test**

The fixture contains two route relations sharing one station and two way
geometries. Assert that the transformer emits `LineString` features with
`routeId`, `routeName`, and `color`, deduplicates station nodes by canonical
station ID, preserves `[lng, lat]`, and records ODbL attribution.

```js
assert.deepEqual(result.lines.features[0].geometry.coordinates[0], [127.0, 37.5]);
assert.equal(result.stations.features.length, 3);
assert.match(result.attribution, /OpenStreetMap/);
```

- [ ] **Step 2: Run the generator test and confirm RED**

Run: `node --test scripts/generate-subway-network.test.mjs`

Expected: FAIL because the generator module is missing.

- [ ] **Step 3: Implement the pure transformer and CLI**

Export `transformOverpassNetwork(payload)` from the script. The CLI fetches
one Overpass query for `type=route` and `route=subway|train` inside the fixed
Mota bounds, maps supported route names to the official colour table, and
writes a deterministic TypeScript module:

```ts
export const SUBWAY_NETWORK_GENERATED_AT = "2026-09-05T00:00:00.000Z";
export const SUBWAY_NETWORK = Object.freeze({
  attribution: "© OpenStreetMap contributors, ODbL",
  lines: { type: "FeatureCollection", features: [] },
  stations: { type: "FeatureCollection", features: [] },
});
```

Sort features by `routeId` and `stationId`, round coordinates to six decimal
places, and never include the Overpass response verbatim.

- [ ] **Step 4: Add the generated source loader tests**

Assert schema parsing, a city-level full response, bbox station filtering, line
retention when any segment intersects the bbox, and immutable return values.

- [ ] **Step 5: Implement the loader and package command**

Add `"generate:subway-network": "node scripts/generate-subway-network.mjs"`
to the root scripts. `loadSubwayNetwork()` parses the generated constant once;
`filterSubwayNetwork()` returns new feature collections without mutating the
cached source.

- [ ] **Step 6: Verify generation and loader behavior**

Run:

```bash
node --test scripts/generate-subway-network.test.mjs
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/api exec vitest run src/transit-map/subwayNetworkSource.test.ts
git diff --check
```

Expected: tests pass, generated output is stable on a second run, and the diff has no whitespace errors.

- [ ] **Step 7: Prepare the atomic commit if authorized**

```bash
git add package.json scripts/fixtures/subway-network-overpass.json scripts/generate-subway-network.mjs scripts/generate-subway-network.test.mjs apps/api/src/transit-map/data/subwayNetwork.generated.ts apps/api/src/transit-map/subwayNetworkSource.ts apps/api/src/transit-map/subwayNetworkSource.test.ts
git commit -m "feat(api): add subway network catalog"
```

### Task 4: Add the Network Endpoint and Bus Eligibility

**Files:**
- Create: `apps/api/src/transit-map/transitMapNetwork.service.ts`
- Create: `apps/api/src/transit-map/transitMapNetwork.service.test.ts`
- Create: `apps/api/src/transit-map/transitMap.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/test/app.e2e.test.ts`

**Interfaces:**
- Consumes: `filterSubwayNetwork(query)` and `TransitCatalogService.nearbyStops()`.
- Produces: `TransitMapNetworkService.network(query): Promise<TransitMapNetwork>` and `GET /api/transit-map/network`.

- [ ] **Step 1: Add failing service tests**

Cover subway-only responses below zoom 16, `zoom-required` for area above 4 km²,
`zoom-required` above 40 routes, and `unconfigured` without a bus key. Use an
injected bus topology port:

```ts
export interface BusTopologyPort {
  routesForStops(stopIds: readonly string[]): Promise<readonly BusRouteTopology[]>;
}
```

- [ ] **Step 2: Run the service test and confirm RED**

Run: `PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/api exec vitest run src/transit-map/transitMapNetwork.service.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement network composition**

Return the exact eligibility states:

```ts
if (!busConfigured) return networkWithBus("unconfigured", [], []);
if (query.zoom < 16 || areaSquareKm(query) > 4) {
  return networkWithBus("zoom-required", [], []);
}
if (routes.length > 40) return networkWithBus("zoom-required", [], []);
return networkWithBus(undefined, routes, stops);
```

Filter bus route paths and stops to the bbox, but retain a complete intersecting
route path in the response so a vehicle can be understood before and after it
crosses the viewport edge.

- [ ] **Step 4: Add failing controller tests**

Test valid query 200, reversed bounds 400, outside-Seoul coordinates 400,
schema-valid response, and `ETag` returning 304 for the same revision.

- [ ] **Step 5: Register and implement the controller GET route**

Use `@Controller("api/transit-map")`, `@Get("network")`, and the shared query
schema. Set `ETag` from `revision`; use `Cache-Control: public, max-age=300` for
bbox responses. Do not add Swagger claims.

- [ ] **Step 6: Verify the endpoint**

Run:

```bash
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/api exec vitest run src/transit-map/transitMapNetwork.service.test.ts test/app.e2e.test.ts
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/api typecheck
```

Expected: focused tests and typecheck pass.

- [ ] **Step 7: Prepare the atomic commit if authorized**

```bash
git add apps/api/src/transit-map/transitMapNetwork.service.ts apps/api/src/transit-map/transitMapNetwork.service.test.ts apps/api/src/transit-map/transitMap.controller.ts apps/api/src/app.module.ts apps/api/test/app.e2e.test.ts
git commit -m "feat(api): serve viewport transit networks"
```

### Task 5: Normalize and Collect Live Subway Positions

**Files:**
- Create: `apps/api/src/upstream/subwayPositions.ts`
- Create: `apps/api/src/upstream/subwayPositions.test.ts`
- Create: `apps/api/src/transit-map/liveSourceMetrics.ts`
- Create: `apps/api/src/transit-map/subwayPositionCollector.ts`
- Create: `apps/api/src/transit-map/subwayPositionCollector.test.ts`
- Modify: `apps/api/src/app.tokens.ts`

**Interfaces:**
- Consumes: `UpstreamFetch`, official API key, supported subway lines, and an injected scheduler.
- Produces: `fetchSubwayPositions(fetcher, template, line)`, `SubwayPositionCollector.subscribe(listener)`, `snapshot()`, and `status()`.

- [ ] **Step 1: Write failing upstream normalization tests**

Use official-shaped rows with `subwayId`, `statnId`, `statnNm`, `trainNo`,
`recptnDt`, `updnLine`, and `trainSttus`. Assert stable vehicle IDs, parsed
capture timestamps, station-segment basis, malformed-row rejection, and
`INFO-200` mapping to `no-service` with an empty array.

- [ ] **Step 2: Run the adapter test and confirm RED**

Run: `PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/api exec vitest run src/upstream/subwayPositions.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the credential-safe URL builder and normalizer**

Build the template in configuration exactly as the existing arrival adapter
does. Adapter errors may include line and HTTP status but never the URL or key.
Return:

```ts
export type SubwayPositionResult = Readonly<{
  availability: "live" | "no-service";
  vehicles: readonly TransitVehicle[];
  capturedAt: string;
}>;
```

- [ ] **Step 4: Write failing shared-collector tests with a manual scheduler**

Define this test seam in `app.tokens.ts`:

```ts
export interface RepeatingScheduler {
  every(intervalMs: number, task: () => Promise<void>): () => void;
}
```

Prove two subscribers trigger one poll sequence, a success emits vehicles, one
line failure emits `unavailable` and an empty complete subway snapshot, and the
last unsubscribe stops the scheduler.

- [ ] **Step 5: Implement the collector and metrics**

Use one in-flight promise and immutable replacement snapshots. Metrics contain
only `successCount`, `failureCount`, `consecutiveFailures`, `lastSuccessAt`,
`lastFailureAt`, and `lastDurationMs`. Start on first subscriber and stop on
last unsubscribe.

- [ ] **Step 6: Verify adapter and collector tests**

Run:

```bash
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/api exec vitest run src/upstream/subwayPositions.test.ts src/transit-map/subwayPositionCollector.test.ts
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/api typecheck
```

Expected: all focused tests pass with no timer leakage.

- [ ] **Step 7: Prepare the atomic commit if authorized**

```bash
git add apps/api/src/upstream/subwayPositions.ts apps/api/src/upstream/subwayPositions.test.ts apps/api/src/transit-map/liveSourceMetrics.ts apps/api/src/transit-map/subwayPositionCollector.ts apps/api/src/transit-map/subwayPositionCollector.test.ts apps/api/src/app.tokens.ts
git commit -m "feat(api): collect live subway positions"
```

### Task 6: Stream Shared Live Snapshots over SSE

**Files:**
- Create: `apps/api/src/transit-map/transitMapStream.service.ts`
- Create: `apps/api/src/transit-map/transitMapStream.service.test.ts`
- Create: `apps/api/test/transit-map.e2e.test.ts`
- Modify: `apps/api/src/transit-map/transitMap.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/health/health.controller.ts`
- Modify: `apps/api/src/main.ts`

**Interfaces:**
- Consumes: network eligibility, `SubwayPositionCollector`, bus registry port, and `RepeatingScheduler`.
- Produces: `events(query): Observable<MessageEvent>` and `GET /api/transit-map/events`.

- [ ] **Step 1: Add failing stream-service tests**

Assert event order `ready -> availability -> vehicles`, one heartbeat at the
manual 15-second tick, complete vehicle replacement, failed-source empty arrays,
and subscriber teardown calling both collector unsubscribe functions.

- [ ] **Step 2: Run the stream test and confirm RED**

Run: `PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/api exec vitest run src/transit-map/transitMapStream.service.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement the observable lifecycle**

Use `new Observable<MessageEvent>((subscriber) => { ... })`. Encode each shared
event after `transitMapEventSchema.parse(event)`:

```ts
subscriber.next({
  id: String(nextEventId()),
  type: event.kind,
  data: event,
});
```

The teardown returned by the Observable stops the heartbeat and releases all
collector subscriptions. Reconnection receives current full snapshots only;
do not maintain an event backlog.

- [ ] **Step 4: Add a real HTTP SSE framing test**

Extend the test helper with `listen()` returning an ephemeral URL and close
function. Fetch the SSE endpoint with an `AbortController`, read until the first
blank-line-delimited event, and assert `content-type: text/event-stream`,
`event: ready`, an `id`, and schema-valid JSON data. Abort and assert the stream
service subscriber count returns to zero.

- [ ] **Step 5: Implement the SSE controller and headers**

Use Nest `@Sse("events")` with the shared parsed query. Set
`Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, and
`X-Accel-Buffering: no`. Keep `requestTimeout: 65_000`; heartbeats prevent an
idle connection from reaching it.

- [ ] **Step 6: Add non-gating health state**

Return `liveTransit.subway` and `liveTransit.bus` metrics beside
`transitCatalogs`. Health remains HTTP 200 even when both live sources are
unavailable.

- [ ] **Step 7: Verify SSE and health behavior**

Run:

```bash
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/api exec vitest run src/transit-map/transitMapStream.service.test.ts test/transit-map.e2e.test.ts test/app.e2e.test.ts
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/api build
```

Expected: framing, teardown, health, and build pass.

- [ ] **Step 8: Prepare the atomic commit if authorized**

```bash
git add apps/api/src/transit-map/transitMapStream.service.ts apps/api/src/transit-map/transitMapStream.service.test.ts apps/api/test/transit-map.e2e.test.ts apps/api/src/transit-map/transitMap.controller.ts apps/api/src/app.module.ts apps/api/src/health/health.controller.ts apps/api/src/main.ts
git commit -m "feat(api): stream live transit snapshots"
```

### Task 7: Add Official Viewport Bus Topology and Position Collection

**Files:**
- Create: `apps/api/src/upstream/seoulBusPositions.ts`
- Create: `apps/api/src/upstream/seoulBusPositions.test.ts`
- Create: `apps/api/src/transit-map/busPositionCollectorRegistry.ts`
- Create: `apps/api/src/transit-map/busPositionCollectorRegistry.test.ts`
- Modify: `apps/api/src/transit-map/transitMapNetwork.service.ts`
- Modify: `apps/api/src/transit-map/transitMapNetwork.service.test.ts`
- Modify: `apps/api/src/transit-map/transitMapStream.service.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/config/env.test.ts`
- Modify: `apps/api/src/app.tokens.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `compose.yaml`

**Interfaces:**
- Consumes: `SEOUL_BUS_API_KEY`, visible stop IDs, route IDs, and `RepeatingScheduler`.
- Produces: `BusTopologyPort`, normalized `BusRouteTopology`, `BusPositionCollectorRegistry.acquire(routeIds, listener)`, and bus health metrics.

- [ ] **Step 1: Write failing official-adapter tests**

Cover station route membership, ordered route stations, route path coordinates,
live vehicle GPS, malformed rows, 401, timeout, and errors that do not contain
the key. Use the documented Seoul endpoints under
`http://ws.bus.go.kr/api/rest/stationinfo`, `busRouteInfo`, and `buspos`.

- [ ] **Step 2: Run the adapter test and confirm RED**

Run: `PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/api exec vitest run src/upstream/seoulBusPositions.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement URL builders and strict normalizers**

Expose only functions receiving the key as an argument. Use 8-second abort
timeouts, `encodeURIComponent` through `URLSearchParams`, and convert official
`gpsX/gpsY` to `[lng, lat]`. Filter returned vehicles to the requested bbox
after normalization.

- [ ] **Step 4: Add failing registry tests**

Prove overlapping route sets share collectors, each route polls once per 15
seconds, release decrements ref counts, idle collectors stop, and failure of any
active route emits one complete empty bus snapshot rather than a mixed result.

- [ ] **Step 5: Implement topology caches and the registry**

Cache stop membership and route paths for 24 hours with in-flight promise
sharing. Use a maximum of eight concurrent upstream bus requests. Route
collectors emit only when every route in the current collection turn succeeds.

- [ ] **Step 6: Add configuration behavior**

Parse `SEOUL_BUS_API_KEY` with the existing optional-secret schema. Add
`busApiKey: string | undefined` to `ApiEnv` and the live-map options. In
`compose.yaml`, pass `${SEOUL_BUS_API_KEY:-}` through the existing ignored
`.env`; never add a value to source. Missing configuration yields
`unconfigured` without preventing startup.

- [ ] **Step 7: Verify the bus slice**

Run:

```bash
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/api exec vitest run src/upstream/seoulBusPositions.test.ts src/transit-map/busPositionCollectorRegistry.test.ts src/transit-map/transitMapNetwork.service.test.ts src/config/env.test.ts
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/api typecheck
```

Expected: adapter, sharing, configuration, and typecheck pass without a real key.

- [ ] **Step 8: Prepare the atomic commit if authorized**

```bash
git add apps/api/src/upstream/seoulBusPositions.ts apps/api/src/upstream/seoulBusPositions.test.ts apps/api/src/transit-map/busPositionCollectorRegistry.ts apps/api/src/transit-map/busPositionCollectorRegistry.test.ts apps/api/src/transit-map/transitMapNetwork.service.ts apps/api/src/transit-map/transitMapNetwork.service.test.ts apps/api/src/transit-map/transitMapStream.service.ts apps/api/src/config/env.ts apps/api/src/config/env.test.ts apps/api/src/app.tokens.ts apps/api/src/app.module.ts apps/api/src/main.ts compose.yaml
git commit -m "feat(api): collect viewport bus positions"
```

### Task 8: Add the Browser Network and EventSource Lifecycle

**Files:**
- Create: `apps/web/src/api/transitMapClient.ts`
- Create: `apps/web/src/api/transitMapClient.test.ts`
- Create: `apps/web/src/components/map-preview/useLiveTransitMap.ts`
- Create: `apps/web/src/components/map-preview/useLiveTransitMap.test.tsx`
- Modify: `apps/web/src/components/map-preview/MapPreviewPage.tsx`

**Interfaces:**
- Consumes: shared network/event schemas and `MapViewport` from the map component.
- Produces: `fetchTransitMapNetwork(viewport, signal)`, `openTransitMapEvents(viewport, handlers)`, and `useLiveTransitMap(viewport)`.

- [ ] **Step 1: Write failing client tests**

Inject an `EventSourceLike` factory. Assert canonical six-decimal query strings,
network schema parsing, each named event, malformed-event rejection through
`onProtocolError`, transport errors through `onConnectionError`, and `close()`.

```ts
export interface TransitMapEventHandlers {
  readonly onEvent: (event: TransitMapEvent) => void;
  readonly onConnectionError: () => void;
  readonly onProtocolError: (error: unknown) => void;
}
```

- [ ] **Step 2: Run the client test and confirm RED**

Run: `PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web exec vitest run src/api/transitMapClient.test.ts`

Expected: FAIL because the client does not exist.

- [ ] **Step 3: Implement fetch and EventSource parsing**

Listen only to `ready`, `vehicles`, `availability`, and `heartbeat`. Parse
`MessageEvent.data` as JSON and then through `transitMapEventSchema`. The error
listener calls `onConnectionError` before relying on native reconnection.

- [ ] **Step 4: Write failing hook tests**

Use injected fetch/open functions. Assert initial loading, network then stream
open, complete snapshot replacement, one-mode immediate clearing,
all-vehicle clearing on connection error, old stream close on viewport change,
and unmount cleanup. Subscribe to state before invoking fake events.

- [ ] **Step 5: Implement the hook reducer**

The reducer stores `network`, `availability`, `vehicles`, `connection`, and
`lastServerTime`. Its connection-error action sets both vehicle arrays to `[]`
synchronously. Abort the old network fetch and close the old stream whenever
the normalized viewport identity changes.

- [ ] **Step 6: Verify client and hook**

Run:

```bash
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web exec vitest run src/api/transitMapClient.test.ts src/components/map-preview/useLiveTransitMap.test.tsx
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web typecheck
```

Expected: all lifecycle and type tests pass.

- [ ] **Step 7: Prepare the atomic commit if authorized**

```bash
git add apps/web/src/api/transitMapClient.ts apps/web/src/api/transitMapClient.test.ts apps/web/src/components/map-preview/useLiveTransitMap.ts apps/web/src/components/map-preview/useLiveTransitMap.test.tsx apps/web/src/components/map-preview/MapPreviewPage.tsx
git commit -m "feat(web): consume live transit stream"
```

### Task 9: Render Network and Vehicles as MapLibre Layers

**Files:**
- Create: `apps/web/src/components/map-preview/transitMapLayers.ts`
- Create: `apps/web/src/components/map-preview/transitMapLayers.test.ts`
- Create: `apps/web/src/components/map-preview/trainInterpolation.ts`
- Create: `apps/web/src/components/map-preview/trainInterpolation.test.ts`
- Modify: `apps/web/src/components/map-preview/MapLibrePreviewMap.tsx`
- Modify: `apps/web/src/components/map-preview/MapLibrePreviewMap.test.tsx`
- Modify: `apps/web/src/components/map-preview/mapLibreTestRuntime.ts`
- Delete: `apps/web/src/components/map-preview/previewMarkers.ts`
- Delete: `apps/web/src/components/map-preview/previewMarkers.test.ts`
- Delete: `apps/web/src/components/map-preview/mapPreviewPoints.ts`
- Delete: `apps/web/src/components/map-preview/mapPreviewPoints.test.ts`

**Interfaces:**
- Consumes: `TransitMapNetwork`, complete bus/subway vehicle arrays, reduced-motion preference, and MapLibre `Map`.
- Produces: `createTransitMapLayers(map, onSelect): TransitMapLayers`, `setNetwork`, `setVehicles`, `setSelection`, and `destroy`.

- [ ] **Step 1: Extend the MapLibre test runtime and write failing layer tests**

Add mocks for `addSource`, `getSource`, `removeSource`, `addLayer`, `getLayer`,
`removeLayer`, `on` with layer IDs, `off`, `queryRenderedFeatures`, and
`getBounds`. Assert the exact source/layer order from the spec and no duplicate
registration after repeated updates.

- [ ] **Step 2: Run the layer test and confirm RED**

Run: `PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web exec vitest run src/components/map-preview/transitMapLayers.test.ts`

Expected: FAIL because the layer manager does not exist.

- [ ] **Step 3: Implement atomic GeoJSON source replacement**

Use source IDs `mota-subway-lines`, `mota-bus-lines`, `mota-subway-stations`,
`mota-bus-stops`, `mota-subway-vehicles`, `mota-bus-vehicles`, and
`mota-transit-selection`. `setVehicles` always calls `setData` for both vehicle
sources, including empty feature collections.

- [ ] **Step 4: Write failing interpolation tests**

Assert start, midpoint, end, equal timestamps, vehicle disappearance, new
vehicle appearance, and reduced-motion behavior. The pure function signature is:

```ts
export function interpolateVehicles(
  previous: readonly TransitVehicle[],
  next: readonly TransitVehicle[],
  progress: number,
  reducedMotion: boolean,
): readonly TransitVehicle[];
```

- [ ] **Step 5: Implement interpolation and map lifecycle**

Clamp progress to `[0, 1]`, interpolate only vehicles present in both snapshots,
and use the new snapshot directly under reduced motion. `MapLibrePreviewMap`
reports `{west, south, east, north, zoom}` on `load` and `moveend`, creates the
layer manager after style load, and destroys it before `map.remove()`.

- [ ] **Step 6: Add selection and accessibility behavior**

Use layer hit testing for pointer selection, mirror the selected feature into
one DOM popup, and keep the rail as the keyboard alternative. Do not recreate a
DOM element per bulk map feature.

- [ ] **Step 7: Verify map layers and component lifecycle**

Run:

```bash
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web exec vitest run src/components/map-preview/transitMapLayers.test.ts src/components/map-preview/trainInterpolation.test.ts src/components/map-preview/MapLibrePreviewMap.test.tsx
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web typecheck
```

Expected: sources replace atomically, layer order is stable, selection works,
and teardown leaves no map listeners.

- [ ] **Step 8: Prepare the atomic commit if authorized**

```bash
git add apps/web/src/components/map-preview/transitMapLayers.ts apps/web/src/components/map-preview/transitMapLayers.test.ts apps/web/src/components/map-preview/trainInterpolation.ts apps/web/src/components/map-preview/trainInterpolation.test.ts apps/web/src/components/map-preview/MapLibrePreviewMap.tsx apps/web/src/components/map-preview/MapLibrePreviewMap.test.tsx apps/web/src/components/map-preview/mapLibreTestRuntime.ts apps/web/src/components/map-preview/previewMarkers.ts apps/web/src/components/map-preview/previewMarkers.test.ts apps/web/src/components/map-preview/mapPreviewPoints.ts apps/web/src/components/map-preview/mapPreviewPoints.test.ts
git commit -m "feat(web): render live transit map layers"
```

### Task 10: Build the Live Operations-Board UI

**Files:**
- Modify: `apps/web/src/components/map-preview/MapPreviewPage.tsx`
- Modify: `apps/web/src/components/map-preview/MapPreviewPage.test.tsx`
- Modify: `apps/web/src/components/map-preview/MapPreviewPage.css`
- Modify: `apps/web/src/components/map-preview/MapPreviewPage.css.test.ts`
- Delete: `apps/web/src/components/map-preview/usePreviewNearbyPoints.ts`
- Delete: `apps/web/src/components/map-preview/usePreviewNearbyPoints.test.tsx`

**Interfaces:**
- Consumes: `useLiveTransitMap(viewport)`, `MapLibrePreviewMap`, network features, and live vehicles.
- Produces: the approved desktop rail/mobile sheet, labelled mode toggles, status copy, selected-feature panel, and collapsed list alternative.

- [ ] **Step 1: Write failing page tests for all visible states**

Mock the live hook and cover:

```text
실시간 연결됨 · 04:20:15
재연결 중 · 차량을 숨겼습니다
지하철 운행 정보 없음
버스 실시간 정보를 불러오지 못했습니다
버스 API 설정이 필요합니다
더 확대하면 현재 화면의 버스를 표시합니다
```

Assert `aria-pressed` mode toggles, one concise live region, selected-feature
details, collapsed full list, always-visible back link, and no timetable or
stale position copy.

- [ ] **Step 2: Run the page tests and confirm RED**

Run: `PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web exec vitest run src/components/map-preview/MapPreviewPage.test.tsx`

Expected: FAIL because the old nearby-point UI is still rendered.

- [ ] **Step 3: Implement the page state and copy**

Keep one `viewport` state updated by the map, pass it to the live hook, and
derive visible layers from user toggles plus availability. Toggling a mode off
clears its rendered source without closing the shared stream.

- [ ] **Step 4: Implement the approved visual system**

Keep the 420px desktop rail, black surface, lime status signal, light map, 1px
dividers, 8px controls, and existing Pretendard stack. Make vehicle/network
counts tabular. On mobile, keep the map above the independently scrolling sheet
and prevent horizontal overflow at 360px.

- [ ] **Step 5: Remove the obsolete nearby hook and marker list pipeline**

Delete `usePreviewNearbyPoints` only after the page has no imports or runtime
dependency on it. Preserve the static network/list alternative through the new
hook; do not remove accessibility coverage with the old implementation.

- [ ] **Step 6: Verify UI, CSS, and reduced-motion contracts**

Run:

```bash
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web exec vitest run src/components/map-preview/MapPreviewPage.test.tsx src/components/map-preview/MapPreviewPage.css.test.ts
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web check
```

Expected: state, accessibility, responsive CSS, and lint pass.

- [ ] **Step 7: Prepare the atomic commit if authorized**

```bash
git add apps/web/src/components/map-preview/MapPreviewPage.tsx apps/web/src/components/map-preview/MapPreviewPage.test.tsx apps/web/src/components/map-preview/MapPreviewPage.css apps/web/src/components/map-preview/MapPreviewPage.css.test.ts apps/web/src/components/map-preview/usePreviewNearbyPoints.ts apps/web/src/components/map-preview/usePreviewNearbyPoints.test.tsx
git commit -m "feat(web): redesign live transit preview"
```

### Task 11: Complete Browser Coverage, Documentation, and Deployment Gates

**Files:**
- Modify: `apps/web/e2e/fixtures/mapPreviewFixtures.ts`
- Modify: `apps/web/e2e/map-preview.spec.ts`
- Modify: `DESIGN.md`
- Modify: `.issueops/OPEN_API_SPEC.md`
- Modify: `.issueops/architecture/api-and-transit.md`
- Modify: `.issueops/OPERATIONS.md`
- Modify: `.issueops/TESTING.md`
- Create: `.issueops/adr/2026-09-05-stream-live-transit-without-stale-vehicles.md`
- Modify: `.issueops/ADR.md`
- Modify: `Dockerfile` only if the generated network is not compiled into API JavaScript.

**Interfaces:**
- Consumes: complete REST/SSE/map/UI implementation.
- Produces: deterministic cross-surface proof, authoritative project docs, and deployable configuration.

- [ ] **Step 1: Replace old nearby-request fixtures with deterministic network and SSE fixtures**

Provide helpers that fulfill the network endpoint and stream ordered SSE frames
without fixed sleeps. The fixture exposes methods `emitVehicles`,
`emitAvailability`, `disconnect`, and `connectionCount`; tests subscribe to the
expected DOM or source state before calling them.

- [ ] **Step 2: Add browser scenarios**

Cover direct navigation, full subway routes/stations, bus zoom and route-count
gating, projected feature containment, two vehicle snapshots moving symbols,
reduced-motion jumps, one-mode poll failure, complete SSE disconnect clearing,
automatic reconnect, keyboard mode/selection flow, long Korean names, WebGL
failure, and no preview resources on `/`.

- [ ] **Step 3: Run the browser suite and fix only observed failures**

Run: `PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web test:e2e`

Expected: every declared Chromium scenario passes with no unexpected external
request, page error, or console error. OpenFreeMap's known style warnings must
not be converted into ignored errors in deterministic fixtures.

- [ ] **Step 4: Update the source-of-truth documentation**

Record the approved product scope in `DESIGN.md`, endpoint/event/error semantics
in `OPEN_API_SPEC.md`, shared collectors in `api-and-transit.md`, key and SSE
smoke commands in `OPERATIONS.md`, and deterministic SSE/projected-position
coverage in `TESTING.md`. The ADR records SSE aggregation, immediate vehicle
clearing, single-process sharing, and the rejected direct-browser and stale-data
alternatives.

- [ ] **Step 5: Run the API documentation gate before staging API files**

Run: `python3 /Users/m16khb/.codex/skills/atomic-commit-push/scripts/api_doc_gate.py /Users/m16khb/Workspace/mota`

Expected: pass with the updated HTTP contract owner.

- [ ] **Step 6: Run the complete fresh verification battery under Node 24**

```bash
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm exec turbo run typecheck check test build --force
PATH=/Users/m16khb/Library/pnpm/bin:$PATH pnpm --filter @mota/web test:e2e
git diff --check
```

Expected: every command exits 0. Database integration is not required because
the design makes no schema or repository change.

- [ ] **Step 7: Run local container and SSE smoke checks**

Build and start with the existing Compose procedure, then verify:

```bash
curl -fsS http://127.0.0.1:3100/api/health
curl -fsS 'http://127.0.0.1:3100/api/transit-map/network?west=127.10&south=37.52&east=127.12&north=37.54&zoom=16'
curl -N --max-time 20 'http://127.0.0.1:3100/api/transit-map/events?west=127.10&south=37.52&east=127.12&north=37.54&zoom=16'
```

Expected: health is 200, network matches the shared schema, and the stream emits
`ready`, `availability`, at least one `vehicles` frame or an honest unavailable
state, and `heartbeat` without buffering.

- [ ] **Step 8: Run combined Aside functional and visual QA after deployment**

Use the declared desktop and mobile coverage where the Aside runtime can
physically produce it. Verify public SSE state, immediate vehicle clearing,
keyboard toggles, accessible names/states, responsive overflow, and correct
projected features. Record unsupported console/network evidence as Not Run.

- [ ] **Step 9: Prepare the final documentation/test commit if authorized**

```bash
git add apps/web/e2e/fixtures/mapPreviewFixtures.ts apps/web/e2e/map-preview.spec.ts DESIGN.md .issueops/OPEN_API_SPEC.md .issueops/architecture/api-and-transit.md .issueops/OPERATIONS.md .issueops/TESTING.md .issueops/adr/2026-09-05-stream-live-transit-without-stale-vehicles.md .issueops/ADR.md Dockerfile
git commit -m "docs(transit): document live 3d map operations"
```

## Final Acceptance Checklist

- [ ] All ten acceptance criteria in the approved spec map to passing automated or runtime evidence.
- [ ] Bus and subway vehicle arrays become empty immediately on their respective failure paths.
- [ ] The browser clears both vehicle sources synchronously when `EventSource` errors.
- [ ] Static route, station, and stop layers remain usable during live-data failure.
- [ ] Every eligible viewport bus route is collected; over-limit views request more zoom rather than sampling.
- [ ] Multiple SSE clients share one upstream collector per line or route.
- [ ] No secret or credential-bearing URL appears in browser payloads, logs, diffs, or artifacts.
- [ ] The working tree contains no test output, Playwright artifacts, or generated files outside their declared paths.
- [ ] `/api/health` exposes source availability counters without user or vehicle identifiers.
- [ ] The post-deploy seven-day availability review has a documented start time and query procedure.
