# Live Transit 3D Map Design

Date: 2026-09-05
Status: Approved

## 1. Purpose

Turn Mota's isolated `/3d-preview` route into an ambient but trustworthy live
view of Seoul transit:

- show the full Seoul subway network, stations, and live trains;
- show bus stops, route paths, and every live bus in the current viewport once
  the user has zoomed in far enough;
- preserve the existing Mota app at `/` and its arrival-focused product flow;
- never present simulated or stale vehicles as live.

The visual direction remains Mota's urban-utility black, white, and lime
system. The reference service, Mini Seoul 3D, informs the interaction model but
is not copied.

## 2. Evidence and current-state diagnosis

The reference service was inspected in a real browser and through Aside at
1440x900. It loads a static network containing 24 lines, 30 route geometries,
and 634 stations, then requests live subway positions by line. Its help panel
also describes timetable, ridership, and congestion fallbacks.

At the time of inspection, 16 of 17 live-position requests returned no trains
and one returned a single train because the inspection occurred after normal
service. The reference still displayed 60 modelled trains with a `LIVE` label.
Mota must not reproduce that ambiguity.

The reference timetable spans approximately 05:00-25:11 on weekdays and
05:00-24:40 on weekends and holidays. A normal no-service gap therefore lasts
about 3 hours 49 minutes on weekdays and 4 hours 20 minutes on weekends and
holidays. Intermittent in-service outage frequency has no published SLA and
must be measured after rollout.

Mota's deployed preview successfully loads one MapLibre canvas, 57 bus-stop
records, 17 subway-station records, and the `building-3d` layer. However,
`.map-preview-marker { position: relative; }` overrides MapLibre's absolute
marker positioning. All 57 bus markers were measured outside the viewport even
though their API coordinates were within 800 metres of the map centre. The
existing browser tests count marker elements but do not compare projected
marker positions with the viewport.

The preview currently has no line geometry or vehicle-position contracts. This
is not an upstream rendering failure: the current `DESIGN.md` explicitly
excludes route lines and vehicle movement from `/3d-preview`.

## 3. Goals and non-goals

### Goals

1. Correctly place static transit features at their geographic coordinates.
2. Render the full subway network at city scale without overwhelming the map.
3. Stream live train and bus snapshots through one shared server collection
   layer rather than polling upstream once per browser.
4. Show all buses belonging to routes that intersect an eligible current
   viewport.
5. Remove vehicles immediately when their live source or SSE connection fails.
6. Keep map navigation, static transit context, and a recovery path usable
   during partial failure.
7. Provide keyboard and list alternatives to map-only interaction.
8. Measure source availability so freshness policy can be revisited with real
   evidence after seven days.

### Non-goals

- timetable-generated or simulated vehicles;
- journey planning, commute procedures, route recommendations, or ETA across
  multiple modes;
- ridership pillars, congestion estimates, people simulation, weather, terrain,
  or playback speed controls;
- storing map state in authenticated settings or anonymous local storage;
- changing the existing `/` arrival flow;
- multi-replica stream distribution. The current deployment is one Nest
  process; a future multi-replica deployment would require shared pub/sub.

## 4. Architecture

### 4.1 Components

`TransitMapNetworkService` owns static, validated spatial data:

- subway line geometry and station nodes;
- bus stops, stop-to-route membership, route stop order, and route paths;
- bbox and zoom filtering;
- source revision and refresh metadata.

`SubwayPositionCollector` polls the official Seoul real-time position API by
supported line. It is global to the process, so every connected browser shares
the same upstream requests.

`BusPositionCollectorRegistry` owns one ref-counted collector per active bus
route. It starts a route collector only while at least one eligible viewport
needs that route, shares it across connections, and disposes it after a short
idle grace period.

`TransitMapStreamService` combines the current subway snapshot with the bus
route collectors required by one connection. It emits typed events and never
substitutes a previous successful snapshot after a failed collection.

`TransitMapController` exposes a cacheable network endpoint and a public SSE
endpoint. Controllers parse query input, delegate, and map errors; they do not
normalize upstream payloads.

