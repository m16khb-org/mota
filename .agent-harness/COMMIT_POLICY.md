---
name: COMMIT_POLICY.md
description: Mota commit scope, message format, staging, and verification evidence.
---

# Commit Policy

## Authorization

Do not create, amend, rebase, or push commits unless the user explicitly requests Git work. Never include unrelated working-tree changes.

## Message format

Recent repository history consistently uses Conventional Commit subjects:

```text
<type>(<scope>): <imperative summary>
```

Observed types include `feat` and `fix`; breaking changes use `!`. Match the existing scope vocabulary instead of inventing a new taxonomy.

## Atomicity and staging

- One verified behavior or documentation unit per commit.
- Stage explicit paths; never use broad staging when unrelated work exists.
- Inspect staged content for secrets, generated artifacts, and accidental deletions.
- Keep the commit green on its own.

## Required evidence

- Documentation-only: link/checker validation and `git diff --check`.
- TypeScript behavior: relevant test first, then `pnpm typecheck`, `pnpm check`, and the affected build.
- Cross-workspace or deployment: `pnpm test`, `pnpm build`, integration tests when `DATABASE_URL` is involved, and a real runtime smoke check.

Evidence: `git log -12 --pretty=format:%s`, root `package.json`, and `turbo.json`.
