-- ONE-OFF LOADER FOR TENANT #1 (Halls Head) ONLY, SEASONS BEFORE 2026/27 ONLY.
-- Runs against a staging schema built by scripts/src/load-juniors-db.ts, inside one
-- transaction. It is safe on the shared multi-tenant database: every write is scoped to
-- tenant 1, to seasons before 2026 (the junior PlayHQ sync owns 2026/27 onward), and to
-- ids below the sync id band (200,000,000+). It refuses to run (RAISE EXCEPTION, whole
-- transaction rolled back) if loading the dump would touch anything outside that scope.
-- Junior PlayHQ sync plan KTD6, KTD8, R12, AE2.

-- juniors-etl.sql — load the staged JUNIORS export (schema juniors_staging)
-- into the app's public junior_* tables.
--
-- Within its scope (tenant 1, seasons before 2026, ids below 200,000,000) the loader
-- REPLACES matches, scorecard lines, rosters, premierships and premiership players on
-- every run; the ETL is idempotent and re-runnable. Participants are never deleted:
-- the dump's participants are UPSERTED for tenant 1 (missing ones inserted, dump-owned
-- fields refreshed). Admin edits survive every run: the senior cross-link, privacy
-- overrides and synced history are never written; admin renames and privacy changes
-- are re-applied from the corrections journal (step 6), merges from the merge map
-- (step 7). Privacy only ever tightens automatically.
--
-- Scope, named once:
--   loader rows = junior_matches / junior_premierships with tenant_id = 1,
--                 id < 200000000 and a season before 2026 (or no season at all),
--                 plus their lines / premiership players.
--   sync rows   = id >= 200000000 (junior_sync_id_seq) — never read for writing,
--                 never written, never deleted.