The web preview owns MapLibre sources and layers, one `EventSource`, connection
state, selection state, and accessible DOM alternatives. It does not call Seoul
upstreams directly.

### 4.2 Shared collection and resource bounds

Subway collection runs once per supported line every 10 seconds while at least
one live-map connection exists.

Bus collection becomes eligible only when both conditions hold:

- zoom is at least 16;
- the requested bbox is no larger than 4 square kilometres.

The network service derives every bus route intersecting that eligible bbox
from stop membership and route paths. If more than 40 routes intersect the
viewport, bus collection does not start and the server returns
`zoom-required`; the UI asks the user to zoom further. Once the viewport is
eligible, every derived route is included rather than sampling vehicles.

Each active route is polled every 15 seconds. Route requests use bounded
concurrency, a per-route in-flight promise, and a process-wide request budget.
Multiple viewports needing the same route reuse the same collector and
snapshot.

### 4.3 Static network sources

Subway route geometries are generated from OpenStreetMap railway relations and
committed as a versioned GeoJSON artifact with ODbL attribution and generation
metadata. Station identity and coordinates continue to be reconciled against
the official Seoul T-Data station master used by Mota.

Bus topology uses the official Seoul bus APIs with a dedicated
`SEOUL_BUS_API_KEY`:

- station-to-route membership discovers routes for visible stops;
- route station order and route-path endpoints populate the network cache;
- route position queries supply live vehicle GPS coordinates.

Stop-to-route membership and route paths are long-lived catalog data and are
cached for 24 hours. Live vehicle snapshots are never served from that cache
after a failed poll.

The current environment contains `SEOUL_SUBWAY_API_KEY` but not
`SEOUL_BUS_API_KEY`. The application may boot without the bus key and report
`unconfigured`, but bus live-map release readiness requires the key.

## 5. HTTP and SSE contracts

All query, response, upstream, and browser-consumed payloads have owning Zod
schemas in `packages/contracts`.

### 5.1 Network endpoint

`GET /api/transit-map/network?west=&south=&east=&north=&zoom=`

The response contains:

- `revision` and `generatedAt`;
- the complete subway line/station GeoJSON needed at the requested zoom;
- bus eligibility: `enabled` and an optional `reason` of `zoom-required` or
  `unconfigured`;
- eligible bus stop and route GeoJSON for the requested bbox;
- source and attribution metadata.

The response supports `ETag` and public 24-hour caching for subway geometry.
Bbox-specific bus results use a shorter server cache and must not expose an API
key.

Longitude order must satisfy `west < east`, latitude order must satisfy
`south < north`, coordinates must remain inside the accepted Seoul-area bounds,
and the zoom must be within the map's configured range. Invalid input returns
400.

### 5.2 Stream endpoint

`GET /api/transit-map/events?west=&south=&east=&north=&zoom=`

The response uses `text/event-stream`, disables transformation/buffering, and
sends a heartbeat every 15 seconds. The stream uses four event names:

- `ready`: connection revision, active modes, and server time;
- `vehicles`: complete replacement arrays for bus and subway vehicles plus
  each source's upstream capture time;
- `availability`: per-mode state and safe public reason;
- `heartbeat`: server time only.

Availability states are:

- `live`;
- `no-service`;
- `unavailable`;
- `unconfigured`;
- `zoom-required`.

Every `vehicles` event is a complete authoritative snapshot for the connection.
The client replaces its GeoJSON source instead of merging records. When a poll
fails, the server first emits `availability` for the failed mode and emits an
empty vehicle array for that mode in the same stream turn.

Event IDs are monotonically increasing within one process. `Last-Event-ID` may
support diagnostics, but reconnection always starts with a fresh `ready` and
full `vehicles` snapshot; no missed-event backlog is replayed.

### 5.3 Vehicle semantics

Bus vehicles use official GPS longitude and latitude.

The subway real-time position API reports a current station, direction, and
entry/arrival/departure state rather than continuous GPS. Mota anchors each
train to the matching route segment and interpolates only between the last two
live snapshots. The details panel labels this as `역 구간 기준 실시간 위치`.
When reduced motion is requested, positions jump to the newest anchor without
animation.

