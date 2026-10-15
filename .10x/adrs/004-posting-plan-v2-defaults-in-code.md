# ADR-004: Posting Plan version 2 with defaults in code and no legacy derivation

**Status:** Accepted
**Date:** 2026-10-15
**Feature:** social-auto-queue-criteria
**Author:** 10x-Team (Architect + Staff Engineer)

## Context

The Posting Plan (ADR-less, plan 2026-10-07-001) ships as a nullable `posting_plan` jsonb whose null case derives a plan from legacy family switches and round-schedule modes, so clubs carried their old settings over. The owner now wants every club reset to a new default table (R13, R20), rows reshaped (Match result, Big Moment; grade leaders gone), junior grades per row, and a junior runs bar. Production schema changes are applied by hand; a data `UPDATE` across clubs is avoidable.

## Decision

- The plan carries `version: 2`. `normalizePostingPlan` returns the code default for any stored value that is not version 2, including null. `derivePostingPlan` and the `legacyGates` branch are removed; every drafting gate reads `resolvePostingPlan`.
- The default is a function of the club's central flag: Match result is a round carousel for a central club and individual cards otherwise, because the round carousel needs association data.
- Rows: results, bigMoments, milestones, debuts, gameDay, teamLists, clubLeaderboards, ladders. Packaging is `individual` or `round`. Rows without an engine are not listed.
- Saving still mirrors the legacy columns (`postingPlanWrite`), so an older build after rollback keeps drafting from the club's last save.

## Alternatives Considered

| Alternative                                                  | Pros                                | Cons                                                                                        | Why Not                                                |
| ------------------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Production `UPDATE` setting every club's plan to the default | Explicit, inspectable               | Hand-run SQL in production; must be re-run for new clubs; still needs code to stop deriving | Code default covers new and existing clubs with no SQL |
| Keep derivation, add the new rows                            | No reset shock                      | Preserves the flood for every existing club; two code paths persist                         | Owner chose new defaults for all                       |
| Keep rows without engines as disabled "coming soon" rows     | Table matches the owner's full list | Misleading switches; reviewers flagged it                                                   | Owner chose real engines in a follow-on spec           |

## Consequences

### Positive

- One drafting code path; the equivalence test and `legacyGates` go away.
- No production settings migration; new clubs get the right default automatically.

### Negative

- A club that had turned match day off sees it on until it edits the row (accepted by owner).
- Rollback to an older build restores legacy settings for clubs that never saved a v2 plan (grade leaders return). Accepted; the release SQL is re-runnable after roll-forward.

### Risks

- A non-central club saved under v1 with round Match result would fail validation on save; `normalizePostingPlan` discards non-v2 input, so this cannot occur.

## Dependencies

- Constrains ADR-005/006 units (U2 gates read only this plan).
- The Record / Team of the week / Premiership spec must add rows here when their engines exist.
