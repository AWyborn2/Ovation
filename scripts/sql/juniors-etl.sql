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

-- 1. Snapshot the cross-reference links so a reload never loses them.
CREATE TEMP TABLE _jp_links ON COMMIT DROP AS
SELECT participant_id, senior_player_id
FROM public.junior_participants
WHERE senior_player_id IS NOT NULL;

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
  id, playhq_match_id, season, season_start_year, grade, age_group, team_name,
  competition, round, match_date, venue, status, team1, team1_score, team2,
  team2_score, hh_team_id, hh_result, winner, toss_winner, hh_batted_first,
  opponent_name
)
SELECT
  match_id, playhq_match_id, season,
  -- Parse the leading year out of a "2024/25" season string for reliable
  -- newest-first ordering (NULL when the season text has no 4-digit prefix).
  NULLIF(substring(season from '^[0-9]{4}'), '')::int AS season_start_year,
  grade,
  -- Canonical age-group label (see pg_temp.jr_norm_age above): prefer the dump's
  -- clean age_group, fall back to deriving from the messy grade text.
  COALESCE(
    NULLIF(pg_temp.jr_norm_age(age_group), ''),
    NULLIF(pg_temp.jr_norm_age(grade), ''),
    NULLIF(trim(age_group), ''),
    NULLIF(trim(grade), '')
  ) AS age_group,
  team_name, competition, round, match_date, venue, status, team1, team1_score,
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
  id, season, age_group, team_name, competition, match_date, opponent, hh_score,
  opp_score, result_text, match_id, playhq_match_id
)
SELECT
  id, season, age_group, team_name, competition, match_date, opponent, hh_score,
  opp_score, result_text, match_id, playhq_match_id
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
