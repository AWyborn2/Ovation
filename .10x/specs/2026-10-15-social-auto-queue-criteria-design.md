# Social Auto-Queue Criteria — Design

**Feature slug:** `social-auto-queue-criteria`
**Date:** 2026-10-15
**Canonical spec:** `docs/plans/2026-10-15-001-feat-social-auto-queue-criteria-plan.md` (unified plan, implementation-ready). This file records how the design was reached and the decisions taken at review; the plan holds the requirements, acceptance examples, technical decisions and units.

## How we got here

1. **Trigger.** After round 1 of 2026/27, Halls Head's queue held 48 open cards with the new posting calendar on; most could never get a posting time.
2. **Brainstorm (ce-brainstorm, 2026-10-15).** Ash's decisions: retire some card types and merge overlapping ones; a per-type table of auto-queue, criteria and packaging; Big Moments on a fixed bar (century, five-for, hat-trick, five catches) with a lowerable junior runs bar; juniors as a first-class option with combined or separate carousels; junior auto-publish as an opt-in; retire the brown junior look on cards and the website; new defaults for every club; dismiss unposted cards of retired types at release.
3. **Plan (ce-plan).** Found the Posting Plan already shipped on `main` (#353–#356), so this reshapes it rather than adding a page. Research surfaced that junior scorecards carry no fielder or ball-by-ball data, that per-team junior publishing modes already exist, and that retired kinds are referenced from ~80 files (posted cards must still render).
4. **Document review (five reviewers).** 2 P0, 7 P1, 4 P2/P3 findings. Decisions below.

## Review decisions (2026-10-15)

| Finding                                                              | Decision                                                                                                                                             | Who  |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Live sync never fetches ball-by-ball, so hat-tricks could never fire | Fetch balls on match-day, day-after and catch-up runs (one extra request per match played) — U10, KTD12                                              | Ash  |
| Record, Team of the week, Premiership rows had no engine             | Leave them out of version 2; build their engines (ToW with admin criteria, grade-weighted points, senior + junior) in a separate spec straight after | Ash  |
| Junior publish guard fails open for untraceable drafts               | Fail closed: `juniorTeams` required and every team `auto` — KTD7, U5                                                                                 | team |
| Existing `auto` teams would start publishing to Meta                 | Reset every team to `approval` in release SQL; runbook lists affected clubs — KTD7, U9                                                               | team |
| Privacy applied at draft time only                                   | Re-check private/override status before auto-publish; re-render or hold — KTD8, U5                                                                   | team |
| New junior drafts lacked junior markers                              | Every junior card / combined carousel sets `junior` and `juniorTeams` — KTD6, U2, U4                                                                 | team |
| App migration creating a central table breaks CI                     | Central DDL lives in `central-projector.sql` + `central-schema`; no app migration — KTD4, KTD11                                                      | team |
| Dismissing before republish lets the old build re-draft              | Release SQL runs after republish — KTD11, U9                                                                                                         | team |
| Single default invalid for non-central clubs                         | Default takes the central flag; Match result individual when non-central — KTD1, U1                                                                  | team |
| No feats backfill for already-projected matches                      | Runbook backfill with `playhq-project-central.ts` — U9                                                                                               | team |
| Caught-and-bowled missing from hat-trick list                        | Added — KTD5                                                                                                                                         | team |
| `both` packaging not addressed                                       | Removed in version 2 — KTD2, U1                                                                                                                      | team |
| R15 wording drifted from per-team mode                               | R15/AE6 reworded; preservation note updated                                                                                                          | team |
| Rollback claim overstated                                            | KTD1 now states rollback restores legacy settings (accepted)                                                                                         | team |

## Scope summary

In: Posting Plan v2 (rows, junior grades, packaging, junior runs bar, defaults in code), Big Moment merge with hat-trick and five-catch detection in the central projector, ball-by-ball fetch on played-match syncs, junior rows with combined/separate carousels, fail-closed junior auto-publish via per-team `auto`, retirement of grade-leader / trading-card / countdown entry points, retirement of the brown junior look, release SQL and runbook.

Out (next spec): Record, Team of the week and Premiership engines and rows.

Deferred: adjustable milestone thresholds, drafting caps, junior milestones/debuts/ladders/leaderboards, junior hat-tricks and catches, deleting retired renderers, mobile plaque theme.
