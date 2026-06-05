-- Master DB ETL: map the staged master export (schema `staging`) onto the app
-- schema (schema `public`) and recompute every derived total.
--
-- Run with:  psql "$DATABASE_URL" --single-transaction -v ON_ERROR_STOP=1 \
--              -f scripts/sql/master-etl.sql
--
-- Prerequisite: the `staging` schema has already been (re)built from the dump.
-- This file is idempotent: re-running cleanly replaces the loaded data.
--
-- It REPLACES the data tables the master owns and KEEPS app-config tables
-- (award definitions, honour-board config, admins, captains, baseline
-- adjustments, imports, matches). Players are upserted by id (preserving the
-- master IDs, including the fill-in 90001+ and cap-only 95001+ ranges).

----------------------------------------------------------------------
-- 0. Mapping helpers (idempotent)
----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION staging.app_grade(g text) RETURNS text AS $$
  SELECT CASE upper(btrim(coalesce(g, '')))
    WHEN 'A' THEN 'A Grade'        WHEN 'A GRADE' THEN 'A Grade'        WHEN 'MENS A GRADE' THEN 'A Grade'
    WHEN 'B' THEN 'B Grade'        WHEN 'B GRADE' THEN 'B Grade'
    WHEN 'C' THEN 'C Grade'        WHEN 'C GRADE' THEN 'C Grade'
    WHEN 'D' THEN 'D Grade'        WHEN 'D GRADE' THEN 'D Grade'
    WHEN 'E' THEN 'E Grade'        WHEN 'E GRADE' THEN 'E Grade'
    WHEN 'F' THEN 'F Grade'        WHEN 'F GRADE' THEN 'F Grade'
    WHEN 'FEMALE A' THEN 'Female A Grade'  WHEN 'FEMALE A GRADE' THEN 'Female A Grade'
    WHEN 'FEMALE B' THEN 'Female B Grade'  WHEN 'FEMALE B GRADE' THEN 'Female B Grade'
    WHEN 'PPL' THEN 'PPL'          WHEN 'PEEL PREMIER LEAGUE' THEN 'PPL'
    WHEN 'U21 COLTS' THEN 'Colts'  WHEN 'COLTS' THEN 'Colts'
    ELSE
      CASE
        WHEN g ~* '^mid-year t20 '
          THEN staging.app_grade(regexp_replace(g, '^[Mm]id-[Yy]ear [Tt]20 ', ''))
        ELSE NULLIF(btrim(g), '')
      END
  END;
$$ LANGUAGE sql IMMUTABLE;

-- Season label "YYYY/YY" -> integer START year (app convention for club_roles,
-- award_winners, life-member induction). premierships.year uses the END year,
-- which the master already provides directly.
CREATE OR REPLACE FUNCTION staging.season_start(s text) RETURNS int AS $$
  SELECT NULLIF(substring(btrim(coalesce(s, '')) from '^[0-9]{4}'), '')::int;
$$ LANGUAGE sql IMMUTABLE;

----------------------------------------------------------------------
-- 1. Backup the tables we are about to replace (recoverable rollback)
----------------------------------------------------------------------
DROP SCHEMA IF EXISTS master_load_backup CASCADE;
CREATE SCHEMA master_load_backup;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'players','player_grade_season_stats','player_grade_stats','grade_summaries',
    'cap_register','premierships','premiership_players','club_roles','award_winners',
    'life_members','team_of_decade_boards','team_of_decade_members','clubs',
    'partnership_records','partnerships_50plus','centuries','five_wicket_hauls',
    'club_records','honour_board_records'
  ] LOOP
    EXECUTE format('CREATE TABLE master_load_backup.%I AS TABLE public.%I', t, t);
  END LOOP;
END $$;

----------------------------------------------------------------------
-- 2. Players: upsert by id (keep app-managed image/card fields)
----------------------------------------------------------------------
INSERT INTO public.players (id, surname, given_name, is_fill_in, is_cap_only)
SELECT player_id,
       coalesce(surname, ''),
       coalesce(given, surname, ''),
       coalesce(is_fill_in, false),
       coalesce(is_cap_only, false)
