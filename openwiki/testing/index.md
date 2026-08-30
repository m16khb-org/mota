# Files

- [Testing and Verification Stack](overview.md) - How mota is verified — the three vitest postures (colocated unit tests in every workspace, API e2e suites through the Nest testing module with a fake Supabase, and Postgres integration tests gated on DATABASE_URL), the createApp/inject harness and seam design that make them possible, the jsdom web component and PWA asset tests, and the honest gaps (no Playwright specs, no CI pipeline running the suites).