-- 0. Age-group normaliser. The club's grades are messy across eras
-- ("Under 14", "U14", "Year 9 Boys Peel", "Year 4 South", "Peel Girls League").
-- This canonicalises any such label to a single consistent age-group token
-- (e.g. "U14", "Year 9", "Girls League"). The source dump already carries a
-- mostly-clean age_group, so we PREFER it and fall back to deriving from the raw
-- grade text; owning the canonicalisation here keeps future dumps consistent.
CREATE OR REPLACE FUNCTION pg_temp.jr_norm_age(raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  WITH s AS (SELECT lower(coalesce(raw, '')) AS r)
  SELECT CASE
    WHEN (SELECT r FROM s) ~ 'girls? league' THEN 'Girls League'
    WHEN substring((SELECT r FROM s) from 'under\s*0*([0-9]+)') IS NOT NULL
      THEN 'U' || substring((SELECT r FROM s) from 'under\s*0*([0-9]+)')
    WHEN substring((SELECT r FROM s) from '\mu\s*0*([0-9]+)') IS NOT NULL
      THEN 'U' || substring((SELECT r FROM s) from '\mu\s*0*([0-9]+)')
    WHEN substring((SELECT r FROM s) from 'year\s*([0-9]+(?:-[0-9]+)?)') IS NOT NULL
      THEN 'Year ' || substring((SELECT r FROM s) from 'year\s*([0-9]+(?:-[0-9]+)?)')
    ELSE NULL
  END;
$fn$;

-- 0b. School-year BAND mapper. By club decision the app now groups juniors by a
-- single unified school-year band that merges the legacy Under-age naming with
-- the newer year naming (confirmed against the club's 2024/25 team↔grade pairings):
--   U10→Year 4, U11→Year 5, U12→Year 6, U13→Year 7, U14→Year 8, U15→Year 9,
--   and U16 + U17 → Year 10-11. Year* / Girls League labels pass through unchanged.
-- The source dump already carries a clean `age_band`, so the ETL PREFERS it and
-- only uses this mapper as a fallback (deriving from the raw age_group/grade).
CREATE OR REPLACE FUNCTION pg_temp.jr_band(raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE pg_temp.jr_norm_age(raw)
    WHEN 'U10' THEN 'Year 4'
    WHEN 'U11' THEN 'Year 5'
    WHEN 'U12' THEN 'Year 6'
    WHEN 'U13' THEN 'Year 7'
    WHEN 'U14' THEN 'Year 8'
    WHEN 'U15' THEN 'Year 9'
    WHEN 'U16' THEN 'Year 10-11'
    WHEN 'U17' THEN 'Year 10-11'
    ELSE pg_temp.jr_norm_age(raw)  -- 'Year N', 'Year 10-11', 'Girls League' pass through
  END;
$fn$;

-- 0c. Whether a season belongs to the loader: before 2026/27 (JUNIOR_SYNC_FIRST_SEASON
-- = 2026), or unknown. The start year is the stored season_start_year when there is one,
-- else the leading year of a "2024/25" season string.
CREATE OR REPLACE FUNCTION pg_temp.jr_pre_sync(season text, season_start_year int)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $fn$
  SELECT coalesce(season_start_year, NULLIF(substring(season from '^[0-9]{4}'), '')::int) IS NULL
      OR coalesce(season_start_year, NULLIF(substring(season from '^[0-9]{4}'), '')::int) < 2026;
$fn$;

-- 0d. The loader's scope: what this run may load (_js_*, from the dump) and what it may
-- replace (_jl_*, already in the database). Every write below goes through these or
-- names tenant 1 directly.
CREATE TEMP TABLE _js_matches ON COMMIT DROP AS
SELECT * FROM juniors_staging.matches
WHERE pg_temp.jr_pre_sync(season, NULL);

CREATE TEMP TABLE _js_premierships ON COMMIT DROP AS
SELECT * FROM juniors_staging.junior_premierships
WHERE pg_temp.jr_pre_sync(season, NULL);

CREATE TEMP TABLE _jl_matches ON COMMIT DROP AS
SELECT id FROM public.junior_matches
WHERE tenant_id = 1 AND id < 200000000 AND pg_temp.jr_pre_sync(season, season_start_year);

CREATE TEMP TABLE _jl_premierships ON COMMIT DROP AS
SELECT id FROM public.junior_premierships
WHERE tenant_id = 1 AND id < 200000000 AND pg_temp.jr_pre_sync(season, NULL);

-- 0e. Refuse to run when loading this dump would reach outside the scope. Each check
-- raises an exception, so the single transaction rolls back and nothing changes.
DO $guard$
DECLARE
  n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = 1) THEN
    RAISE EXCEPTION 'juniors loader: tenant 1 does not exist';
  END IF;

  -- Dump ids inside the sync id band (or, for lines, the admin-line band 100,000,000+).
  SELECT count(*) INTO n FROM _js_matches WHERE match_id >= 200000000;
  IF n > 0 THEN
    RAISE EXCEPTION 'juniors loader: % dump match id(s) are in the sync id band (>= 200000000)', n;
  END IF;
  SELECT count(*) INTO n FROM _js_premierships WHERE id >= 200000000;
  IF n > 0 THEN
    RAISE EXCEPTION 'juniors loader: % dump premiership id(s) are in the sync id band', n;
  END IF;
  SELECT count(*) INTO n FROM (
    SELECT id FROM juniors_staging.match_batting WHERE match_id IN (SELECT match_id FROM _js_matches)
    UNION ALL SELECT id FROM juniors_staging.match_bowling WHERE match_id IN (SELECT match_id FROM _js_matches)
    UNION ALL SELECT id FROM juniors_staging.match_rosters WHERE match_id IN (SELECT match_id FROM _js_matches)
    UNION ALL SELECT id FROM juniors_staging.junior_premiership_players
      WHERE premiership_id IN (SELECT id FROM _js_premierships)
  ) d WHERE d.id >= 100000000;
  IF n > 0 THEN
    RAISE EXCEPTION 'juniors loader: % dump line id(s) are in the admin or sync id bands (>= 100000000)', n;
  END IF;

  -- Dump ids already used by a row the loader does not own (another club, a synced
  -- season, the sync band): loading would collide with or overwrite that row.
  SELECT count(*) INTO n FROM _js_matches s
  JOIN public.junior_matches m ON m.id = s.match_id
  WHERE m.id NOT IN (SELECT id FROM _jl_matches);
  IF n > 0 THEN
    RAISE EXCEPTION 'juniors loader: % dump match id(s) already belong to another club or a synced season', n;
  END IF;
  SELECT count(*) INTO n FROM _js_premierships s
  JOIN public.junior_premierships p ON p.id = s.id
  WHERE p.id NOT IN (SELECT id FROM _jl_premierships);
  IF n > 0 THEN
    RAISE EXCEPTION 'juniors loader: % dump premiership id(s) already belong to another club or a synced season', n;
  END IF;
  SELECT count(*) INTO n FROM (
    SELECT t.match_id FROM juniors_staging.match_batting s
      JOIN public.junior_match_batting t ON t.id = s.id
      WHERE s.match_id IN (SELECT match_id FROM _js_matches)
    UNION ALL SELECT t.match_id FROM juniors_staging.match_bowling s
      JOIN public.junior_match_bowling t ON t.id = s.id
      WHERE s.match_id IN (SELECT match_id FROM _js_matches)
    UNION ALL SELECT t.match_id FROM juniors_staging.match_rosters s
      JOIN public.junior_match_rosters t ON t.id = s.id
      WHERE s.match_id IN (SELECT match_id FROM _js_matches)
  ) d WHERE d.match_id NOT IN (SELECT id FROM _jl_matches);
  IF n > 0 THEN
    RAISE EXCEPTION 'juniors loader: % dump line id(s) already belong to another club''s or a synced match', n;
  END IF;
  SELECT count(*) INTO n FROM juniors_staging.junior_premiership_players s
  JOIN public.junior_premiership_players t ON t.id = s.id
  WHERE s.premiership_id IN (SELECT id FROM _js_premierships)
    AND t.premiership_id NOT IN (SELECT id FROM _jl_premierships);
  IF n > 0 THEN
    RAISE EXCEPTION 'juniors loader: % dump premiership player id(s) already belong to another club or a synced season', n;
  END IF;

  -- Rows the replace would delete that the sync made.
  SELECT count(*) INTO n FROM (
    SELECT id FROM public.junior_match_batting WHERE match_id IN (SELECT id FROM _jl_matches)
    UNION ALL SELECT id FROM public.junior_match_bowling WHERE match_id IN (SELECT id FROM _jl_matches)
    UNION ALL SELECT id FROM public.junior_match_rosters WHERE match_id IN (SELECT id FROM _jl_matches)
  ) d WHERE d.id >= 200000000;
  IF n > 0 THEN
    RAISE EXCEPTION 'juniors loader: % synced line(s) (id >= 200000000) sit on loader matches; refusing to delete them', n;
  END IF;

  SELECT count(*) INTO n FROM juniors_staging.matches
  WHERE match_id NOT IN (SELECT match_id FROM _js_matches);
  IF n > 0 THEN
    RAISE NOTICE 'juniors loader: skipped % dump match(es) from 2026/27 onward (the junior PlayHQ sync owns those seasons)', n;
  END IF;
END $guard$;

-- 0f. Participants whose stored fields the upsert must leave alone.
-- Synced history: the participant has lines on a synced match (id >= 200000000) or is
-- named on a junior team list — the sync owns their name and stored metadata.
CREATE TEMP TABLE _jl_synced ON COMMIT DROP AS
SELECT DISTINCT p.participant_id
FROM public.junior_participants p
WHERE p.tenant_id = 1 AND (
  EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.tenant_id = 1 AND m.id >= 200000000 AND (
      EXISTS (SELECT 1 FROM public.junior_match_batting b
              WHERE b.match_id = m.id AND b.participant_id = p.participant_id)
      OR EXISTS (SELECT 1 FROM public.junior_match_bowling w
                 WHERE w.match_id = m.id AND w.participant_id = p.participant_id)
      OR EXISTS (SELECT 1 FROM public.junior_match_rosters r
                 WHERE r.match_id = m.id AND r.participant_id = p.participant_id)
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.junior_team_lists tl
    CROSS JOIN LATERAL jsonb_array_elements(tl.players) pl
    WHERE tl.tenant_id = 1 AND lower(pl->>'participantId') = lower(p.participant_id)
  )
);

-- Admin renames: the journal holds a display_name correction for the participant.
-- (Step 6 re-applies it as well; leaving the name alone here means a rename is never
-- even transiently replaced by the dump's.)
CREATE TEMP TABLE _jl_keep_name ON COMMIT DROP AS
SELECT participant_id FROM _jl_synced
UNION
SELECT c.target_id
FROM public.junior_stat_corrections c
WHERE c.tenant_id = 1 AND c.target_table = 'junior_participants'
  AND c.op = 'update' AND c.patch ? 'display_name';

-- 1. Snapshot admin-entered premiership extras (man-of-the-match + captain
-- flags). These are NOT in the PlayHQ dump — admins add them by hand — so they
-- must survive a reload. Premiership and player ids are stable across reloads
-- (the dump carries explicit ids), so we re-key by id.
CREATE TEMP TABLE _jp_mom ON COMMIT DROP AS
SELECT id, mom
FROM public.junior_premierships
WHERE mom IS NOT NULL AND id IN (SELECT id FROM _jl_premierships);

CREATE TEMP TABLE _jp_captains ON COMMIT DROP AS
SELECT id
FROM public.junior_premiership_players
WHERE is_captain AND premiership_id IN (SELECT id FROM _jl_premierships);

-- 2. Clear the loader's rows in FK-safe order (children before parents). Participants
-- are NOT cleared (see 3b), so the senior cross-link and privacy overrides persist
-- with their rows.
DELETE FROM public.junior_premiership_players
WHERE premiership_id IN (SELECT id FROM _jl_premierships);
DELETE FROM public.junior_premierships WHERE id IN (SELECT id FROM _jl_premierships);
DELETE FROM public.junior_match_batting WHERE match_id IN (SELECT id FROM _jl_matches);
DELETE FROM public.junior_match_bowling WHERE match_id IN (SELECT id FROM _jl_matches);
DELETE FROM public.junior_match_rosters WHERE match_id IN (SELECT id FROM _jl_matches);
DELETE FROM public.junior_matches WHERE id IN (SELECT id FROM _jl_matches);

-- 3. Load parents then children (tenant 1, seasons before 2026 only).
INSERT INTO public.junior_matches (
  id, tenant_id, playhq_match_id, season, season_start_year, grade, age_group, age_group_raw,
  team_name, competition, association, round, match_date, venue, venue_oval,
  venue_address, venue_suburb, status, team1, team1_score, team2,
  team2_score, hh_team_id, hh_result, winner, toss_winner, hh_batted_first,
  opponent_name
)
SELECT
  match_id, 1, playhq_match_id, season,
  -- Parse the leading year out of a "2024/25" season string for reliable
  -- newest-first ordering (NULL when the season text has no 4-digit prefix).
  NULLIF(substring(season from '^[0-9]{4}'), '')::int AS season_start_year,
  grade,
  -- age_group GROUPING token = unified school-year band: prefer the dump's clean
  -- age_band, else map the legacy age_group/grade via jr_band, else fall back to
  -- the normalised raw label so nothing is ever dropped.
  COALESCE(
    NULLIF(trim(age_band), ''),
    pg_temp.jr_band(age_group),
    pg_temp.jr_band(grade),
    NULLIF(pg_temp.jr_norm_age(age_group), ''),
    NULLIF(trim(age_group), ''),
    NULLIF(trim(grade), '')
  ) AS age_group,
  -- Original raw label kept for traceability (normalised but NOT band-merged).
  COALESCE(
    NULLIF(pg_temp.jr_norm_age(age_group), ''),
    NULLIF(trim(age_group), ''),
    NULLIF(pg_temp.jr_norm_age(grade), ''),
    NULLIF(trim(grade), '')
  ) AS age_group_raw,
  team_name, competition, association, round, match_date, venue, venue_oval,
  venue_address, venue_suburb, status, team1, team1_score,
  team2, team2_score, hh_team_id, hh_result, winner, toss_winner, hh_batted_first,
  opponent_name
FROM _js_matches;

-- 3b. Participants: upsert, never delete. A missing participant is inserted; an
-- existing one gets the dump's fields refreshed EXCEPT
--   - display_name when the admin renamed it or the sync owns it (_jl_keep_name);
--   - the stored metadata when the sync owns it (recomputed in 6d instead);
--   - is_private, which only tightens (private in the dump, or already private);
--   - privacy_override*, senior_player_id: never written by the loader.
INSERT INTO public.junior_participants AS jp (
  tenant_id, participant_id, display_name, is_private, scorecard_lines, roster_appearances,
  first_season, last_season, teams
)
SELECT
  1, participant_id, display_name, COALESCE(is_private, FALSE), scorecard_lines,
  roster_appearances, first_season, last_season, teams
FROM juniors_staging.junior_participants
ON CONFLICT (tenant_id, participant_id) DO UPDATE SET
  display_name = CASE WHEN jp.participant_id IN (SELECT participant_id FROM _jl_keep_name)
    THEN jp.display_name ELSE EXCLUDED.display_name END,
  is_private = jp.is_private OR EXCLUDED.is_private,
  scorecard_lines = CASE WHEN jp.participant_id IN (SELECT participant_id FROM _jl_synced)
    THEN jp.scorecard_lines ELSE EXCLUDED.scorecard_lines END,
  roster_appearances = CASE WHEN jp.participant_id IN (SELECT participant_id FROM _jl_synced)
    THEN jp.roster_appearances ELSE EXCLUDED.roster_appearances END,
  first_season = CASE WHEN jp.participant_id IN (SELECT participant_id FROM _jl_synced)
    THEN jp.first_season ELSE EXCLUDED.first_season END,
  last_season = CASE WHEN jp.participant_id IN (SELECT participant_id FROM _jl_synced)
    THEN jp.last_season ELSE EXCLUDED.last_season END,
  teams = CASE WHEN jp.participant_id IN (SELECT participant_id FROM _jl_synced)
    THEN jp.teams ELSE EXCLUDED.teams END
WHERE jp.tenant_id = 1;

INSERT INTO public.junior_match_batting (
  id, match_id, innings, batting_team, is_halls_head, bat_order, participant_id,
  player_name, runs, balls, fours, sixes, strike_rate, dismissal
)
SELECT
  id, match_id, innings, batting_team, COALESCE(is_halls_head, FALSE), bat_order,
  participant_id, player_name, runs, balls, fours, sixes, strike_rate, dismissal
FROM juniors_staging.match_batting
WHERE match_id IN (SELECT match_id FROM _js_matches);

INSERT INTO public.junior_match_bowling (
  id, match_id, innings, bowling_team, is_halls_head, participant_id, player_name,
  overs, maidens, runs, wickets, economy, wides, no_balls
)
SELECT
  id, match_id, innings, bowling_team, COALESCE(is_halls_head, FALSE), participant_id,
  player_name, overs, maidens, runs, wickets, economy, wides, no_balls
FROM juniors_staging.match_bowling
WHERE match_id IN (SELECT match_id FROM _js_matches);

INSERT INTO public.junior_match_rosters (
  id, match_id, team_name, is_halls_head, participant_id, player_name
)
SELECT
  id, match_id, team_name, COALESCE(is_halls_head, FALSE), participant_id, player_name
FROM juniors_staging.match_rosters
WHERE match_id IN (SELECT match_id FROM _js_matches);

INSERT INTO public.junior_premierships (
  id, tenant_id, season, age_group, age_group_raw, team_name, competition, association,
  match_date, venue, venue_oval, opponent, hh_score,
  opp_score, result_text, match_id, playhq_match_id
)
SELECT
  id, 1, season,
  -- age_group = unified school-year band (prefer dump age_band, see jr_band).
  COALESCE(
    NULLIF(trim(age_band), ''),
    pg_temp.jr_band(age_group),
    NULLIF(pg_temp.jr_norm_age(age_group), ''),
    NULLIF(trim(age_group), '')
  ) AS age_group,
  COALESCE(
    NULLIF(pg_temp.jr_norm_age(age_group), ''),
    NULLIF(trim(age_group), '')
  ) AS age_group_raw,
  team_name, competition, association, match_date, venue, venue_oval, opponent,
  hh_score, opp_score, result_text, match_id, playhq_match_id
FROM _js_premierships;

INSERT INTO public.junior_premiership_players (
  id, premiership_id, participant_id, player_name
)
SELECT
  id, premiership_id, participant_id, player_name
FROM juniors_staging.junior_premiership_players
WHERE premiership_id IN (SELECT id FROM _js_premierships);

-- 4. (Removed) The senior cross-link used to be snapshotted and re-applied here
-- because participants were deleted and re-inserted. They are now upserted and the
-- loader never writes senior_player_id, so every link stays on its row.

-- 4b. Re-apply preserved admin-entered premiership extras (man-of-the-match +
-- captain flags) onto the freshly loaded rows, matching by stable dump id.
UPDATE public.junior_premierships pr
SET mom = m.mom
FROM _jp_mom m
WHERE m.id = pr.id AND pr.tenant_id = 1 AND pr.id IN (SELECT id FROM _js_premierships);

UPDATE public.junior_premiership_players pl
SET is_captain = TRUE
FROM _jp_captains c
WHERE c.id = pl.id AND pl.premiership_id IN (SELECT id FROM _js_premierships);

-- 5. Link each junior match's opposition to a club in the shared register so the
-- scorecard + match list can show the opponent's crest and colours. The clubs
-- register is the neutral, area-wide reference table populated by master-etl —
-- reading it here does NOT blend junior and senior STAT data. Most metro junior
-- opponents are absent from the Peel-focused register, so opponent_club_id stays
-- NULL for them and renderers fall back gracefully.
--
-- Matching is deliberately CONSERVATIVE to avoid false crests: both the club
-- name and the messy free-text opponent name are normalised (lowercased,
-- parentheticals/punctuation/age tokens/colours/gender/club-suffix words
-- stripped) and a match requires the normalised opponent to EQUAL the normalised
-- club or start with it followed by a space. Team nicknames (e.g. "Hornets",
-- "Swans") are intentionally NOT stripped so "Rockingham Rams" never collapses
-- onto "Rockingham Hornets". When several clubs match, the longest club token
-- wins (so "South Mandurah …" links to South Mandurah, not Mandurah).
-- NOTE: master-etl MUST run before juniors-etl for public.clubs to be populated.
-- Only the matches this run loaded are linked.
CREATE OR REPLACE FUNCTION pg_temp.jr_norm_club(raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  WITH s0 AS (SELECT lower(coalesce(raw,'')) AS r),
  s1 AS (SELECT regexp_replace((SELECT r FROM s0), '\(.*?\)', ' ', 'g') AS r),
  s2 AS (SELECT regexp_replace((SELECT r FROM s1), '[^a-z0-9 ]', ' ', 'g') AS r),
  s3 AS (SELECT regexp_replace((SELECT r FROM s2), '\m(under\s*[0-9]+|u[0-9]+|year\s*[0-9]+(-[0-9]+)?|yr\s*[0-9]+|y[0-9]+)\M', ' ', 'g') AS r),
  s4 AS (SELECT regexp_replace((SELECT r FROM s3),
    '\m(cricket|club|clubs|junior|juniors|jcc|cc|inc|association|associations|red|blue|blues|white|whites|black|blacks|green|greens|gold|golds|grey|gray|maroon|navy|yellow|orange|purple|silver|brown|browns|boys|boy|girls|girl|mens|men|womens|women)\M', ' ', 'g') AS r)
  SELECT trim(regexp_replace((SELECT r FROM s4), '\s+', ' ', 'g'));
$fn$;

UPDATE public.junior_matches jm
SET opponent_club_id = best.club_id
FROM (
  SELECT m.match_id, m.club_id FROM (
    SELECT jm2.id AS match_id, cn.id AS club_id,
      row_number() OVER (PARTITION BY jm2.id ORDER BY length(cn.norm) DESC) rn
    FROM public.junior_matches jm2
    JOIN (
      SELECT id, pg_temp.jr_norm_club(name) AS norm FROM public.clubs
      WHERE pg_temp.jr_norm_club(name) <> ''
    ) cn
      ON pg_temp.jr_norm_club(jm2.opponent_name) = cn.norm
      OR pg_temp.jr_norm_club(jm2.opponent_name) LIKE cn.norm || ' %'
    WHERE jm2.opponent_name IS NOT NULL
      AND jm2.id IN (SELECT match_id FROM _js_matches)
  ) m WHERE m.rn = 1
) best
WHERE jm.id = best.match_id AND jm.tenant_id = 1 AND jm.id IN (SELECT match_id FROM _js_matches);

-- 6. Re-apply admin stat corrections (junior_stat_corrections). The journal is
-- APP-OWNED: this ETL reads it but NEVER deletes it — it is the permanent
-- record of admin edits to the read-only dump data (and the API's audit
-- trail). Ordering: re-create admin-added rows first (6a), then apply merged
-- update patches (6b: per-column last-write-wins by journal id), then apply
-- deletions (6c). Every pass is guarded by the stored playhq_match_id anchor:
-- if a future dump renumbers row ids, a mismatched correction is SKIPPED (the
-- loader reports skips loudly), never applied to the wrong row. Only tenant 1's
-- journal is read, and only tenant 1's rows below the sync id band are written
-- (the sync re-applies corrections to its own matches itself).

-- 6a. Re-create admin-added rows (op='insert'; patch = the full row). Admin
-- ids live at 100,000,000+ so they can never collide with dump ids.
INSERT INTO public.junior_match_batting (
  id, match_id, innings, batting_team, is_halls_head, bat_order,
  participant_id, player_name, runs, balls, fours, sixes, strike_rate, dismissal
)
SELECT
  (c.patch->>'id')::int, (c.patch->>'match_id')::int,
  (c.patch->>'innings')::int, c.patch->>'batting_team',
  COALESCE((c.patch->>'is_halls_head')::boolean, TRUE),
  (c.patch->>'bat_order')::int, c.patch->>'participant_id',
  c.patch->>'player_name', (c.patch->>'runs')::int, (c.patch->>'balls')::int,
  (c.patch->>'fours')::int, (c.patch->>'sixes')::int,
  (c.patch->>'strike_rate')::real, c.patch->>'dismissal'
FROM public.junior_stat_corrections c
WHERE c.tenant_id = 1 AND c.target_table = 'junior_match_batting' AND c.op = 'insert'
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = (c.patch->>'match_id')::int
      AND m.tenant_id = 1 AND m.id < 200000000
      AND (c.playhq_match_id IS NULL OR m.playhq_match_id = c.playhq_match_id)
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.junior_match_bowling (
  id, match_id, innings, bowling_team, is_halls_head, participant_id,
  player_name, overs, maidens, runs, wickets, economy, wides, no_balls
)
SELECT
  (c.patch->>'id')::int, (c.patch->>'match_id')::int,
  (c.patch->>'innings')::int, c.patch->>'bowling_team',
  COALESCE((c.patch->>'is_halls_head')::boolean, TRUE),
  c.patch->>'participant_id', c.patch->>'player_name',
  (c.patch->>'overs')::real, (c.patch->>'maidens')::int,
  (c.patch->>'runs')::int, (c.patch->>'wickets')::int,
  (c.patch->>'economy')::real, (c.patch->>'wides')::int,
  (c.patch->>'no_balls')::int
FROM public.junior_stat_corrections c
WHERE c.tenant_id = 1 AND c.target_table = 'junior_match_bowling' AND c.op = 'insert'
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = (c.patch->>'match_id')::int
      AND m.tenant_id = 1 AND m.id < 200000000
      AND (c.playhq_match_id IS NULL OR m.playhq_match_id = c.playhq_match_id)
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.junior_match_rosters (
  id, match_id, team_name, is_halls_head, participant_id, player_name
)
SELECT
  (c.patch->>'id')::int, (c.patch->>'match_id')::int, c.patch->>'team_name',
  COALESCE((c.patch->>'is_halls_head')::boolean, TRUE),
  c.patch->>'participant_id', c.patch->>'player_name'
FROM public.junior_stat_corrections c
WHERE c.tenant_id = 1 AND c.target_table = 'junior_match_rosters' AND c.op = 'insert'
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = (c.patch->>'match_id')::int
      AND m.tenant_id = 1 AND m.id < 200000000
      AND (c.playhq_match_id IS NULL OR m.playhq_match_id = c.playhq_match_id)
  )
ON CONFLICT (id) DO NOTHING;

-- 6b. Merged update patches. Per (target_table, target_id): later journal
-- rows win per column (jsonb_object_agg keeps the last value for a duplicate
-- key, and the aggregate is ordered by journal id).
CREATE TEMP TABLE _jsc_upd ON COMMIT DROP AS
SELECT
  c.target_table,
  c.target_id,
  jsonb_object_agg(kv.key, kv.value ORDER BY c.id) AS eff,
  max(c.playhq_match_id) AS playhq_match_id
FROM public.junior_stat_corrections c
CROSS JOIN LATERAL jsonb_each(c.patch) kv
WHERE c.tenant_id = 1 AND c.op = 'update' AND c.patch IS NOT NULL
GROUP BY c.target_table, c.target_id;

UPDATE public.junior_matches t
SET
  team1_score     = CASE WHEN u.eff ? 'team1_score'     THEN u.eff->>'team1_score'                ELSE t.team1_score END,
  team2_score     = CASE WHEN u.eff ? 'team2_score'     THEN u.eff->>'team2_score'                ELSE t.team2_score END,
  hh_result       = CASE WHEN u.eff ? 'hh_result'       THEN u.eff->>'hh_result'                  ELSE t.hh_result END,
  winner          = CASE WHEN u.eff ? 'winner'          THEN u.eff->>'winner'                     ELSE t.winner END,
  toss_winner     = CASE WHEN u.eff ? 'toss_winner'     THEN u.eff->>'toss_winner'                ELSE t.toss_winner END,
  hh_batted_first = CASE WHEN u.eff ? 'hh_batted_first' THEN (u.eff->>'hh_batted_first')::boolean ELSE t.hh_batted_first END,
  status          = CASE WHEN u.eff ? 'status'          THEN u.eff->>'status'                     ELSE t.status END,
  match_date      = CASE WHEN u.eff ? 'match_date'      THEN u.eff->>'match_date'                 ELSE t.match_date END,
  round           = CASE WHEN u.eff ? 'round'           THEN u.eff->>'round'                      ELSE t.round END,
  venue           = CASE WHEN u.eff ? 'venue'           THEN u.eff->>'venue'                      ELSE t.venue END
FROM _jsc_upd u
WHERE u.target_table = 'junior_matches'
  AND t.id = u.target_id::int
  AND t.tenant_id = 1 AND t.id < 200000000
  AND (u.playhq_match_id IS NULL OR t.playhq_match_id = u.playhq_match_id);

UPDATE public.junior_match_batting t
SET
  runs           = CASE WHEN u.eff ? 'runs'           THEN (u.eff->>'runs')::int        ELSE t.runs END,
  balls          = CASE WHEN u.eff ? 'balls'          THEN (u.eff->>'balls')::int       ELSE t.balls END,
  fours          = CASE WHEN u.eff ? 'fours'          THEN (u.eff->>'fours')::int       ELSE t.fours END,
  sixes          = CASE WHEN u.eff ? 'sixes'          THEN (u.eff->>'sixes')::int       ELSE t.sixes END,
  strike_rate    = CASE WHEN u.eff ? 'strike_rate'    THEN (u.eff->>'strike_rate')::real ELSE t.strike_rate END,
  dismissal      = CASE WHEN u.eff ? 'dismissal'      THEN u.eff->>'dismissal'          ELSE t.dismissal END,
  bat_order      = CASE WHEN u.eff ? 'bat_order'      THEN (u.eff->>'bat_order')::int   ELSE t.bat_order END,
  participant_id = CASE WHEN u.eff ? 'participant_id' THEN u.eff->>'participant_id'     ELSE t.participant_id END,
  player_name    = CASE WHEN u.eff ? 'player_name'    THEN u.eff->>'player_name'        ELSE t.player_name END
FROM _jsc_upd u
WHERE u.target_table = 'junior_match_batting'
  AND t.id = u.target_id::int
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = t.match_id AND m.tenant_id = 1 AND m.id < 200000000
      AND (u.playhq_match_id IS NULL OR m.playhq_match_id = u.playhq_match_id)
  );

UPDATE public.junior_match_bowling t
SET
  overs          = CASE WHEN u.eff ? 'overs'          THEN (u.eff->>'overs')::real      ELSE t.overs END,
  maidens        = CASE WHEN u.eff ? 'maidens'        THEN (u.eff->>'maidens')::int     ELSE t.maidens END,
  runs           = CASE WHEN u.eff ? 'runs'           THEN (u.eff->>'runs')::int        ELSE t.runs END,
  wickets        = CASE WHEN u.eff ? 'wickets'        THEN (u.eff->>'wickets')::int     ELSE t.wickets END,
  economy        = CASE WHEN u.eff ? 'economy'        THEN (u.eff->>'economy')::real    ELSE t.economy END,
  wides          = CASE WHEN u.eff ? 'wides'          THEN (u.eff->>'wides')::int       ELSE t.wides END,
  no_balls       = CASE WHEN u.eff ? 'no_balls'       THEN (u.eff->>'no_balls')::int    ELSE t.no_balls END,
  participant_id = CASE WHEN u.eff ? 'participant_id' THEN u.eff->>'participant_id'     ELSE t.participant_id END,
  player_name    = CASE WHEN u.eff ? 'player_name'    THEN u.eff->>'player_name'        ELSE t.player_name END
FROM _jsc_upd u
WHERE u.target_table = 'junior_match_bowling'
  AND t.id = u.target_id::int
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = t.match_id AND m.tenant_id = 1 AND m.id < 200000000
      AND (u.playhq_match_id IS NULL OR m.playhq_match_id = u.playhq_match_id)
  );

UPDATE public.junior_match_rosters t
SET
  participant_id = CASE WHEN u.eff ? 'participant_id' THEN u.eff->>'participant_id' ELSE t.participant_id END,
  player_name    = CASE WHEN u.eff ? 'player_name'    THEN u.eff->>'player_name'    ELSE t.player_name END
FROM _jsc_upd u
WHERE u.target_table = 'junior_match_rosters'
  AND t.id = u.target_id::int
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = t.match_id AND m.tenant_id = 1 AND m.id < 200000000
      AND (u.playhq_match_id IS NULL OR m.playhq_match_id = u.playhq_match_id)
  );