FROM staging.players
ON CONFLICT (id) DO UPDATE SET
  surname     = EXCLUDED.surname,
  given_name  = EXCLUDED.given_name,
  is_fill_in  = EXCLUDED.is_fill_in,
  is_cap_only = EXCLUDED.is_cap_only;

-- Drop app players that are not part of the master (test-data leftovers).
DELETE FROM public.players WHERE id NOT IN (SELECT player_id FROM staging.players);

-- Deceased flag is carried on the cap register in the master.
UPDATE public.players SET deceased = false;
UPDATE public.players p SET deceased = true
FROM staging.caps c WHERE c.player_id = p.id AND c.deceased = true;

----------------------------------------------------------------------
-- 3. Per-grade career baseline (one season=NULL snapshot per player+grade,
--    rolled up by parent grade across sub-competitions)
----------------------------------------------------------------------
DELETE FROM public.player_grade_season_stats;
WITH rolled AS (
  SELECT cs.player_id,
         staging.app_grade(cs.parent_grade) AS grade,
         SUM(cs.games) games, SUM(cs.inns) innings, SUM(cs.no) not_outs, SUM(cs.runs) runs,
         SUM(cs.fifties) fifties, SUM(cs.hundreds) hundreds, SUM(cs.wkts) wickets,
         SUM(cs.bowl_runs) runs_conceded, SUM(cs.five_w) five_wickets,
         SUM(cs.catch) catches, SUM(cs.stumpings) stumpings, SUM(cs.run_outs) run_outs
  FROM staging.career_stats cs
  WHERE staging.app_grade(cs.parent_grade) IS NOT NULL
  GROUP BY cs.player_id, staging.app_grade(cs.parent_grade)
)
INSERT INTO public.player_grade_season_stats
  (player_id, grade, season, import_id, games, innings, not_outs, runs, high_score,
   fifties, hundreds, wickets, runs_conceded, best_bowling, five_wickets, catches,
   stumpings, run_outs)
SELECT r.player_id, r.grade, NULL::int, NULL::int,
  NULLIF(COALESCE(r.games, 0), 0), NULLIF(COALESCE(r.innings, 0), 0),
  NULLIF(COALESCE(r.not_outs, 0), 0), NULLIF(COALESCE(r.runs, 0), 0),
  (SELECT x.hs FROM staging.career_stats x
     WHERE x.player_id = r.player_id AND staging.app_grade(x.parent_grade) = r.grade
       AND x.hs IS NOT NULL AND x.hs <> ''
     ORDER BY NULLIF(regexp_replace(x.hs, '[^0-9]', '', 'g'), '')::int DESC NULLS LAST,
              (x.hs ~ '\*') DESC
     LIMIT 1),
  NULLIF(COALESCE(r.fifties, 0), 0), NULLIF(COALESCE(r.hundreds, 0), 0),
  NULLIF(COALESCE(r.wickets, 0), 0), NULLIF(COALESCE(r.runs_conceded, 0), 0),
  (SELECT x.best_bowl FROM staging.career_stats x
     WHERE x.player_id = r.player_id AND staging.app_grade(x.parent_grade) = r.grade
       AND x.best_bowl ~ '^[0-9]+/[0-9]+$'
     ORDER BY split_part(x.best_bowl, '/', 1)::int DESC,
              split_part(x.best_bowl, '/', 2)::int ASC
     LIMIT 1),
  NULLIF(COALESCE(r.five_wickets, 0), 0), NULLIF(COALESCE(r.catches, 0), 0),
  NULLIF(COALESCE(r.stumpings, 0), 0), NULLIF(COALESCE(r.run_outs, 0), 0)
FROM rolled r
JOIN public.players p ON p.id = r.player_id;

----------------------------------------------------------------------
-- 4. Cap register (master is the cap authority; full replace)
----------------------------------------------------------------------
DELETE FROM public.cap_register;
INSERT INTO public.cap_register
  (cap_number, category, name, deceased, in_stats, games_a_grade, debut_seq, cap_note, auto_created, player_id)
