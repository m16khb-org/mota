---
name: product-and-workspaces
description: Mota product boundary, workspace ownership, and React browser composition.
---

# Product and Workspaces

Canonical index: [ARCHITECTURE.md](../ARCHITECTURE.md).

## Product boundary

Mota does one job: choose the `출근` or `퇴근` context, select that context's
Seoul bus stops or subway station/direction, and show at most the next three
arrivals.

The two contexts separate saved transit points only. The active product still
does not include ordered commute procedures, named home/company places,
favorites, journey ETA calculation, or route-station planning.

## Workspace ownership

```text
apps/web            React 19 + Vite PWA
apps/api            NestJS 11 + Fastify API and static web server
packages/contracts  Shared Zod wire and persistence contracts
packages/db         Drizzle ORM schema, migration, and repository
```

- `apps/web` owns UI, browser transport, and anonymous local storage.
- `apps/api` owns HTTP mapping, transit adapters, the auth-gateway login proxy, and static serving.
- `packages/contracts` owns shared wire and persistence schemas.
- `packages/db` owns Drizzle schema, migrations, and settings repository.

Dependency direction is normative in [overview.md](overview.md).

## Web composition

`apps/web/src/App.tsx` is the React composition root.

- `useAuthSession` reads the same-origin `/api/auth/session`.
- `GoogleLogin` sends anonymous users to the same-origin `/api/auth/google`, which proxies the gateway.
- `CommuteContextSelector` switches between independent `toWork` and `toHome` selections.
- `useTransitSelections` keeps anonymous selections in localStorage and scopes every mutation to one commute context.
- Authenticated selections load and save through `/api/settings`.
- Authenticated settings never overwrite the anonymous localStorage document.
- `ArrivalList` and `SubwayArrivalList` render at most three rows.
- `MapStage` owns the one persistent map. `useInlineMapSearch` and `InlineMapSearchControls` add nearby bus/subway candidates to that map without a modal, backdrop, or duplicate map.
- Entering search performs one request at the current center; panning alone is local and `이 위치 다시 찾기` explicitly requests the new center.

Presentation, responsive behavior, Korean content, and accessibility are
owned by [DESIGN.md](../../DESIGN.md).
