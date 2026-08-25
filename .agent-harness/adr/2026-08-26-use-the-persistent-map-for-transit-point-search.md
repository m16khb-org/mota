---
name: 2026-08-26-use-the-persistent-map-for-transit-point-search
description: Accepted decision record with rationale, alternatives, and consequences.
---

# Use the persistent map for transit point search

- Date: 2026-08-26
- Kind: `adr`
- Source: omo
- Summary: Run bus-stop and subway-station discovery inline on MapStage instead of opening modal pickers with duplicate maps.
- Context: The modal pickers removed the user's spatial context, duplicated Leaflet, and felt especially disruptive on mobile. The user explicitly requested that find actions display candidates on the current map.
- Decision: MapStage remains mounted and gains an inline search state. Entering search immediately requests candidates at the current center, candidate markers and an accessible horizontal list share selection state, and save/cancel returns to arrivals without replacing the map. Mobile search expands the same map to 55dvh.
- Consequences: MapPicker and SubwayPicker are removed. MapStage now owns search presentation, useInlineMapSearch owns request and selection state, and explicit `이 위치 다시 찾기` requests after panning. Search focus moves to the inline region and returns to the trigger after save/cancel.
- Evidence:
  - DESIGN.md
  - apps/web/src/components/MapStage.tsx
  - apps/web/src/components/InlineMapSearchControls.tsx
  - apps/web/src/hooks/useInlineMapSearch.ts
  - apps/web/src/components/MapStage.test.tsx
  - Playwright 360px and 768px inline interaction QA
- Alternatives / rejected options:
  - Keep the modal pickers and only restyle them; rejected because the interaction still opens a second surface and duplicates the map.
  - Navigate to a dedicated search route; rejected because it loses the visible arrival context and adds navigation state.
  - Search continuously while panning; rejected to avoid surprise network traffic and unstable candidate results.