SELECT cap_number,
       coalesce(category, 'male'),
       coalesce(name, ''),
       coalesce(deceased, false),
       coalesce(a_grade_stats_tracked, false),
       coalesce(games_a_grade, 0),
       debut_seq,
       NULLIF(btrim(coalesce(stats_note, '')), ''),
       false,
       player_id
FROM staging.caps;

----------------------------------------------------------------------
-- 5. Premierships + winning XIs (preserve master premiership ids)
----------------------------------------------------------------------
DELETE FROM public.premierships;  -- cascades premiership_players
INSERT INTO public.premierships (id, year, grade, competition, venue, match_date, result, mom, notes)
SELECT id,
       year,
       coalesce(staging.app_grade(grade), grade),
       coalesce(NULLIF(btrim(coalesce(competition, '')), ''), coalesce(staging.app_grade(grade), grade)),
       venue, match_date, result, motm,
       NULLIF(btrim('Captain: ' || coalesce(captain, '')), 'Captain:')
FROM staging.premierships;
INSERT INTO public.premiership_players (premiership_id, player_id, name, is_captain, is_motm, batting_order)
SELECT premiership_id, player_id, coalesce(player_name, ''),
       coalesce(is_captain, false), coalesce(is_motm, false), batting_order
FROM staging.premiership_players;

----------------------------------------------------------------------
-- 6. Club roles: office bearers (grade NULL) + grade captains.
--    Grade Cricketer of the Year is an AWARD (see step 7), not a club role.
--    Aggregate co-holders into one row to satisfy the (season,role,grade) unique.
----------------------------------------------------------------------
DELETE FROM public.club_roles;
-- Office bearers from the honour board (exclude cricketer-of-year + life members).
INSERT INTO public.club_roles (season, role, grade, player_id, name, display_order, published)
SELECT season, role, NULL::text,
       CASE WHEN count(*) = 1 THEN max(player_id) ELSE NULL END,
       string_agg(DISTINCT person, ' & ' ORDER BY person), 0, true
FROM (
  SELECT staging.season_start(season) AS season, role, person, player_id
  FROM staging.honour_board
  WHERE role NOT ILIKE '%cricketer%' AND role NOT ILIKE '%life member%'
    AND staging.season_start(season) IS NOT NULL
) h
GROUP BY season, role;
-- Grade captains from grade honours.
INSERT INTO public.club_roles (season, role, grade, player_id, name, display_order, published)
SELECT season, 'Grade Captain', grade,
       CASE WHEN count(*) = 1 THEN max(player_id) ELSE NULL END,
       string_agg(DISTINCT person, ' & ' ORDER BY person), 0, true
FROM (
  SELECT staging.season_start(season) AS season, staging.app_grade(grade) AS grade, person, player_id
  FROM staging.grade_honours
  WHERE role ILIKE 'Captain' AND staging.season_start(season) IS NOT NULL
    AND staging.app_grade(grade) IS NOT NULL
) g
GROUP BY season, grade;