-- Participants re-key by (tenant 1, PlayHQ GUID) — no anchor needed.
UPDATE public.junior_participants t
SET
  display_name = CASE WHEN u.eff ? 'display_name' THEN u.eff->>'display_name'          ELSE t.display_name END,
  is_private   = CASE WHEN u.eff ? 'is_private'   THEN (u.eff->>'is_private')::boolean ELSE t.is_private END
FROM _jsc_upd u
WHERE u.target_table = 'junior_participants'
  AND t.tenant_id = 1
  AND t.participant_id = u.target_id;

-- A corrected display name flows onto the participant's HH scorecard/roster
-- lines on tenant 1's loader matches, matching what the admin API does at edit time.
UPDATE public.junior_match_batting b
SET player_name = p.display_name
FROM _jsc_upd u
JOIN public.junior_participants p ON p.participant_id = u.target_id AND p.tenant_id = 1
WHERE u.target_table = 'junior_participants' AND u.eff ? 'display_name'
  AND b.participant_id = p.participant_id AND b.is_halls_head
  AND b.match_id IN (SELECT id FROM public.junior_matches WHERE tenant_id = 1 AND id < 200000000);

UPDATE public.junior_match_bowling w
SET player_name = p.display_name
FROM _jsc_upd u
JOIN public.junior_participants p ON p.participant_id = u.target_id AND p.tenant_id = 1
WHERE u.target_table = 'junior_participants' AND u.eff ? 'display_name'
  AND w.participant_id = p.participant_id AND w.is_halls_head
  AND w.match_id IN (SELECT id FROM public.junior_matches WHERE tenant_id = 1 AND id < 200000000);

