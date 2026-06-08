---
name: master export date / source_key regression
description: A newer club master export can drop match_date and change the source_key scheme; how to recover dates from the prior export.
---

# Master export: match_date drop + source_key scheme change

A club master DB export (the `attached_assets/halls_head_cricket_postgres_*.sql` dumps)
can silently change shape between exports. Observed once: the newest dump had
`match_date` = NULL for ALL matches (the column exists, every INSERT value is NULL),
while the immediately prior dump had it populated as free text
(e.g. `"12:30 PM, Saturday, 07 Feb 2026"`).

**Impact:** the Milestones board needs `matches.match_date`, so a date-less load
empties it; the 2025/26 A Grade debutant cap numbering (`add-a-grade-2025-26-debuts`)
falls back from debut-date order to alphabetical-by-surname.

**Why source_key didn't bridge the dates:** the `source_key` scheme ALSO changed
between exports. Older/undated matches kept stable UUID source_keys (these overlap
across dumps), but the dated PlayHQ-era matches in the prior dump used composite
keys like `M_2526_DGR_<hash>` with NO `playhq_match_id`, whereas the new dump keys
the same matches with UUIDs. So dated rows do NOT join on `source_key` or
`playhq_match_id`.

**Recovery that worked (user-approved "carry dates over"):** backfill via a natural
key bridged through the new dump's `staging` schema:
1. Extract `CREATE TABLE matches` + `INSERT INTO matches` from the PRIOR dump (strip
   `REFERENCES clubs(id)`), load into a temp schema with `psql -1` (fast — matches
   table only, ~2k rows).
2. Join prior(raw) → `staging.matches`(raw) on
   `(season, grade, round, opponent_club_id)` — both are RAW dump form (`grade='A'`,
   `season='2025/26'`), so they align before the ETL's grade/season transforms.
3. Restrict to natural-key groups of size 1 in staging for a safe 1-to-1, then map
   `staging.source_key` (UUID, preserved) → `public.matches.source_key` and set
   `match_date` where currently NULL.

Only ~371 of the prior 2102 matches ever had dates (recent seasons only); ~367 mapped
cleanly. Genuinely-new matches stay date-less (unavoidable).

**Re-do the caps AFTER backfilling dates:** `add-a-grade-2025-26-debuts` is idempotent
and SKIPS already-capped players, so it will NOT renumber on its own. To get
debut-date order you must `DELETE FROM cap_register WHERE category='male' AND
cap_number>240` then re-run; only then does it order by parsed date instead of surname.

**The real fix is upstream** — the club's export tooling dropping dates / changing
source_key is the root cause. Don't bake this backfill into the loader; flag the
export regression to the user and recover per-load until the export is fixed.
