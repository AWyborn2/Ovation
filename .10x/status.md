# Project Status

**Project:** Ovation (white-label cricket club platform)
**Active feature:** selection-hub-decoupling (Planning complete 19 Oct 2026, ADR-008 accepted; next: PR0 foundation, then PR1–PR3 in parallel) — junior-card-photos in delivery
**Queued:** selection-side-size (+ overseas players) — planning complete 20 Oct 2026 (decisions/engineering-manager/selection-side-size.md, ADR-009 accepted). PR A (foundation, TA.1–TA.3: migration 0049, OpenAPI + codegen, shared `@workspace/scorecard/selection-shape`; no behaviour change) is PR #385 from `claude/selection-side-size-pr-a-588cf8`; Ash runs 0049 in Production SQL before the next republish (SQL in the PR body). PR A merged 20 Oct 2026 (0484f77c). PR B (side size end to end, TB.1–TB.5; no migration) merged 20 Oct 2026 as #389 (c011782f). PR C (overseas players, TC.1–TC.5: season flag route, squad toggle, per-grade cap, board counter + finalise warning + snapshot, OS badges in the Hub and on the team sheet; no migration) merged 20 Oct 2026 as #388 (e21d23ee). PR D (cards + public, TD.1–TD.3: every Team List pack and the Studio XI list show up to 14 with rows auto-compressed above 12 and a neutral "OS"; the public team lists carry OS masked with the name; no migration) is the last slice, from `wyborn21/selection-side-size-pr-d-25eb99` — selection-side-size delivery is complete once it merges. Also queued: social-photo-tag-selection — design complete 2026-10-20 (U1–U3); U1 (tag-based picker + Team List rotation) is PR #386, no migration; next U2, U3; admin-menu-consolidation — product decision + architecture done 2026-10-19 (decisions/architect/admin-menu-consolidation.md); PR 1 (menu moves, Imports hub) implemented on claude/admin-menu-consolidation-84a66f; PR 2 (shirt categories U3–U6, migration 0047) implemented on claude/magical-gould-5777f8, stacked on PR 1; Ash applies 0047 before republishing (docs/runbooks/shirt-number-categories.md)
**Queued (PM 20 Oct 2026):** match-day-carousel-content — product decision done (decisions/product-manager/match-day-carousel-content.md); architecture done (decisions/architect/match-day-carousel-content.md, ADR-010 proposed; scope widened to all card kinds + junior same-day consolidation; absorbs social-tile-short-names); ADR-010 accepted; planning complete (decisions/engineering-manager/match-day-carousel-content.md); runs in parallel with selection-side-size. P1 (names and crests, T1.1–T1.6, migration 0051, renumbered from 0050 after #393 took it) is PR #394 from `wyborn21/carousel-p1-team-names`; Ash runs 0051 in Production SQL before the next republish (SQL in the PR body). P0 (Share to Socials preview fix, T0.1) merged 20 Oct 2026 as #392. P1 merged 20 Oct 2026 as #394. P2 (content contract + Match Day builder, T2.1–T2.6, migration 0052 `social_settings.card_content` + `livestream_url`) is the PR from `wyborn21/carousel-p2-content-contract`; Ash runs 0052 in Production SQL before the next republish (SQL in the PR body). Once it merges, P3–P6 can start in parallel sessions (at most 2 at once). P8 design brief (new third pack, working name Duotone) agreed with Ash 20 Oct 2026: `docs/plans/2026-10-20-new-social-pack-brief.md`; the build still waits on P7.
**Phase:** Delivery — junior-card-photos PR to `main` from `claude/junior-card-photos`; Ash applies migration 0045 before republishing (runbook §3c)

## Phase tracking — junior-card-photos

| Phase            | State | Notes                                                                                                                        |
| ---------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------- |
| 0 Brainstorming  | Done  | Three decisions with Ash on 2026-10-16 (per-player withheld flag, default allow; admin library; all cards; public pages too) |
| 1 Strategy       | Done  | Supersedes R21 of the junior sync plan; plan `docs/plans/2026-10-16-001-feat-junior-card-photos-plan.md`                     |
| 2 Design (ADR)   | Done  | ADR-007 accepted                                                                                                             |
| 3 Planning       | Done  | Units U1–U7 in the plan                                                                                                      |
| 4 Implementation | Done  | decisions/sde, decisions/dba                                                                                                 |
| 5 Verification   | Done  | reviews/2026-10-16-junior-card-photos-review.md — no blocking findings; browser check after republish                        |
| 6 Delivery       | Open  | PR open, merge on green + CLEAN; migration 0045 is Ash's                                                                     |

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

- 2026-10-19 PM: scoped social-tile-short-names (preview fix P0 first).
- 2026-10-20 DBA: match-day-carousel-content T5.0 done (decisions/dba/match-day-carousel-content.md). `central.ladder` is all-time with no season and no refresh path, so T5.1 reads the season ladder from `playhq.ladders` via `playhqGradeLadderUncached`; T5.2 (last meeting) is feasible from `central.matches`. Live Replit DB not reachable from the session: Ash runs the read-only SQL in that file (dev, then prod) to confirm.
- 2026-10-20 Design: P8 brief agreed with Ash (full-bleed duotone photo in club colours, optional; one-line ROUND N headline; white info sheet; Archivo Expanded; no-photo slides use a zoomed, offset club logo at ~13% under halftone + grain). Content contract per preset and size in `docs/plans/2026-10-20-new-social-pack-brief.md`.