UPDATE public.junior_match_rosters r
SET player_name = p.display_name
FROM _jsc_upd u
JOIN public.junior_participants p ON p.participant_id = u.target_id AND p.tenant_id = 1
WHERE u.target_table = 'junior_participants' AND u.eff ? 'display_name'
  AND r.participant_id = p.participant_id AND r.is_halls_head
  AND r.match_id IN (SELECT id FROM public.junior_matches WHERE tenant_id = 1 AND id < 200000000);

-- 6c. Re-apply deletions last (a deleted admin-created row was re-inserted in
-- 6a and is removed again here — net correct). Anchored like the updates.
DELETE FROM public.junior_match_batting t
USING public.junior_stat_corrections c
WHERE c.tenant_id = 1 AND c.target_table = 'junior_match_batting' AND c.op = 'delete'
  AND t.id = c.target_id::int
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = t.match_id AND m.tenant_id = 1 AND m.id < 200000000
      AND (c.playhq_match_id IS NULL OR m.playhq_match_id = c.playhq_match_id)
  );

DELETE FROM public.junior_match_bowling t
USING public.junior_stat_corrections c
WHERE c.tenant_id = 1 AND c.target_table = 'junior_match_bowling' AND c.op = 'delete'
  AND t.id = c.target_id::int
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = t.match_id AND m.tenant_id = 1 AND m.id < 200000000
      AND (c.playhq_match_id IS NULL OR m.playhq_match_id = c.playhq_match_id)
  );

