---
name: 2026-10-03-make-mota-bus-only
description: Retire subway and its 3D preview while preserving bus settings.
---

# Make Mota bus-only

- Status: accepted by the user's explicit bus-only conversion request.
- Context: Mota previously combined bus arrivals with subway arrivals and a
  subway-only 3D map. The user removed subway from the product scope.
- Decision: remove subway controls, contracts, APIs, catalog warmup, live-map
  collection, request-budget runtime and obsolete configuration. Retire the
  subway-only 3D route; existing browser links open the bus home screen.
- Compatibility: preserve bus stops, watched IDs, independent commute contexts,
  auth-gateway login, CAS versions and the anonymous localStorage key. Ignore
  obsolete subway fields at the shared Zod boundary. Historical SQL migrations
  and quota table definitions remain without runtime consumers; no table drop
  or bulk rewrite is required.
- Alternatives: hiding only the tab would leave unnecessary backend work;
  replacing the 3D map with a new bus map would expand the requested scope.
- Consequences: old subway/transit-map API paths return 404. The active product
  has no vehicle SSE feed or subway API-key requirement. Historical design
  artboards and ADRs are references, not current feature requirements.
- Evidence: user request; `packages/contracts/src/transitSettings.ts`;
  `apps/api/src/app.module.ts`; `apps/api/test/retired-transit.e2e.test.ts`;
  `apps/web/src/Root.tsx`; `DESIGN.md`.

This supersedes the live-map product decision in
[the September live transit ADR](2026-09-05-stream-live-transit-without-stale-vehicles.md).
