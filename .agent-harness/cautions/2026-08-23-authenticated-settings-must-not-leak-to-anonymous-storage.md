---
name: 2026-08-23-authenticated-settings-must-not-leak-to-anonymous-storage
description: Caution record for a solved false case or recurring risk.
---

# Authenticated settings must not leak to anonymous storage

- Date: 2026-08-23
- Kind: `caution`
- Source: project-bootstrap enrichment
- Summary: Account settings and anonymous local selections have separate ownership and must never overwrite each other.
- Context: Mota supports anonymous local use and authenticated server synchronization in the same browser.
- Resolution: Load and save authenticated selections through /api/settings, retain anonymous selections under local storage, and restore the anonymous state on logout.
- Evidence:
  - apps/web/src/hooks/useTransitSelections.ts
  - apps/web/src/hooks/transitSelectionStorage.ts
  - apps/web/src/hooks/useTransitSelections.test.tsx