DELETE FROM public.junior_match_rosters t
USING public.junior_stat_corrections c
WHERE c.tenant_id = 1 AND c.target_table = 'junior_match_rosters' AND c.op = 'delete'
  AND t.id = c.target_id::int
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = t.match_id AND m.tenant_id = 1 AND m.id < 200000000
      AND (c.playhq_match_id IS NULL OR m.playhq_match_id = c.playhq_match_id)
  );

-- 6d. Participants with synced history kept their stored metadata in 3b (the dump
-- only knows their pre-2026 games). Recompute it from every tenant-1 line they have,
-- with the same SQL as 7f / the admin merge endpoint's recomputeParticipantMetadata.
UPDATE public.junior_participants p SET
  scorecard_lines =
    (SELECT count(*) FROM public.junior_match_batting b
      JOIN public.junior_matches m ON m.id = b.match_id AND m.tenant_id = p.tenant_id
      WHERE b.participant_id = p.participant_id AND b.is_halls_head)
  + (SELECT count(*) FROM public.junior_match_bowling w
      JOIN public.junior_matches m ON m.id = w.match_id AND m.tenant_id = p.tenant_id
      WHERE w.participant_id = p.participant_id AND w.is_halls_head),
  roster_appearances =
    (SELECT count(*) FROM public.junior_match_rosters r
      JOIN public.junior_matches m ON m.id = r.match_id AND m.tenant_id = p.tenant_id
      WHERE r.participant_id = p.participant_id AND r.is_halls_head),
  first_season = (
    SELECT m.season FROM public.junior_matches m
    JOIN (
      SELECT match_id FROM public.junior_match_batting
        WHERE participant_id = p.participant_id AND is_halls_head
      UNION SELECT match_id FROM public.junior_match_bowling
        WHERE participant_id = p.participant_id AND is_halls_head
      UNION SELECT match_id FROM public.junior_match_rosters
        WHERE participant_id = p.participant_id AND is_halls_head
    ) t ON t.match_id = m.id
    WHERE m.season IS NOT NULL AND m.tenant_id = p.tenant_id
    ORDER BY m.season_start_year ASC NULLS LAST LIMIT 1),
  last_season = (
    SELECT m.season FROM public.junior_matches m
    JOIN (
      SELECT match_id FROM public.junior_match_batting
        WHERE participant_id = p.participant_id AND is_halls_head
      UNION SELECT match_id FROM public.junior_match_bowling
        WHERE participant_id = p.participant_id AND is_halls_head
      UNION SELECT match_id FROM public.junior_match_rosters
        WHERE participant_id = p.participant_id AND is_halls_head
    ) t ON t.match_id = m.id
    WHERE m.season IS NOT NULL AND m.tenant_id = p.tenant_id
    ORDER BY m.season_start_year DESC NULLS LAST LIMIT 1),
  teams = (
    SELECT string_agg(DISTINCT r.team_name, ', ' ORDER BY r.team_name)
    FROM public.junior_match_rosters r
    JOIN public.junior_matches m ON m.id = r.match_id AND m.tenant_id = p.tenant_id
    WHERE r.participant_id = p.participant_id AND r.is_halls_head
      AND r.team_name IS NOT NULL)
