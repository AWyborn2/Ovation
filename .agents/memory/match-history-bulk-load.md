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
`matches.opponent_club_id` → `clubs(id)` (master club ids preserved, #160).
The matches list + detail routes leftJoin clubs and return a nullable
`opponentClub` (logo/colours); ~40% of matches match a club, rest NULL. The
frontend crest components fall back silently to nothing (name always shown).

## Operational gotchas
- The `matches-etl.sql` step-7 season aggregation MUST use `DISTINCT ON` staging
  tables + indexes, NOT an O(n²) LATERAL, or the commit never finishes.
- The commit exceeds the 120s bash cap — run detached via `nohup`.
- `matches.source_key` is the true match identity (67 collisions on
  grade/season/round/stage from Mid-Year T20 + Colts/Finals). Two partial
  uniques in `ensure-constraints.ts`: grade/season/round/stage WHERE source_key
  IS NULL (upload path), source_key WHERE NOT NULL (bulk path).
