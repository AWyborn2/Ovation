# Architect — social-auto-queue-criteria

## Phase 2 design (2026-10-15) — ADR-004, ADR-005, ADR-006

Canonical design: plan KTD1–KTD12 and the High-Level Technical Design diagram in `docs/plans/2026-10-15-001-feat-social-auto-queue-criteria-plan.md`.

**Components and boundaries**

- Shared model (`lib/scorecard/src/posting-plan.ts`): rows, packaging, junior options, junior runs bar, defaults (central-aware), styles, validation. Pure.
- Drafting gates (`artifacts/api-server/src/lib/posting-plan.ts`): one `planGates` implementation; no legacy branch. Consumers: sweep, post-commit, round engines, junior sweep, achievements.
- Feat detection (`lib/db/src/playhq-ingest/feats.ts` + `central-project.ts`): pure detector; projector writes `central.match_feats`. Central DDL in `scripts/sql/central-projector.sql` and `lib/db/src/central-schema`.
- Sync cadence (`lib/db/src/playhq-ingest/cadence.ts`): `balls: "since"` on played-match plans.
- Big Moment drafting (`central-achievements.ts`, `junior-social.ts`): century/five-for/feats for seniors; runs/five-for for juniors with the junior bar; junior markers set.
- Junior publishing (`junior-publishing.ts`, `effective-draft-state.ts`, `posting-slots.ts`, `publishing/auto-publish.ts`): fail-closed gate, privacy re-check.
- Retirement: entry points only (kind picker, Trading cards page, card-set generate, countdown override). Renderers stay.
- Look: remove the junior palette override in pack-render and share-card theme; `--juniors-accent` follows primary.
- Release: `scripts/sql/auto-queue-release.sql` (data-only, after republish) + runbook order.

**Data flow.** PlayHQ sync → `playhq.balls`/`match_fielding` → projector detector → `central.match_feats` → `central-queries` → Big Moment drafter → `social_drafts` (with `junior`, `juniorTeams`) → calendar dispatch (privacy re-check, junior gate, per-team mode) → Meta.

**Failure modes.**

- Balls missing for a match → no hat-trick (never a false one). Backfill by re-projection.
- Unknown dismissal type → not bowler-credited → no hat-trick.
- Junior team unresolvable → card waits.
- Old build after rollback → legacy settings return; release SQL re-runnable.

**Trade-offs.** Defaults in code over a production UPDATE; per-team mode over a new flag; central DDL with the projector over an app migration; keep retired renderers over deleting ~80 files now.

## Discovery for the next spec — team-of-the-week-engines [DISCOVERED 2026-10-15]

See `decisions/architect/team-of-the-week-engines.md`.