----------------------------------------------------------------------
-- 7. Award winners: map master award sources onto existing award keys.
--    Keeps the app's award DEFINITIONS (voting/points mechanisms) intact.
----------------------------------------------------------------------
DELETE FROM public.award_winners;
WITH src AS (
  -- (a) master awards table
  SELECT staging.season_start(season) AS season, player_id, recipient AS name,
    CASE award
      WHEN 'Burns Family Medal Player of the Year' THEN 'burns-family-medal'
      WHEN 'Peter Wyllie Medal'                     THEN 'peter-wyllie-medal'
      WHEN 'Female Player of the Year'              THEN 'female-player-of-the-year'
      WHEN 'Male Clubperson of the Year'           THEN 'clubperson-male'
      WHEN 'Female Clubperson of the Year'         THEN 'clubperson-female'
      WHEN 'Presidents Award'                      THEN 'presidents-award'
      WHEN 'Chapelhow Medal'                       THEN 'chapelhow-award'
      WHEN 'Male Coaches Award'                     THEN 'coaches-award-male'
      WHEN 'Female Coaches Award'                   THEN 'coaches-award-female'
      ELSE NULL END AS key, 1 AS prec
  FROM staging.awards
  UNION ALL
  -- (b) honour-board cricketer-of-the-year rows (older era; dedup vs (a))
  SELECT staging.season_start(season), player_id, person,
    CASE WHEN role ILIKE 'Female Cricketer of the Year' THEN 'female-player-of-the-year'
         WHEN role ILIKE '%Cricketer of the Year%'       THEN 'burns-family-medal'
         ELSE NULL END, 2
  FROM staging.honour_board
  WHERE role ILIKE '%Cricketer of the Year%'
  UNION ALL
  -- (c) grade cricketers of the year
  SELECT staging.season_start(season), player_id, person,
    CASE upper(btrim(grade))
      WHEN 'MENS A GRADE'        THEN 'burns-family-medal'
      WHEN 'B GRADE'             THEN 'grade-cricketer-b-grade'
      WHEN 'C GRADE'             THEN 'grade-cricketer-c-grade'
      WHEN 'D GRADE'             THEN 'grade-cricketer-d-grade'
      WHEN 'E GRADE'             THEN 'grade-cricketer-e-grade'
      WHEN 'F GRADE'             THEN 'grade-cricketer-f-grade'
      WHEN 'COLTS'               THEN 'grade-cricketer-colts'
      WHEN 'PEEL PREMIER LEAGUE' THEN 'grade-cricketer-ppl'
      WHEN 'FEMALE A GRADE'      THEN 'female-player-of-the-year'
      WHEN 'FEMALE B GRADE'      THEN 'grade-cricketer-female-b-grade'
      ELSE NULL END, 3
  FROM staging.grade_honours
  WHERE role ILIKE 'Cricketer of the Year'
),
ranked AS (
  SELECT DISTINCT ON (s.key, s.season, lower(btrim(s.name)))
         a.id AS award_id, s.season, s.player_id, s.name
  FROM src s
  JOIN public.awards a ON a.key = s.key
  WHERE s.key IS NOT NULL AND s.season IS NOT NULL AND btrim(coalesce(s.name, '')) <> ''
  ORDER BY s.key, s.season, lower(btrim(s.name)), s.prec
)
INSERT INTO public.award_winners (award_id, season, player_id, name, display_order, published)
SELECT award_id, season, player_id, name, 0, true FROM ranked;

----------------------------------------------------------------------
-- 8. Life members (full replace)
----------------------------------------------------------------------
DELETE FROM public.life_members;
INSERT INTO public.life_members (name, induction_year, is_playing_member, player_id, role_label, blurb)
SELECT coalesce(name, ''), coalesce(staging.season_start(season_inducted), 0), true, player_id, NULL, ''
FROM staging.life_members;

----------------------------------------------------------------------
-- 9. Team of the decade -> one board per grade + members
----------------------------------------------------------------------
DELETE FROM public.team_of_decade_members;
DELETE FROM public.team_of_decade_boards;
INSERT INTO public.team_of_decade_boards (key, title, team_label, period_label, subtitle, published, display_order)
SELECT 'team-of-decade-' || lower(replace(grade, ' ', '-')),
       initcap(grade) || ' Team of the Decade', '', '', '', true,
       row_number() OVER (ORDER BY grade)
FROM (SELECT DISTINCT grade FROM staging.team_of_decade) g;
INSERT INTO public.team_of_decade_members
  (board_id, player_id, name, batting_order, role, is_captain, is_vice_captain, is_wicketkeeper, display_order)
SELECT b.id,
       p.id,
       m.name,
       coalesce(t.position, 99),
       m.role,
       coalesce(t.player, '') ~* '\(\s*c\s*\)',
       coalesce(t.player, '') ~* '\(\s*vc\s*\)',
       coalesce(t.player, '') ~* '\(\s*w\.?k\.?\s*\)',
       coalesce(t.position, 99)
FROM staging.team_of_decade t
JOIN public.team_of_decade_boards b
  ON b.key = 'team-of-decade-' || lower(replace(t.grade, ' ', '-'))
