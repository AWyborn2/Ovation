# Project Status

**Project:** Ovation (white-label cricket club platform)
**Active feature:** social-auto-queue-criteria
**Phase:** Delivered — merged to `main` (7b4d0aee, PR #361) and released to production on 16 Oct 2026 (runbook §3b steps run by Ash)

## Phase tracking — social-auto-queue-criteria

| Phase            | State | Notes                                                                                                           |
| ---------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| 0 Brainstorming  | Done  | Requirements and plan approved 2026-10-15 (`docs/plans/2026-10-15-001-feat-social-auto-queue-criteria-plan.md`) |
| Spec review      | Done  | 13 findings resolved; decisions in `.10x/specs/2026-10-15-social-auto-queue-criteria-design.md`                 |
| 1 Strategy       | Done  | decisions/cto, decisions/product-manager                                                                        |
| 2 Design (ADR)   | Done  | ADR-004 (plan v2 defaults in code), ADR-005 (feats by the projector), ADR-006 (junior auto-publish fail-closed) |
| 3 Planning       | Done  | Tasks T1.1–T9.3 in decisions/engineering-manager                                                                |
| 4 Implementation | Done  | Milestones A–E; decisions/sde, decisions/dba                                                                    |
| 5 Verification   | Done  | reviews/2026-10-15-social-auto-queue-criteria-review.md — no blocking findings                                  |
| 6 Delivery       | Done  | PR #361 merged 7b4d0aee; projector SQL, republish, release SQL and feats backfill run in production 16 Oct 2026 |

## Task progress

Milestone A: T1.1–T1.2, T2.1–T2.4 — done (commit 24174a61)
Milestone B: T10.1–T10.2, T3.1–T3.4 — done (commit 1346e52e)
Milestone C: T4.1–T4.3, T5.1–T5.2 — done (commit 1346e52e)
Milestone D: T6.1–T6.2, T7.1–T7.2, T8.1–T8.2 — done (commit c3d09256)
Milestone E: T9.1–T9.2 — done (commit c3d09256); T9.3 — done (PR #361 merged, CI green, released 16 Oct 2026)

## Verification (local, 2026-10-15)

- Typecheck api-server + cricket-club: clean. Codegen regenerated. drizzle-kit generate: no schema changes.
- Web 173 files / 2,029 tests; lib/db 38 / 479; scorecard 20 / 547; API full suite on local Postgres: see the PR description.
- Prettier 3.9.6 + eslint on changed files: clean.

## Blockers

- None in code. Production needs the runbook §3b SQL steps (Ash).

## Parked

- card-kind-templates: Delivery in progress (design track D1–D3, release R1–R4).
- Next spec: Record / Team of the week / Premiership engines (decisions/architect/team-of-the-week-engines.md).
