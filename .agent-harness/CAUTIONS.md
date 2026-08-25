---
name: CAUTIONS.md
description: Index of concrete Mota failure modes and their verified resolutions.
---

# Cautions

Only record failures that actually occurred or recurring risks proven by source and tests. Hypothetical advice belongs in the owning architecture, convention, testing, or operations document.

## Index

- [Cautions overview](cautions/overview.md)
- [Fastify static fallback route collisions](cautions/2026-08-23-fastify-static-fallback-route-collisions.md)
- [Docker runtime must include workspace packages](cautions/2026-08-23-docker-runtime-must-include-workspace-packages.md)
- [Authenticated settings must not leak to anonymous storage](cautions/2026-08-23-authenticated-settings-must-not-leak-to-anonymous-storage.md)
- [Access-token expiry requires refresh-cookie relay](cautions/2026-08-25-access-token-expiry-requires-refresh-cookie-relay.md)

Add future solved incidents with MCP `project_docs_append(kind="caution")`; do not put speculative warnings here.
