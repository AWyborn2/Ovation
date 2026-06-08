-- juniors-etl.sql — load the staged JUNIORS export (schema juniors_staging)
-- into the app's public junior_* tables.
--
-- This data is read-only display data and is FULLY REPLACED on every run; the
-- ETL is idempotent and re-runnable. Run inside a single transaction (the loader
-- passes --single-transaction). The only thing preserved across reloads is the
-- admin-set junior↔senior cross-reference link (junior_participants.senior_player_id),
-- which the loader snapshots and re-applies by participant_id.

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
  id, playhq_match_id, season, grade, age_group, team_name, competition, round,
  match_date, venue, status, team1, team1_score, team2, team2_score, hh_team_id,
  hh_result, winner, toss_winner, hh_batted_first, opponent_name
)
SELECT
  match_id, playhq_match_id, season, grade, age_group, team_name, competition, round,
  match_date, venue, status, team1, team1_score, team2, team2_score, hh_team_id,
  hh_result, winner, toss_winner, hh_batted_first, opponent_name
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