FROM _jl_synced s
WHERE p.tenant_id = 1 AND p.participant_id = s.participant_id;

-- 7. Re-apply junior profile merges (junior_participant_merges). Like the
-- corrections journal, the map is APP-OWNED: this ETL reads it but NEVER
-- deletes it. Each row records a permanent admin merge of a duplicate PlayHQ
-- GUID into a keeper; the dump just re-created the duplicate participant row
-- and its lines, so every merge is re-applied here. MUST run AFTER step 6:
-- corrections re-applied in 6b may restore an absorbed GUID onto a line, and
-- this step funnels those to the keeper. Guard: a merge whose keeper GUID is
-- absent from the fresh load is SKIPPED entirely (the duplicate stays live
-- and the loader reports it loudly) — never guess.
--
-- Tenant 1 only, and only rows below the sync id band (the sync maps its own lines
-- through the merge map). Self-contained: uses no temp table or function from the
-- steps above (juniors-participant-merge.test.ts runs this step on its own).
--
-- Senior-link interplay: a link stored on a resurrected duplicate row is carried
-- across by 7c before the row is deleted.

CREATE TEMP TABLE _jpm ON COMMIT DROP AS
SELECT m.duplicate_participant_id AS dup, m.keeper_participant_id AS keeper
FROM public.junior_participant_merges m
WHERE m.tenant_id = 1
  AND EXISTS (
    SELECT 1 FROM public.junior_participants k
    WHERE k.tenant_id = 1 AND k.participant_id = m.keeper_participant_id
  );

