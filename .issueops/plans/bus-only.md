# Mota bus-only conversion

## Intent and decisions

User request: “mota에서 지하철은 제외하자 mota는 버스전용으로 개편”.
Convert the current application, API, settings and operating documentation to buses only.
Keep Seoul signage styling, authentication, independent toWork/toHome selections,
four selected stops, three arrival rows per stop, desktop rail/map and mobile map toggle.
Remove the subway-only 3D preview rather than inventing a replacement bus 3D product.
Old /3d-preview links return users to the bus home screen. Removed API routes return 404.
Legacy settings are parsed into bus-only settings, preserving bus stops, selected IDs,
CAS versions, anonymous storage key and anonymous/authenticated isolation. Ignore obsolete
subway fields, including malformed obsolete values. Legacy singular bus selection still migrates.
Keep already-applied SQL migrations and retired quota table definitions for database history;
stop importing/using the quota runtime. Do not drop production tables or rewrite stored rows.
No unrelated improvements, commits, pushes, deployment, or generated OpenWiki edits.

## Evidence and assumptions

Repo grounding: App.tsx, Root.tsx, TransitPointSelector.tsx, useArrivalDetail.ts,
transitSelectionStorage.ts, transitSelectionMutations.ts, transitSettings.ts,
app.module.ts, main.ts, config/env.ts, transit.controller.ts, transitCatalog.service.ts,
health.controller.ts, package manifests, DESIGN.md, .issueops architecture/API/testing docs.
Decision-complete plan: tasks below own disjoint files with shared bus-only settings shape.
Assumptions/defaults: existing 3D API and UI are subway-only and are retired; preserve SQL history.
Unresolved questions: none blocking.
Acceptance criteria: all root gates and bus browser journeys pass; no subway runtime requests.

## Tasks

- [x] T1 Shared contracts and persistence (deep; packages/contracts and packages/db).
  Replace point settings output with { busStops, selectedBusStopIds }. Keep commute envelope.
  Remove subway/transit-map contracts and exports after consumers are converted. Retire quota
  runtime/export/tests, preserve SQL and existing historical table definitions. Adapt DB fixtures.
  References: packages/contracts/src/transitSettings.ts; packages/db/src/repository.ts.
  QA: legacy mixed settings retain exact buses and selections, malformed obsolete subway fields
  cannot erase buses, singular legacy selections migrate; invalid bus data is still rejected.
  Run focused contract tests RED then GREEN; contracts/db checks and unit tests. No commit.

- [x] T2 API retirement (deep; apps/api only; depends on T1 output shape).
  Remove subway and transit-map routes, collectors, adapters, generated network and related tests.
  Remove subway startup config, catalog loading, quota and health dependencies. Keep bus/auth/settings.
  References: apps/api/src/app.module.ts, main.ts, transit and health controllers, config/env.ts.
  QA: old subway/map APIs return 404 without upstream calls; bus nearby/arrivals still succeed;
  startup/health require no subway key and only warm bus catalog; settings legacy compatibility.
  Run focused HTTP tests RED then GREEN and API typecheck/lint/tests. No commit.

- [x] T3 Bus UI (visual-engineering; apps/web only; depends on T1 output shape).
  Remove mode selection, subway UI/state/storage mutations, subway/map clients, 3D preview and
  maplibre dependency. Simplify map/search and commute summaries to buses. Preserve bus interactions.
  References: App.tsx, Root.tsx, components/MapStage.tsx, MapCanvas.tsx, hooks, existing browser tests.
  QA: no subway or 3D controls; mixed old storage opens bus selections; add/select/delete/reload and
  commute independence; mobile 360px and desktop no overflow; old preview URL reaches bus home;
  failed arrivals preserve results and retry. Tests RED/GREEN and browser journeys. No commit.

- [x] T4 Integration and documentation (coordinator; root/config/docs/scripts).
  Update AGENTS, README, DESIGN and .issueops normative owners to bus-only; preserve historical ADRs
  with supersession notes. Remove subway build/codegen/config references and unused map tooling.
  Refresh lockfile. Avoid editing .env secrets or generated openwiki/design reference artboards.
  QA: search active sources/config for orphan imports and calls; validate documentation references.
  No commit.

- [x] T5 Review and verification (coordinator/reviewer; after T1–T4).
  Run pnpm typecheck, pnpm check, pnpm test, pnpm build; run web Playwright suite.
  Review compatibility, removed endpoint behavior, no subway warmup and retained bus keyboard/map UX.
  DB integration only with an explicitly available safe test database; report otherwise.
  Report actual gate results and uncommitted branch. No deployment.

## Execution notes

Implementation authorization is the user's explicit conversion request; proceed through reversible
code changes without additional approval menus. Work on feat/bus-only in the existing clean workspace.
T1/T2/T3 can execute independently against the agreed output schema; coordinator integrates afterward.
Shared interface audit: T1 produces bus-only settings consumed by T2 fixtures and T3 storage/hooks.
T2 and T3 both remove transit-map consumers before T1's deleted exports are validated globally.
T4 owns root lock/config/doc edits, so workers must not overwrite those files.


## Verification progress

- T1 contract RED demonstrated old schema rejects missing/malformed subway values; GREEN passed.
- T2 initial RED was a module-resolution failure during concurrent contract retirement,
  not a behavioral failure. Final API suite passed 43 tests, including retired-route checks.
- First forced whole-repo run: 16/16 Turbo tasks passed (typecheck/check/test/build),
  129 tests passed and 2 PostgreSQL integrations skipped without DATABASE_URL.
  Full output: `/tmp/mota-bus-only-gates.log`.
- Project-doc MCP route rejected missing authority_file. Direct file edits used the
  documented fallback with source/user evidence. Historical SQL and OpenWiki left intact.
- Frontend final cleanup, exact empty-selection preservation and browser QA remain underway.

- T3 final frontend gate: 79 tests passed. Browser suite: 7/7 passed after an
  initial navigation timeout was isolated and rerun without changing test timeouts.
  Logs: `/tmp/mota-web-e2e.log`, `/tmp/mota-web-e2e-final.log`.
- Parent inspected fresh mobile/desktop browse and mobile search screenshots.
  Controlled tiles/API fixtures were used; live upstream health is not established.
- Independent review found no functional regressions. Manifest copy duplication was fixed.
- Final concurrent gate attempt had 2 unchanged web tests time out at 5 seconds
  (AppErrorBoundary recovery, useAuthSession identity). Full output preserved in
  `/tmp/mota-bus-only-final-gates.log`; serial whole-repo run is in progress to
  isolate competing build/test load, without increasing timeouts or changing code.


## Final result

- `pnpm exec turbo run typecheck check test build --force --concurrency=1`:
  exit 0, 16/16 tasks passed; 133 tests passed, 2 PostgreSQL integration tests
  skipped because DATABASE_URL was not supplied. Both previously timed-out web
  tests passed without code or timeout changes. Full log:
  `/tmp/mota-bus-only-serial-gates.log`.
- `pnpm --filter @mota/web test:e2e`: exit 0, 7/7 Chromium journeys passed.
- Independent final review and parent screenshot inspection completed; copy finding fixed.
- Historical SQL/database tables preserved; no live upstream/deployment claim.
- Implementation was verified on feat/bus-only. The subsequent user request authorizes
  commit, push, merge, deployment and branch cleanup.
