---
name: 2026-08-26-restart-fastify-after-rebuilding-vite-assets
description: Caution record for a solved false case or recurring risk.
---

# Restart Fastify after rebuilding Vite assets

- Date: 2026-08-26
- Kind: `caution`
- Source: omo
- Summary: A running local production server can serve a newly rewritten index while returning 404 for new hashed Vite chunks until Fastify restarts.
- Context: During local visual QA, `pnpm --filter @mota/web build` replaced hashed assets while the Nest/Fastify static server on port 3210 remained running. The next browser reload requested the new JS/CSS hashes, but the process returned 404 and rendered stale/empty UI.
- Resolution: Stop the local API process before rebuilding, or restart it immediately after every web production build. Wait for `/api/health` after restart before browser QA. Do not diagnose the resulting missing UI as a React regression until the static server has restarted.
- Evidence:
  - Fastify logs returned 404 for `/assets/index-C0Pu0O9x.js` and `/assets/index-CJ54ceod.css` immediately after an in-place Vite rebuild.
  - Restarting the local Nest/Fastify process registered the new dist assets.
  - apps/api/src/main.ts static asset registration and apps/web Vite hashed output.
