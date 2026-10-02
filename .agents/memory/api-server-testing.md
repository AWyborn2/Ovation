---
name: api-server testing setup
description: How vitest tests run in the api-server package (DB-backed, supertest, forged auth cookies).
---

# api-server testing setup

vitest lives in `artifacts/api-server` (config `vitest.config.ts`, scripts
`test` / `test:watch`). Test files are `src/**/*.test.ts`.

## Key constraints
- **Tests run against the live dev DB** — there is no separate test database.
  Every test must create uniquely-suffixed rows and clean them up (rely on FK
  `onDelete: cascade` where possible: delete the award/import/captain/players
  and children disappear).
- `vitest.config.ts` sets `resolve.conditions: ["workspace"]` so `@workspace/*`
  source packages resolve, and `fileParallelism: false` so DB-backed suites
  don't race each other.
- **Route/integration tests** mount the Express app via `supertest(app)` (no
  `listen`). Auth is faked by forging the HMAC session cookies with
  `encodeSession` / `encodeCaptainSession` from `src/lib/auth.ts` (cookie names
  `SESSION_COOKIE` / `CAPTAIN_SESSION_COOKIE`); set `SESSION_SECRET` in
  `beforeAll` — it's read at call time, so import order doesn't matter.

## Gotcha
- Run focused tests with `pnpm --filter @workspace/api-server exec vitest run <files>`
  (and the equivalent web package command), not `run test -- <files>`.
  **Why:** The extra standalone `--` was forwarded to Vitest and the requested
  file filters were ignored, unexpectedly running the broad DB-backed suite.
  **How to apply:** Check the configured database target and suite isolation
  before running tests; use the direct `exec` command whenever scope matters.
- Per-package `pnpm --filter @workspace/api-server typecheck` fails with stale
  "no exported member" errors from `@workspace/db` / `@workspace/api-zod` unless
  the composite libs are built first. Run root `pnpm run typecheck` (it does
  `tsc --build` on libs first) when those errors appear.
