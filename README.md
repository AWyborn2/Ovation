# Ovation

[![CI](https://github.com/AWyborn2/Ovation/actions/workflows/ci.yml/badge.svg)](https://github.com/AWyborn2/Ovation/actions/workflows/ci.yml)

White-label cricket stats-and-history platform. A club brands it as its own and gets
its full history — stats, records, honour boards, milestones — from a shared
association database that stays current automatically. Halls Head Cricket Club is
tenant #1 (the demo); pilot tenants are Peel Cricket Association clubs.

> **New to this repo? Read [`AGENTS.md`](./AGENTS.md) first** — it's the orientation
> map (structure, patterns, current state, gotchas). [`CLAUDE.md`](./CLAUDE.md) has the
> white-label strategy and roadmap; [`replit.md`](./replit.md) has the inherited data
> model. If the docs disagree, trust the code, then `AGENTS.md`.

## What's in here

A pnpm monorepo:

- `artifacts/cricket-club` — the website (React + Vite + Tailwind). The main product.
- `artifacts/api-server` — the backend (Express 5 + Drizzle + Postgres).
- `artifacts/cricket-mobile` — the phone app (Expo / React Native).
- `lib/*` — shared toolkits: `api-spec` (the OpenAPI contract — source of truth for the
  API), `api-client-react` + `api-zod` (generated from it), `db` (schema + central-DB
  reads), `scorecard` (shared match view-model), `object-storage-web`.

Architecture: a **contract-first** design where one OpenAPI spec generates the glue
between the website, the mobile app, and the backend — now reading shared stats from a
central association database, filtered per tenant.

## Prerequisites

- Node 22
- pnpm 9 (this repo is pnpm-only; npm/yarn are blocked by a preinstall hook)
- A Postgres database (for the API server) — set `DATABASE_URL`

## Setup

```bash
pnpm install
```

Apply the database schema (drizzle push):

```bash
DATABASE_URL=postgres://… pnpm --filter @workspace/db run push
```

## Run

```bash
# Backend  (needs DATABASE_URL)
pnpm --filter @workspace/api-server run dev

# Website
pnpm --filter @workspace/cricket-club run dev
```

(See `replit.md` for the full original run notes and the data model.)

## Test

```bash
pnpm run typecheck                              # whole monorepo

pnpm --filter @workspace/cricket-club test      # website smoke tests (no backend needed)

# API integration tests — REAL Postgres required:
DATABASE_URL=postgres://… pnpm --filter @workspace/db run push-force
DATABASE_URL=postgres://… pnpm --filter @workspace/api-server run seed:ci   # seeds tenant #1 on a fresh DB
DATABASE_URL=postgres://… pnpm --filter @workspace/api-server test
```

The website smoke tests are hermetic (the network layer is mocked) — see
[`artifacts/cricket-club/src/test/README.md`](./artifacts/cricket-club/src/test/README.md).
The api-server tests import the Express app and hit a live Postgres.

## CI

Every push to `main` and every pull request runs [`.github/workflows/ci.yml`](./.github/workflows/ci.yml):

| Job | What it does | Needs a DB? |
|-----|--------------|-------------|
| **Typecheck** | `pnpm run typecheck` across the monorepo | no |
| **Web smoke tests** | cricket-club page-render tests | no |
| **API integration tests** | spins up Postgres, applies schema, seeds tenant #1, runs api-server vitest | yes (service container) |

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the merge workflow and branch protection.

## Hard constraints (don't break these)

- **OpenAPI-first**: edit `lib/api-spec/openapi.yaml`, then
  `pnpm --filter @workspace/api-spec run codegen`. Never hand-edit generated files.
- **Tenant isolation**: one tenant must never read another's data. Guarded by tests.
- **Juniors isolation**, **fill-in exclusion** (`player_id >= 90000`), and the other
  gotchas in `replit.md` and `AGENTS.md`.
- **Curated club content is the moat** — tenant-scope it; never replace it with central data.
- **Data governance**: pilot/non-commercial framing until partner/licence access; don't
  commercialise on scraped data. (Details in `CLAUDE.md`.)
