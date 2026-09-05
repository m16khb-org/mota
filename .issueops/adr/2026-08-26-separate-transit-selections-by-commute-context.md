---
name: 2026-08-26-separate-transit-selections-by-commute-context
description: Accepted decision record with rationale, alternatives, and consequences.
---

# Separate transit selections by commute context

- Date: 2026-08-26
- Kind: `adr`
- Source: omo
- Summary: Model 출근 and 퇴근 as two independent transit-point selection contexts while keeping route planning and ordered commute procedures out of scope.
- Context: The product previously stored one flat set of bus stops and subway stations. The user explicitly requested separate 출근 and 퇴근 settings with mobile-responsive editing.
- Decision: Store canonical settings under commutes.toWork and commutes.toHome. Scope every add, select, toggle, and remove operation to the active context. Migrate legacy flat documents by copying their saved points into both contexts, then persist the nested form on the next write.
- Consequences: The JSONB column requires no SQL migration because shared Zod parsing handles both old and new documents. UI and state mutations require an explicit commute context. Existing data initially appears in both contexts and can then diverge independently.
- Evidence:
  - User instruction on 2026-08-25
  - packages/contracts/src/transitSettings.ts
  - apps/web/src/hooks/transitSelectionMutations.ts
  - apps/web/src/components/CommuteContextSelector.tsx
  - packages/contracts/src/transitSettings.test.ts
  - apps/web/src/App.test.tsx
  - Aside FQA-001/FQA-002/FQA-003
- Alternatives / rejected options:
  - Keep one flat selection and label the current view only; rejected because edits would still leak between 출근 and 퇴근.
  - Restore the retired ordered commute-procedure editor; rejected because the request only needs independent transit points, not route planning or place management.
  - Put legacy selections only in 출근; rejected because users switching to 퇴근 would appear to have lost existing saved data.
