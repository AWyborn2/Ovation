# Contributing to Ovation

## Before you start

Read [`AGENTS.md`](./AGENTS.md) — structure, patterns, current state, and the things that
will bite you. The repo is mid-transformation from a single-club app into a multi-tenant
platform, so the local-vs-central data boundary and tenant isolation are the high-risk areas.

## Workflow

1. Branch off `main`.
2. Make your change. If it touches the API, edit `lib/api-spec/openapi.yaml` and regenerate
   (`pnpm --filter @workspace/api-spec run codegen`) — never hand-edit generated files.
3. Run the checks locally (see below).
4. Open a pull request. CI runs automatically; all checks must be green to merge.

## Run the checks locally

```bash
pnpm run typecheck
pnpm --filter @workspace/cricket-club test
# API tests need a real Postgres — see README "Test".
```

## What CI enforces

[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs three jobs on every PR:
**Typecheck**, **Web smoke tests** (hermetic), and **API integration tests** (against a
throwaway Postgres service container, with tenant #1 seeded).

## Recommended branch protection (repo admin, one-time)

On GitHub: **Settings → Branches → Add branch ruleset** (or classic branch protection) for
`main`:

- ✅ **Require a pull request before merging.**
- ✅ **Require status checks to pass before merging**, and mark these as required:
  - `Typecheck`
  - `Web smoke tests`
  - `API integration tests`
- ✅ **Require branches to be up to date before merging** (so checks run against the merge result).
- ✅ **Do not allow bypassing the above** (optional, but keeps the gate honest).
- Consider requiring at least 1 review once there's more than one contributor.

The check names above match the `name:` of each job in the workflow. If you rename a job,
update the required-checks list too, or the gate silently stops enforcing it.

## Adding tests

- **Website page**: copy the three-line pattern in
  [`artifacts/cricket-club/src/test/README.md`](./artifacts/cricket-club/src/test/README.md).
  These are smoke tests (does it render without crashing) — keep them cheap.
- **API behaviour**: follow the existing `*.test.ts` suites in `artifacts/api-server/src`.
  They import the real Express app and hit Postgres. Extend the `*-consistency.test.ts` and
  `*-isolation.test.ts` suites whenever you touch a stats read or a tenant-scoped table —
  those are the suites that protect the riskiest parts of the migration.
