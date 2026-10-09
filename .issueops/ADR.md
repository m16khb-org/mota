---
name: ADR.md
description: Index of accepted Mota structural decisions and trade-offs.
---

# Architecture Decision Records

ADRs record implemented or explicitly accepted decisions, not speculative proposals.

## Index

- [ADR overview](adr/overview.md)
- [Adopt Karrot SEED Design](adr/2026-10-09-adopt-karrot-seed-design.md)
- [Make Mota bus-only](adr/2026-10-03-make-mota-bus-only.md)
- Superseded by bus-only: [Stream live transit without stale vehicles](adr/2026-09-05-stream-live-transit-without-stale-vehicles.md)
- [Move mota onto the auth-gateway login proxy](adr/2026-09-03-move-mota-onto-the-auth-gateway-login-proxy-superseding-its.md)
- [Use the persistent map for transit point search](adr/2026-08-26-use-the-persistent-map-for-transit-point-search.md)
- [Separate transit selections by commute context](adr/2026-08-26-separate-transit-selections-by-commute-context.md)
- Superseded by the auth-gateway proxy: [Mota owns its Supabase browser session](adr/2026-08-25-mota-owns-its-supabase-browser-session.md)
- [Turborepo, Nest/Fastify, and Drizzle topology](adr/2026-08-23-turborepo-nest-fastify-and-drizzle-topology.md)

Add future accepted decisions with MCP `project_docs_append(kind="adr")`, including alternatives, consequences, and evidence.