## 6. Failure and lifecycle behavior

Mota does not retain visible stale vehicles.

- A failed subway poll immediately removes every subway vehicle.
- A failed bus route poll makes the bus mode unavailable for that stream turn
  and immediately removes every bus vehicle, avoiding a map that silently mixes
  fresh and stale routes.
- An `EventSource` error immediately clears both vehicle sources. Browser
  automatic reconnection remains enabled.
- `no-service` is an expected empty state, not an error.
- `unconfigured` identifies a missing server credential without exposing its
  name or value to the browser.
- Network geometry, stations, stops, the selected feature, and camera controls
  remain available while vehicles are empty.

The server records per-source success count, failure count, consecutive
failures, last success, last failure, and collection duration. `/api/health`
adds non-gating live-transit status without bbox, vehicle IDs, or user data.
After seven days, operators can calculate in-service availability separately
from scheduled no-service periods.

## 7. Web rendering and interaction

### 7.1 Visual direction

The preview becomes a `city operations board` interpretation of Mota's
existing urban-utility design:

- black control rail, white/light map surfaces, and lime connection/status
  signals;
- official subway line colours, reinforced with names and selection state;
- no gradients, glass effects, decorative illustration, or new font family;
- numeric counts and update time use tabular numerals;
- the moving transit network, not a card grid, is the visual focus.

### 7.2 Desktop and mobile layout

At 960px and wider, the existing 420px rail remains fixed while the map fills
the remaining viewport. The rail contains the back link, title, stream status,
mode toggles, viewport summary, selected feature, and a collapsed accessible
feature list.

Below 960px, the map occupies the upper portion of the viewport and the
scrolling sheet owns status, toggles, selection, and the alternative list. The
layout remains usable without horizontal scrolling at 360x800 and 768x1024.

### 7.3 Map layers

Bulk transit features use MapLibre GeoJSON sources and layers, not one DOM node
per feature:

1. subway route lines;
2. bus route lines when eligible;
3. subway station points and zoom-dependent labels;
4. bus stop points and zoom-dependent labels;
5. subway vehicle symbols;
6. bus vehicle symbols;
7. selected-feature highlight.

Subway trains use directional rectangular symbols. Buses use directional arrow
symbols. Mode and state never rely on colour alone. Labels and stop/station
density increase progressively with zoom.

A selected feature opens one accessible popup and synchronizes with the rail.
The rail keeps a DOM list alternative for keyboard and screen-reader use. The
current long list of every nearby feature is collapsed by default; search
results and the selected item stay visible.

### 7.4 Controls and state copy

The rail exposes labelled `지하철` and `버스` layer toggles. Below bus
eligibility, the bus toggle remains present with `더 확대하면 현재 화면의 버스를
표시합니다`.

Connection states use text and shape in addition to colour:

- `실시간 연결됨 · HH:MM:SS`;
- `재연결 중 · 차량을 숨겼습니다`;
- `지하철 운행 정보 없음`;
- `버스 실시간 정보를 불러오지 못했습니다`;
- `버스 API 설정이 필요합니다`.

The scope intentionally excludes time playback, speed controls, congestion,
ridership, people simulation, weather, and timetable-generated movement.

## 8. Accessibility and motion

- Map controls and rail controls are at least 44x44 CSS pixels.
- Mode toggles expose `aria-pressed`; stream state uses a concise `aria-live`
  message without re-announcing every vehicle.
- Every selectable map feature has an equivalent named item in the rail.
- Focus is visible and returns to the corresponding rail or map trigger after
  a popup closes.
- Route names, vehicle directions, and state text remain understandable without
  colour.
- `prefers-reduced-motion: reduce` disables position tweening and all
  non-essential transitions while preserving live updates.

## 9. Testing and QA

### Contracts and adapters

- reject malformed network, vehicle, bbox, SSE, and upstream payloads;
- normalize official subway station-state records and bus GPS records;
- verify station/route identity reconciliation and coordinate order;
- verify subway segment anchoring and interpolation boundaries.

