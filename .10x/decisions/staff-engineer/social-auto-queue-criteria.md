# Staff Engineer — social-auto-queue-criteria

## Phase 2 (2026-10-15)

**Patterns to follow**

- Posting Plan model/validation shape in `lib/scorecard/src/posting-plan.ts`; `planGates` and the reader guard test (`posting-plan-readers.test.ts`) that fails if a drafting module reads legacy columns.
- Draft keys via `draftKeys.*` and `upsertDraftByKey` (refresh while unposted); round keys `<engine>:${season}:${round}`.
- Central reads only through `central-queries.ts`; central writes only by the projector. Private players excluded at read time.
- Junior naming through `makeJuniorNaming` / `juniorPublicName`; junior cards carry no photos; `cardInput.junior` drives labels and photo rules.
- Idempotent hand-run SQL in `scripts/sql/` with `IF NOT EXISTS` / re-runnable updates; runbook read-only checks.
- OpenAPI-first: edit `lib/api-spec/openapi.yaml`, regenerate with orval, never hand-edit generated files.
- Earlier kind retirement precedent: `newCap` → `debut` (note in `share-card/types.ts`).

**Cross-cutting concerns**

- Junior isolation: combined carousels place slides side by side; never sum junior and senior figures on a cover.
- Tenant scoping on every new query (feats by club id; team modes per tenant).
- Logging: feats written per match (count), junior cards held at dispatch (reason), privacy re-check changes.
- Backwards compatibility: `CardKind` enum keeps retired kinds; posted drafts must render; `posting-schedule.ts` slot map keeps them.
- Rollback: `postingPlanWrite` keeps mirroring legacy columns.

**Standards**

- Tests beside code (`*.test.ts`), DB tests on the local embedded Postgres; web tests with the `renderAt` helper.
- Prettier 3.9.6 (CI version), eslint on changed files, typecheck both apps.
- Windows: codegen via `cd lib/api-spec && ./node_modules/.bin/orval --config ./orval.config.ts`; drizzle drift check via a temp relative-path config.

**Reuse**

- `pickTeamOfWeek` etc. stay untouched (next spec).
- `generateRecapDrafts` keeps the grade-leader renderer for champion cards.
