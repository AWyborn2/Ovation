# ADR-005: Hat-tricks and five-catch innings are detected by the central projector from fetched ball-by-ball data

**Status:** Accepted
**Date:** 2026-10-15
**Feature:** social-auto-queue-criteria
**Author:** 10x-Team (Architect + Staff Engineer)

## Context

Big Moment adds hat-trick and five-catch triggers (R3, R4). Senior scorecards in `central` hold innings-level batting, bowling and fielding credits but no ball order. PlayHQ publishes ball-by-ball, and the landing table `playhq.balls` exists, but every live sync plan sets `balls: "none"`, so the table stays empty. `playhq.match_fielding` already carries catches per participant per innings. The app's one sanctioned `central` writer is the PlayHQ projector; the app never reads `playhq.*` directly. CI runs app migrations before the `central` schema exists.

## Decision

1. The sync fetches ball-by-ball for played matches: `HarnessPlan.balls` widens to `"none" | "since"`, and the match-day, day-after and catch-up plans use `"since"`. Weekly and pre-weekend stay `"none"`. One extra request per match played; approved by the owner under the pilot framing.
2. A pure detector in `lib/db/src/playhq-ingest/feats.ts` reads one match's ordered balls and fielding rows and returns feats. Hat-trick: one bowler's deliveries in `seq` order, wides and no-balls dropped, three consecutive wickets whose dismissal credits the bowler (bowled, caught, caught and bowled, lbw, stumped, hit wicket); run outs never count; over boundaries don't break it. Five catches: `total_catches ≥ 5` for one participant in one innings.
3. The projector writes feats to `central.match_feats` (delete-and-reinsert per match, so re-projection is idempotent). The table and grants live in `scripts/sql/central-projector.sql` (production) and `lib/db/src/central-schema` (CI `push-central`), not in an app migration.
4. The app reads feats through `central-queries.ts`; private players are excluded at read time like other achievements. Already-projected matches are backfilled with `scripts/src/playhq-project-central.ts`.

## Alternatives Considered

| Alternative                                         | Pros                    | Cons                                                                                           | Why Not                                        |
| --------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Detect at draft time in the API from `playhq.balls` | No new table            | App reads `playhq.*` directly, breaking the ingest adapter boundary; repeated scans each sweep | Boundary matters for the partner-API migration |
| Defer hat-tricks until partner API access           | No scrape-volume change | Owner wants hat-tricks now                                                                     | Owner chose to fetch                           |
| Create the table in an app migration (`0043`)       | One migration path      | CI fails: migrations run before `central` exists; projector role absent in CI                  | Central DDL already lives with the projector   |
| Derive five catches from `central.fielding` only    | No ball data needed     | `central.fielding` has no innings number; cannot tell five in one innings                      | `match_fielding` is per innings                |

## Consequences

### Positive

- Hat-tricks and catches become real, idempotent central facts any club can read.
- Ball-by-ball lands for every played match, available to later features.

### Negative

- Scrape volume grows by about one request per match played; dumps grow (~400 KB per one-day match before gzip).
- Matches synced before release have no balls until re-synced; hat-tricks start from the first fetch.

### Risks

- PlayHQ dismissal-type text may vary; the detector's mapping is fixture-tested. Unknown types are treated as not bowler-credited (fail safe: no false hat-trick).
- If balls arrive after the projection in the same run, feats appear on the next projection. Ingest ordering is verified in U10.

## Dependencies

- Depends on the PlayHQ sync workflow and the central projector role.
- Production: Ash re-runs `central-projector.sql` before republishing and backfills feats after.
