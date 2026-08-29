# Files

- [Testing and Verification Stack](overview.md) - How mota is verified — the three vitest layers (colocated unit tests in every workspace, API e2e suites through the Nest testing module with a fake Supabase, and Postgres integration tests gated on DATABASE_URL), the createApp/inject harness, the seam design that makes it possible, and the Turbo task wiring that orders and gates them.
