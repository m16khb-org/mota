---
name: 2026-10-09-pnpm-add-can-silently-exempt-a-fresh-package-from-release-ag
description: Caution record for a solved false case or recurring risk.
---

# pnpm add can silently exempt a fresh package from release-age policy

- Date: 2026-10-09
- Kind: `caution`
- Source: project-docs-update after SEED adoption
- Summary: pnpm 12 added @seed-design/css@3.0.2 to minimumReleaseAgeExclude in pnpm-workspace.yaml when the version was younger than the minimum release age.
- Context: Running pnpm --filter @mota/web add @seed-design/css@3.0.2 (published 2026-10-08) succeeded but printed 'Added 1 entry to minimumReleaseAgeExclude in pnpm-workspace.yaml', weakening the workspace supply-chain gate without a prompt. With nodeLinker: hoisted the package lands in root node_modules, not apps/web/node_modules.
- Resolution: Revert pnpm-workspace.yaml and pin a version older than the release-age window (@seed-design/css 3.0.1, published 2026-10-02); confirm git diff shows no minimumReleaseAgeExclude change before committing a dependency.
- Evidence:
  - pnpm-workspace.yaml (unchanged after the fix)
  - apps/web/package.json (`@seed-design/css` `3.0.1`)
  - pnpm-lock.yaml
  - `npm view @seed-design/css time --json`
  - mota commit 2b10d61
