-- juniors-etl.sql — load the staged JUNIORS export (schema juniors_staging)
-- into the app's public junior_* tables.
--
-- This data is read-only display data and is FULLY REPLACED on every run; the
-- ETL is idempotent and re-runnable. Run inside a single transaction (the loader
-- passes --single-transaction). The only thing preserved across reloads is the
-- admin-set junior↔senior cross-reference link (junior_participants.senior_player_id),
-- which the loader snapshots and re-applies by participant_id.

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

-- 1. Snapshot the cross-reference links so a reload never loses them.
CREATE TEMP TABLE _jp_links ON COMMIT DROP AS
SELECT participant_id, senior_player_id
FROM public.junior_participants
WHERE senior_player_id IS NOT NULL;

-- 1b. Snapshot admin-entered premiership extras (man-of-the-match + captain
-- flags). These are NOT in the PlayHQ dump — admins add them by hand — so they
-- must survive a reload. Premiership and player ids are stable across reloads
-- (the dump carries explicit ids), so we re-key by id.
CREATE TEMP TABLE _jp_mom ON COMMIT DROP AS
SELECT id, mom
FROM public.junior_premierships
WHERE mom IS NOT NULL;

CREATE TEMP TABLE _jp_captains ON COMMIT DROP AS
SELECT id
FROM public.junior_premiership_players
WHERE is_captain;

-- 2. Clear in FK-safe order (children before parents).
DELETE FROM public.junior_premiership_players;
DELETE FROM public.junior_premierships;
DELETE FROM public.junior_match_batting;
DELETE FROM public.junior_match_bowling;
DELETE FROM public.junior_match_rosters;
DELETE FROM public.junior_participants;
DELETE FROM public.junior_matches;

-- 3. Load parents then children.
INSERT INTO public.junior_matches (
  id, playhq_match_id, season, season_start_year, grade, age_group, age_group_raw,
  team_name, competition, association, round, match_date, venue, venue_oval,
  venue_address, venue_suburb, status, team1, team1_score, team2,
  team2_score, hh_team_id, hh_result, winner, toss_winner, hh_batted_first,
  opponent_name
)
SELECT
  match_id, playhq_match_id, season,
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
FROM juniors_staging.matches;

INSERT INTO public.junior_participants (
  participant_id, display_name, is_private, scorecard_lines, roster_appearances,
  first_season, last_season, teams
)
SELECT
  participant_id, display_name, COALESCE(is_private, FALSE), scorecard_lines,
  roster_appearances, first_season, last_season, teams
FROM juniors_staging.junior_participants;

INSERT INTO public.junior_match_batting (
  id, match_id, innings, batting_team, is_halls_head, bat_order, participant_id,
  player_name, runs, balls, fours, sixes, strike_rate, dismissal
)
SELECT
  id, match_id, innings, batting_team, COALESCE(is_halls_head, FALSE), bat_order,
  participant_id, player_name, runs, balls, fours, sixes, strike_rate, dismissal
FROM juniors_staging.match_batting;

INSERT INTO public.junior_match_bowling (
  id, match_id, innings, bowling_team, is_halls_head, participant_id, player_name,
  overs, maidens, runs, wickets, economy, wides, no_balls
)
SELECT
  id, match_id, innings, bowling_team, COALESCE(is_halls_head, FALSE), participant_id,
  player_name, overs, maidens, runs, wickets, economy, wides, no_balls
FROM juniors_staging.match_bowling;

INSERT INTO public.junior_match_rosters (
  id, match_id, team_name, is_halls_head, participant_id, player_name
)
SELECT
  id, match_id, team_name, COALESCE(is_halls_head, FALSE), participant_id, player_name
FROM juniors_staging.match_rosters;

INSERT INTO public.junior_premierships (
  id, season, age_group, age_group_raw, team_name, competition, association,
  match_date, venue, venue_oval, opponent, hh_score,
  opp_score, result_text, match_id, playhq_match_id
)
SELECT
  id, season,
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
FROM juniors_staging.junior_premierships;

INSERT INTO public.junior_premiership_players (
  id, premiership_id, participant_id, player_name
)
SELECT
  id, premiership_id, participant_id, player_name
FROM juniors_staging.junior_premiership_players;

-- 4. Re-apply preserved cross-reference links (only where the senior player still exists).
UPDATE public.junior_participants jp
SET senior_player_id = l.senior_player_id
FROM _jp_links l
WHERE l.participant_id = jp.participant_id
  AND EXISTS (SELECT 1 FROM public.players p WHERE p.id = l.senior_player_id);

