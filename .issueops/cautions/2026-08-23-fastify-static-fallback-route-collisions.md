---
name: 2026-08-23-fastify-static-fallback-route-collisions
description: Caution record for a solved false case or recurring risk.
---

# Fastify static fallback route collisions

- Date: 2026-08-23
- Kind: `caution`
- Source: project-bootstrap enrichment
- Summary: Static serving and SPA fallback can collide when both register wildcard routes.
- Context: The production Nest/Fastify container failed while static serving and catch-all routing competed.
- Resolution: Register @fastify/static with wildcard: false and keep the HTML-only SPA fallback in WebController; /api and non-HTML requests remain JSON 404s.
- Evidence:
  - apps/api/src/main.ts
  - apps/api/src/web/web.controller.ts
  - apps/api/test/app.e2e.test.ts