### Server services and HTTP

- prove two SSE clients share one subway poll and one collector per bus route;
- prove route collectors start and stop with ref counts;
- validate zoom, bbox area, Seoul bounds, and route-count eligibility;
- prove successful, no-service, unavailable, unconfigured, and zoom-required
  states;
- prove one failed bus route clears the complete bus snapshot;
- prove disconnect cleanup, heartbeats, fresh reconnect snapshots, and no
  event-backlog replay;
- verify `/api/health` aggregation without exposing vehicle or credential data.

### Web unit and integration tests

- replace GeoJSON sources atomically on every `vehicles` event;
- clear both vehicle sources on `EventSource` error;
- clear one mode immediately on its unavailable event;
- close and recreate the stream after map `moveend` changes bbox or zoom;
- preserve the other mode, static network, selection, and camera during partial
  failure;
- disable tweening under reduced motion;
- assert projected geographic coordinates land inside the map viewport. This
  is the regression test missing from the current marker-count coverage.

### Browser and Aside QA

Playwright covers 360x800, 768x1024, 960x900, and 1440x900 with deterministic
network and SSE fixtures. It verifies direct navigation, layer ordering,
vehicle movement, viewport changes, route-count gating, immediate clearing,
reconnection, keyboard selection, long Korean names, and WebGL failure.

After deployment, Aside verifies the public route's live connection state,
keyboard flow, accessibility tree, readable failure states, responsive layout,
and the absence of off-viewport marker positioning. Real upstream smoke checks
are evidence for connectivity only; deterministic fixtures own correctness.

## 10. Delivery sequence

1. Correct the current marker-position regression and add projected-position
   browser coverage.
2. Add shared contracts, versioned subway network generation, and the cacheable
   network endpoint.
3. Add the shared subway collector, SSE transport, health metrics, and subway
   MapLibre layers.
4. Add bus topology adapters, ref-counted route collectors, bbox/zoom gating,
   and bus layers.
5. Replace the preview rail and state presentation, then complete responsive,
   accessibility, failure, and reduced-motion coverage.
6. Configure `SEOUL_BUS_API_KEY`, deploy, run runtime smoke checks, and complete
   the combined Aside functional/visual QA report.
7. Review seven days of in-service availability metrics and adjust collection
   cadence or gating only from measured evidence.

## 11. Documentation impact

Implementation must update the following owners rather than leaving this spec
as the only record:

- `DESIGN.md`: replace the preview exclusion of route lines and vehicle
  movement with the approved live-map contract;
- `.issueops/OPEN_API_SPEC.md`: add network, SSE, validation, and error
  semantics;
- `.issueops/ARCHITECTURE.md` and `architecture/api-and-transit.md`: add
  network and live collector flow;
- `.issueops/OPERATIONS.md`: add the bus key, upstream smoke checks, SSE
  smoke checks, and seven-day availability review;
- `.issueops/TESTING.md`: add deterministic SSE and projected-position
  coverage;
- `.issueops/ADR.md`: record the accepted SSE aggregation and no-stale
  vehicle decision.

## 12. Acceptance criteria

1. At city zoom, subway routes and stations render at correct coordinates and
   live trains appear only while the subway source is live.
2. At an eligible bus zoom and bbox, every discovered route and live vehicle
   intersecting the viewport renders at its official coordinates.
3. A source failure or SSE error removes affected vehicles before the next
   animation frame and exposes a textual state.
4. No timetable-generated or stale vehicle remains visible or labelled live.
5. A wide or dense viewport performs no live bus fan-out and tells the user to
   zoom further.
6. Multiple browsers share upstream collectors; upstream calls do not scale
   linearly with connection count.
7. Static network context and map controls remain usable during partial and
   complete live-data failure.
8. Keyboard users can toggle modes, select the same features available on the
   map, close details, and recover from failures.
9. The preview passes deterministic unit, Nest, Playwright, and build gates at
   the declared viewports.
10. The deployed service exposes non-gating source availability metrics and
    completes a seven-day in-service availability observation.