-- 4b. Re-apply preserved admin-entered premiership extras (man-of-the-match +
-- captain flags) onto the freshly loaded rows, matching by stable dump id.
UPDATE public.junior_premierships pr
SET mom = m.mom
FROM _jp_mom m
WHERE m.id = pr.id;

UPDATE public.junior_premiership_players pl
SET is_captain = TRUE
FROM _jp_captains c
WHERE c.id = pl.id;

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
  ) m WHERE m.rn = 1
) best
WHERE jm.id = best.match_id;

-- 6. Re-apply admin stat corrections (junior_stat_corrections). The journal is
-- APP-OWNED: this ETL reads it but NEVER deletes it — it is the permanent
-- record of admin edits to the read-only dump data (and the API's audit
-- trail). Ordering: re-create admin-added rows first (6a), then apply merged
-- update patches (6b: per-column last-write-wins by journal id), then apply
-- deletions (6c). Every pass is guarded by the stored playhq_match_id anchor:
-- if a future dump renumbers row ids, a mismatched correction is SKIPPED (the
-- loader reports skips loudly), never applied to the wrong row.

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
WHERE c.target_table = 'junior_match_batting' AND c.op = 'insert'
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = (c.patch->>'match_id')::int
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
WHERE c.target_table = 'junior_match_bowling' AND c.op = 'insert'
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = (c.patch->>'match_id')::int
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
WHERE c.target_table = 'junior_match_rosters' AND c.op = 'insert'
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = (c.patch->>'match_id')::int
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
WHERE c.op = 'update' AND c.patch IS NOT NULL
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
    WHERE m.id = t.match_id
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
    WHERE m.id = t.match_id
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
    WHERE m.id = t.match_id
      AND (u.playhq_match_id IS NULL OR m.playhq_match_id = u.playhq_match_id)
  );

-- Participants re-key by their stable PlayHQ GUID — no anchor needed.
UPDATE public.junior_participants t
SET
  display_name = CASE WHEN u.eff ? 'display_name' THEN u.eff->>'display_name'          ELSE t.display_name END,
  is_private   = CASE WHEN u.eff ? 'is_private'   THEN (u.eff->>'is_private')::boolean ELSE t.is_private END
FROM _jsc_upd u
WHERE u.target_table = 'junior_participants'
  AND t.participant_id = u.target_id;

-- A corrected display name flows onto the participant's HH scorecard/roster
-- lines, matching what the admin API does at edit time.
UPDATE public.junior_match_batting b
SET player_name = p.display_name
FROM _jsc_upd u
JOIN public.junior_participants p ON p.participant_id = u.target_id
WHERE u.target_table = 'junior_participants' AND u.eff ? 'display_name'
  AND b.participant_id = p.participant_id AND b.is_halls_head;

UPDATE public.junior_match_bowling w
SET player_name = p.display_name
FROM _jsc_upd u
JOIN public.junior_participants p ON p.participant_id = u.target_id
WHERE u.target_table = 'junior_participants' AND u.eff ? 'display_name'
  AND w.participant_id = p.participant_id AND w.is_halls_head;

UPDATE public.junior_match_rosters r
SET player_name = p.display_name
FROM _jsc_upd u
JOIN public.junior_participants p ON p.participant_id = u.target_id
WHERE u.target_table = 'junior_participants' AND u.eff ? 'display_name'
  AND r.participant_id = p.participant_id AND r.is_halls_head;

-- 6c. Re-apply deletions last (a deleted admin-created row was re-inserted in
-- 6a and is removed again here — net correct). Anchored like the updates.
DELETE FROM public.junior_match_batting t
USING public.junior_stat_corrections c
WHERE c.target_table = 'junior_match_batting' AND c.op = 'delete'
  AND t.id = c.target_id::int
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = t.match_id
      AND (c.playhq_match_id IS NULL OR m.playhq_match_id = c.playhq_match_id)
  );

DELETE FROM public.junior_match_bowling t
USING public.junior_stat_corrections c
WHERE c.target_table = 'junior_match_bowling' AND c.op = 'delete'
  AND t.id = c.target_id::int
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = t.match_id
      AND (c.playhq_match_id IS NULL OR m.playhq_match_id = c.playhq_match_id)
  );

DELETE FROM public.junior_match_rosters t
USING public.junior_stat_corrections c
WHERE c.target_table = 'junior_match_rosters' AND c.op = 'delete'
  AND t.id = c.target_id::int
  AND EXISTS (
    SELECT 1 FROM public.junior_matches m
    WHERE m.id = t.match_id
      AND (c.playhq_match_id IS NULL OR m.playhq_match_id = c.playhq_match_id)
  );