-- 7a. Reassign every junior line and reference from duplicate to keeper.
UPDATE public.junior_match_batting t SET participant_id = _jpm.keeper
FROM _jpm WHERE t.participant_id = _jpm.dup
  AND t.match_id IN (SELECT id FROM public.junior_matches WHERE tenant_id = 1 AND id < 200000000);

UPDATE public.junior_match_bowling t SET participant_id = _jpm.keeper
FROM _jpm WHERE t.participant_id = _jpm.dup
  AND t.match_id IN (SELECT id FROM public.junior_matches WHERE tenant_id = 1 AND id < 200000000);

UPDATE public.junior_match_rosters t SET participant_id = _jpm.keeper
FROM _jpm WHERE t.participant_id = _jpm.dup
  AND t.match_id IN (SELECT id FROM public.junior_matches WHERE tenant_id = 1 AND id < 200000000);

UPDATE public.junior_premiership_players t SET participant_id = _jpm.keeper
FROM _jpm WHERE t.participant_id = _jpm.dup
  AND t.premiership_id IN (SELECT id FROM public.junior_premierships WHERE tenant_id = 1);

UPDATE public.junior_office_bearers t SET participant_id = _jpm.keeper
FROM _jpm WHERE t.participant_id = _jpm.dup AND t.tenant_id = 1;