CROSS JOIN LATERAL (
  -- Player rows carry the name in `player` (with optional (C)/(VC)/(W.K) flags).
  -- Annotation rows (e.g. scorer) carry "LABEL : NAME" in `note` instead.
  SELECT
    CASE WHEN btrim(coalesce(t.player, '')) <> ''
         THEN btrim(regexp_replace(t.player, '\([^)]*\)', '', 'g'))
         ELSE btrim(split_part(coalesce(t.note, ''), ':', 2)) END AS name,
    CASE WHEN btrim(coalesce(t.player, '')) <> ''
         THEN coalesce(t.note, '')
         ELSE initcap(btrim(split_part(coalesce(t.note, ''), ':', 1))) END AS role
) m
LEFT JOIN public.players p
  ON upper(p.given_name || ' ' || p.surname) = upper(m.name)
WHERE btrim(coalesce(m.name, '')) <> '';

----------------------------------------------------------------------
-- 10. Opposition / club reference (preserve master ids)
----------------------------------------------------------------------
DELETE FROM public.clubs;
INSERT INTO public.clubs
  (id, playhq_org_id, name, slug, type, role, playhq_org_page, logo_url, logo_url_128,
   primary_colour, secondary_colour, tertiary_colour, quaternary_colour, tertiary_approx, short_name)
SELECT id, playhq_org_id, coalesce(name, ''), slug, type, role, playhq_org_page, logo_url, logo_url_128,
       primary_colour, secondary_colour, tertiary_colour, quaternary_colour,
       coalesce(tertiary_approx, false), short_name
FROM staging.clubs;

----------------------------------------------------------------------
-- 11. Partnership records + 50+ list
----------------------------------------------------------------------
DELETE FROM public.partnership_records;
INSERT INTO public.partnership_records (grade, wicket, runs, batsmen, opposition, season)
SELECT coalesce(staging.app_grade(grade), grade), wicket, runs, batsmen, opposition, season
FROM staging.partnership_records;
DELETE FROM public.partnerships_50plus;
INSERT INTO public.partnerships_50plus (grade, wicket, runs, batsmen, opposition, season, source)
SELECT coalesce(staging.app_grade(grade), grade), wicket, runs, batsmen, opposition, season, source
FROM staging.partnerships_50plus;

----------------------------------------------------------------------
-- 12. Curated historical lists
----------------------------------------------------------------------
DELETE FROM public.centuries;
INSERT INTO public.centuries (player_id, grade, batsman, score, season)
SELECT player_id, coalesce(staging.app_grade(grade), grade), batsman, score::text, season
FROM staging.centuries;
DELETE FROM public.five_wicket_hauls;
INSERT INTO public.five_wicket_hauls (player_id, grade, bowler, figures, season)
SELECT player_id, coalesce(staging.app_grade(grade), grade), bowler, figures, season
FROM staging.five_wicket_hauls;
DELETE FROM public.club_records;
INSERT INTO public.club_records (record_type, grade, detail)
SELECT record_type, coalesce(staging.app_grade(grade), grade), detail
FROM staging.club_records;
DELETE FROM public.honour_board_records;
INSERT INTO public.honour_board_records (category, rank, name, value)
SELECT category, rank, name, value FROM staging.honour_board_records;

----------------------------------------------------------------------
-- 13. Recompute every derived total (replicates recompute.ts for ALL grades)
----------------------------------------------------------------------
DELETE FROM public.player_grade_stats;
INSERT INTO public.player_grade_stats
  (player_id, surname, given_name, grade, season, games, innings, not_outs, runs, bat_avg,
   high_score, fifties, hundreds, wickets, runs_conceded, bowl_avg, best_bowling, five_wickets,
   catches, stumpings, run_outs)
