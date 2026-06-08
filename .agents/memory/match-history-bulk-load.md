---
name: Match history bulk load
description: Loading the master DB's PlayHQ-era match history into app match tables, branding, and the gappy-master reconciliation decision.
---

# Match history bulk load (PlayHQ era)

Bulk-loads the master DB's complete per-match history into `matches` /
`match_player_lines` / `match_opposition_lines`. Loader:
`scripts/src/load-matches.ts` (preview default, `-- --commit` to apply),
running `scripts/sql/matches-etl.sql`. Idempotent — reversal phase keys on
`source_key IS NOT NULL`.

## Master `career_stats` is gappy — match scorecards win (Option A)
**Rule:** The master export's career/season aggregates are hand-kept and have
documented holes (`stats_to` shows "+gap 2021/22+2022/23", partial "+PHQ"
seasons). Treat the match scorecards as the authoritative match-era record and
**let match history fill gaps so career/season totals rise** (Option A).

**Why:** User explicitly chose this over capping at the stale master figures.
The ~1,555 extra appearances are HHCC players' own previously-missing games, NOT
opposition contamination (opposition lines have no player_id and never count).

**How to apply:** The ETL peels each match-era (grade,season) out of the
`season=NULL` baseline with a floor (careers never go negative) and records
`baseline_adjustments` for reversal. Don't "fix" rising totals — that's intended.
Validate a load with: per (player,grade), `player_grade_stats.games` must equal
`GREATEST(master career_stats games, summed match-era season games)` — never more
(double-count), never less than master (over-peel). Extra appearances grow when
the dump's match range extends (2003/04–2025/26 → ~2,472 vs the old 2013-only
~1,555); a sudden 5-10× jump means the double-count bug below, not real history.

## A master reload MUST clear `baseline_adjustments` (double-count trap)
**Rule:** `master-etl.sql` wipes and rebuilds the season=NULL baseline from
scratch, so it must also `DELETE FROM baseline_adjustments` (it now does, right
after wiping `player_grade_season_stats`).

**Why:** `baseline_adjustments` record peels taken against the OLD baseline. A
freshly rebuilt full-career baseline has zero outstanding peels by definition, so
the old rows are stale. `matches-etl.sql` step 2a "reverses prior peels" by ADDING
`baseline_adjustments` back onto the baseline; if stale rows survive a master
reload, it adds them on top of the fresh baseline → every previously match-loaded
(player,grade) roughly doubles. Symptom: `staging.base` for a player shows
baseline+matchera (e.g. 294 when the true season=NULL row is 147).

**How to apply:** Always run master-etl BEFORE matches-etl on a full reload, and
never assume idempotency means "safe in any order" — master rebuilds derived data
that matches-etl's reversal depends on.

## Fill-ins (player_id ≥ 90000) — keep in lines, exclude from derivations
**Rule:** Fill-in lines are kept in `match_player_lines` for scorecard display
but have no real player record, so they must be excluded from every stat /
record / milestone derivation.

**Why:** They surfaced as "Fill-in Fill-in" in milestones. The ETL already
excludes them from season-snapshot derivation; the symptom appears wherever a
query iterates ALL match_player_lines.

**How to apply:** Filter `playerId < 90000` in any query over
`match_player_lines` used for stats (milestones.ts already does).

## Opponent branding
`matches.opponent_club_id` → `clubs(id)` (master club ids preserved).
The matches list + detail routes leftJoin clubs and return a nullable
`opponentClub` (logo/colours); ~40% of matches match a club, rest NULL. The
frontend crest components fall back silently to nothing (name always shown).

## Operational gotchas
- **A `-1`/timeout exit from `load-matches --commit` does NOT mean rollback.**
  The ETL runs in `--single-transaction` and commits, THEN the node script runs
  post-ETL verification psql queries; the 120s bash cap can kill the wrapper
  AFTER the commit, during verification. Always check DB state (public.matches,
  pgss, baseline_adjustments) before re-running — it may already be applied. The
  documented validations are re-runnable read-only queries; run them by hand.
- **Applying a corrected master export = full reload, not a surgical per-player
  edit.** A single inflated career (e.g. a typo'd surname row in master
  `career_stats` giving impossible runs) can't be fixed in isolation: current
  match-era season rows came from the OLD dump, so new-master − old-matchera goes
  negative. Run master-etl then matches-etl from the new dump; the GREATEST
  invariant then holds. Expect collateral churn (a new export can drop/add whole
  matches and renumber match ids) — surface it but it's the new authoritative state.
- The `matches-etl.sql` step-7 season aggregation MUST use `DISTINCT ON` staging
  tables + indexes, NOT an O(n²) LATERAL, or the commit never finishes.
- **Perf:** with `DISTINCT ON`, both ETLs run in seconds — BUT only if the dump is
  loaded into `staging` inside a single transaction. `buildStaging` loading the
  dump WITHOUT `psql -1` runs every INSERT in its own autocommit and crawls past
  the 120s cap (the old "run detached via nohup" advice was treating this symptom).
  `nohup`/`setsid` background jobs also get SIGKILLed on tool-shell teardown
  (empty staging, no EXIT) — prefer foreground `psql --single-transaction`.
- The dump carries `hh_batted_first`; matches-etl maps it straight onto
  `matches.hhcc_batted_first`, so bulk matches get innings order for free and
  `backfill-innings-order.ts` is now only for admin uploads (source_key NULL).
- `matches.source_key` is the true match identity (collisions on
  grade/season/round/stage from Mid-Year T20 + Colts/Finals). Two partial
  uniques in `ensure-constraints.ts`: grade/season/round/stage WHERE source_key
  IS NULL (upload path), source_key WHERE NOT NULL (bulk path).
