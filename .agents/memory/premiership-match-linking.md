---
name: Premiership → Grand Final match linking
description: How premierships are linked to their scorecard match, and the season off-by-one that mislinked them.
---

# Premiership → Grand Final match linking

`GET /api/premierships` derives each premiership's `matchId` at read time (no stored FK)
via the exported pure helper `linkPremiershipMatch(prem, gfByKey, finalsByKey)`, which
finds the `matches` row for the same grade + season.

## Stage labels: "Grand Final" with a "Finals" fallback
- Most competitions label the decider `stage='Grand Final'`, but a few (PPL T20 Cup,
  PCA Colts) label it generically **"Finals"** in the master export.
- The linker fetches BOTH stages and prefers a Grand Final; it only falls back to a
  "Finals"-stage match when the grade+season has **no** Grand Final candidate at all.
  This is a strict no-Grand-Final fallback (a same-season GF always wins).
- **Why:** previously the ETL hardcoded specific `source_key`s to promote "Finals"→
  "Grand Final" (`scripts/sql/matches-etl.sql`), so every new season whose decider
  PlayHQ labels "Finals" silently failed to link until someone added another source_key.
  That override is now removed; the read-time fallback handles it generically.
- Do NOT widen the fallback to "Semi Finals" / "Preliminary Final" / "Qualifying Final"
  — those are not deciders and would mis-link.

## The off-by-one (root cause of mislinks)
- `premierships.year` is the **calendar year of the win** (a March 2024 final → year 2024).
- `matches.season` is the **season start-year** (2023 = 2023/24, whose final is March 2024).
- So for season-ending (Mar) finals, `prem.year = match.season + 1`; for mid-season
  (Dec) T20 finals they coincide (`prem.year = match.season`).
- The old code keyed `prem.year === match.season` directly, so every March premiership
  linked to the **next** season's final (often a loss) or to nothing.

**Why it matters:** a task was filed as a "data gap" claiming A Grade 2024's Pinjarra win
"isn't loaded". It *was* loaded (under season 2023) — it was just mis-keyed to the 2024/25
White Knights *loss*. Verify the season mapping before concluding a final is missing.

## How to apply
- Derive the target season from the premiership's `match_date` (text `YYYY-MM-DD`):
  month ≥ 7 → season = year; else season = year − 1. Fall back to `{year-1, year}` only
  when no date.
- A grade+season can hold **multiple** Grand Finals (cup final + a mid-season T20).
  Disambiguate in order: exact final date → T20-vs-not alignment (premiership
  `competition`/`result` contains "T20") → result = 'Won' (premierships are wins, skip
  for washout/abandoned/shared/tied) → opponent-in-result text → recent date → lowest id.
- Bulk-loaded pre-2023/24 matches have NO `match_date` and store the **competition name in
  the `opponent` column** (e.g. "B Grade: McIntosh Cup"); date/exact-date signals are
  unavailable there, so the T20/Won/result-text signals carry the disambiguation.

## Genuine data gaps (no scorecard ever loaded — not backfilled)
Pre-2003/04 finals (master match history starts 2003/04) and any season whose match
history simply isn't loaded. ~18 of 54 premierships still resolve to `matchId=null`,
mostly older seasons. Not backfilled: a real scorecard needs full batting/bowling/
fielding lines we don't have, and fabricating match rows would corrupt stats. The
premiership honour-board row still shows result/MOM/players; only the tappable scorecard
link is absent. (PPL 2026 GF and Colts 2024 GF, once listed as gaps, now DO link via the
Finals fallback above.)