SELECT s.player_id, p.surname, p.given_name, s.grade, NULL::int,
  NULLIF(COALESCE(SUM(s.games), 0), 0), NULLIF(COALESCE(SUM(s.innings), 0), 0),
  NULLIF(COALESCE(SUM(s.not_outs), 0), 0), NULLIF(COALESCE(SUM(s.runs), 0), 0),
  CASE WHEN COALESCE(SUM(s.innings), 0) - COALESCE(SUM(s.not_outs), 0) > 0
       THEN COALESCE(SUM(s.runs), 0)::real / (COALESCE(SUM(s.innings), 0) - COALESCE(SUM(s.not_outs), 0))
       ELSE NULL END,
  (SELECT high_score FROM player_grade_season_stats x
     WHERE x.player_id = s.player_id AND x.grade = s.grade AND x.high_score IS NOT NULL AND x.high_score <> ''
     ORDER BY NULLIF(regexp_replace(x.high_score, '[^0-9]', '', 'g'), '')::int DESC NULLS LAST,
              (x.high_score ~ '\*') DESC LIMIT 1),
  NULLIF(COALESCE(SUM(s.fifties), 0), 0), NULLIF(COALESCE(SUM(s.hundreds), 0), 0),
  NULLIF(COALESCE(SUM(s.wickets), 0), 0), NULLIF(COALESCE(SUM(s.runs_conceded), 0), 0),
  CASE WHEN COALESCE(SUM(s.wickets), 0) > 0
       THEN COALESCE(SUM(s.runs_conceded), 0)::real / SUM(s.wickets) ELSE NULL END,
  (SELECT best_bowling FROM player_grade_season_stats x
     WHERE x.player_id = s.player_id AND x.grade = s.grade AND x.best_bowling IS NOT NULL
       AND x.best_bowling <> '' AND x.best_bowling ~ '^[0-9]+/[0-9]+$'
     ORDER BY split_part(x.best_bowling, '/', 1)::int DESC, split_part(x.best_bowling, '/', 2)::int ASC
     LIMIT 1),
  NULLIF(COALESCE(SUM(s.five_wickets), 0), 0), NULLIF(COALESCE(SUM(s.catches), 0), 0),
  NULLIF(COALESCE(SUM(s.stumpings), 0), 0), NULLIF(COALESCE(SUM(s.run_outs), 0), 0)
FROM player_grade_season_stats s
JOIN players p ON p.id = s.player_id
GROUP BY s.player_id, p.surname, p.given_name, s.grade;

-- Career totals for every player (NULL for those with no recorded stats).
UPDATE public.players SET total_games = NULL, total_runs = NULL, total_wickets = NULL, grades_played = NULL;
WITH agg AS (
  SELECT player_id,
         NULLIF(COALESCE(SUM(games), 0), 0)   AS total_games,
         NULLIF(COALESCE(SUM(runs), 0), 0)    AS total_runs,
         NULLIF(COALESCE(SUM(wickets), 0), 0) AS total_wickets,
         NULLIF(string_agg(DISTINCT grade, ', ' ORDER BY grade), '') AS grades_played
  FROM public.player_grade_stats GROUP BY player_id
)
UPDATE public.players p SET
  total_games = agg.total_games, total_runs = agg.total_runs,
  total_wickets = agg.total_wickets, grades_played = agg.grades_played
FROM agg WHERE p.id = agg.player_id;

DELETE FROM public.grade_summaries;
INSERT INTO public.grade_summaries (grade, players, games, innings, runs, wickets, catches, stumpings, run_outs)
SELECT grade, COUNT(DISTINCT player_id),
  NULLIF(COALESCE(SUM(games), 0), 0), NULLIF(COALESCE(SUM(innings), 0), 0),
  NULLIF(COALESCE(SUM(runs), 0), 0), NULLIF(COALESCE(SUM(wickets), 0), 0),
  NULLIF(COALESCE(SUM(catches), 0), 0), NULLIF(COALESCE(SUM(stumpings), 0), 0),
  NULLIF(COALESCE(SUM(run_outs), 0), 0)
FROM public.player_grade_stats GROUP BY grade;

----------------------------------------------------------------------
-- 14. Reset id sequences for tables loaded with explicit master ids
----------------------------------------------------------------------
SELECT setval('players_id_seq',      GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.players), 1));
SELECT setval('premierships_id_seq', GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.premierships), 1));
SELECT setval('clubs_id_seq',        GREATEST((SELECT COALESCE(MAX(id), 1) FROM public.clubs), 1));