-- 7b. Dedupe: the duplicate and keeper often shared a match (that's why they
-- are duplicates) — keep the lowest-id row per (participant, match) /
-- (premiership, participant).
DELETE FROM public.junior_match_rosters a
USING public.junior_match_rosters b, _jpm
WHERE a.participant_id = _jpm.keeper
  AND b.participant_id = _jpm.keeper
  AND a.match_id = b.match_id
  AND a.id > b.id
  AND a.match_id IN (SELECT id FROM public.junior_matches WHERE tenant_id = 1 AND id < 200000000);

DELETE FROM public.junior_premiership_players a
USING public.junior_premiership_players b, _jpm
WHERE a.participant_id = _jpm.keeper
  AND b.participant_id = _jpm.keeper
  AND a.premiership_id = b.premiership_id
  AND a.id > b.id
  AND a.premiership_id IN (SELECT id FROM public.junior_premierships WHERE tenant_id = 1);

-- 7c. Carry the senior cross-link (keeper's own wins) and sticky privacy from
-- the resurrected duplicate row onto the keeper.
UPDATE public.junior_participants k
SET senior_player_id = COALESCE(k.senior_player_id, d.senior_player_id),
    is_private = k.is_private OR d.is_private
FROM _jpm
JOIN public.junior_participants d ON d.participant_id = _jpm.dup AND d.tenant_id = 1
WHERE k.tenant_id = 1 AND k.participant_id = _jpm.keeper;

-- 7d. Keeper's directory name flows onto its combined HH lines (mirrors the
-- admin rename propagation; runs after 6b's rename refresh so the keeper's
-- name wins on absorbed lines).
UPDATE public.junior_match_batting b
SET player_name = k.display_name
FROM _jpm
JOIN public.junior_participants k ON k.participant_id = _jpm.keeper AND k.tenant_id = 1
WHERE k.display_name IS NOT NULL
  AND b.participant_id = k.participant_id AND b.is_halls_head
  AND b.match_id IN (SELECT id FROM public.junior_matches WHERE tenant_id = 1 AND id < 200000000);

UPDATE public.junior_match_bowling w
SET player_name = k.display_name
FROM _jpm
JOIN public.junior_participants k ON k.participant_id = _jpm.keeper AND k.tenant_id = 1
WHERE k.display_name IS NOT NULL
  AND w.participant_id = k.participant_id AND w.is_halls_head
  AND w.match_id IN (SELECT id FROM public.junior_matches WHERE tenant_id = 1 AND id < 200000000);

UPDATE public.junior_match_rosters r
SET player_name = k.display_name
FROM _jpm
JOIN public.junior_participants k ON k.participant_id = _jpm.keeper AND k.tenant_id = 1
WHERE k.display_name IS NOT NULL
  AND r.participant_id = k.participant_id AND r.is_halls_head
  AND r.match_id IN (SELECT id FROM public.junior_matches WHERE tenant_id = 1 AND id < 200000000);

-- 7e. Delete the resurrected duplicate profile rows: the admin merge's own effect,
-- re-applied (the only participant rows the loader ever removes).
DELETE FROM public.junior_participants d
USING _jpm WHERE d.tenant_id = 1 AND d.participant_id = _jpm.dup;

-- 7f. Recompute the keepers' stored dump-derived metadata from their live
-- lines (the dump's figures describe each GUID separately). Mirrors the
-- admin merge endpoint's recomputeParticipantMetadata — keep in sync.
UPDATE public.junior_participants p SET
  scorecard_lines =
    (SELECT count(*) FROM public.junior_match_batting b
      JOIN public.junior_matches m ON m.id = b.match_id AND m.tenant_id = p.tenant_id
      WHERE b.participant_id = p.participant_id AND b.is_halls_head)
  + (SELECT count(*) FROM public.junior_match_bowling w
      JOIN public.junior_matches m ON m.id = w.match_id AND m.tenant_id = p.tenant_id
      WHERE w.participant_id = p.participant_id AND w.is_halls_head),
  roster_appearances =
    (SELECT count(*) FROM public.junior_match_rosters r
      JOIN public.junior_matches m ON m.id = r.match_id AND m.tenant_id = p.tenant_id
      WHERE r.participant_id = p.participant_id AND r.is_halls_head),
  first_season = (
    SELECT m.season FROM public.junior_matches m
    JOIN (
      SELECT match_id FROM public.junior_match_batting
        WHERE participant_id = p.participant_id AND is_halls_head
      UNION SELECT match_id FROM public.junior_match_bowling
        WHERE participant_id = p.participant_id AND is_halls_head
      UNION SELECT match_id FROM public.junior_match_rosters
        WHERE participant_id = p.participant_id AND is_halls_head
    ) t ON t.match_id = m.id
    WHERE m.season IS NOT NULL AND m.tenant_id = p.tenant_id
    ORDER BY m.season_start_year ASC NULLS LAST LIMIT 1),
  last_season = (
    SELECT m.season FROM public.junior_matches m
    JOIN (
      SELECT match_id FROM public.junior_match_batting
        WHERE participant_id = p.participant_id AND is_halls_head
      UNION SELECT match_id FROM public.junior_match_bowling
        WHERE participant_id = p.participant_id AND is_halls_head
      UNION SELECT match_id FROM public.junior_match_rosters
        WHERE participant_id = p.participant_id AND is_halls_head
    ) t ON t.match_id = m.id
    WHERE m.season IS NOT NULL AND m.tenant_id = p.tenant_id
    ORDER BY m.season_start_year DESC NULLS LAST LIMIT 1),
  teams = (
    SELECT string_agg(DISTINCT r.team_name, ', ' ORDER BY r.team_name)
    FROM public.junior_match_rosters r
    JOIN public.junior_matches m ON m.id = r.match_id AND m.tenant_id = p.tenant_id
    WHERE r.participant_id = p.participant_id AND r.is_halls_head
      AND r.team_name IS NOT NULL)
FROM _jpm
WHERE p.tenant_id = 1 AND p.participant_id = _jpm.keeper;
