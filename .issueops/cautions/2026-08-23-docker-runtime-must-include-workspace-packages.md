---
name: 2026-08-23-docker-runtime-must-include-workspace-packages
description: Caution record for a solved false case or recurring risk.
---

# Docker runtime must include workspace packages

- Date: 2026-08-23
- Kind: `caution`
- Source: project-bootstrap enrichment
- Summary: A compiled Nest app can still fail at startup when runtime workspace package links or artifacts are absent.
- Context: The monorepo image built successfully but the runtime initially could not resolve @mota/contracts and @mota/db.
- Resolution: Copy compiled workspace artifacts and create runtime @mota package links as defined by Dockerfile; validate by starting the container, not by image build alone.
- Evidence:
  - Dockerfile
  - package.json
  - pnpm-workspace.yaml
