-- =====================================================================
-- matches-etl.sql — bulk-load the master DB's PlayHQ-era match history
-- into the app's match tables, then reconcile the match-era seasons
-- against the career baseline WITHOUT double-counting.
--
-- Runs AFTER buildStaging() has loaded the newest dump into schema
-- `staging`. Idempotent / re-runnable: it first reverses any prior bulk
-- reconciliation, deletes prior bulk matches, then re-loads from scratch.
-- Wrapped in a single transaction by the loader (psql --single-transaction).
--
-- Identity: admin per-match uploads key on (grade, season, round, stage);
-- the bulk load keys on the master `source_key` (parallel competitions
-- and multi-fixture Colts/finals rounds genuinely collide on the former).
-- =====================================================================
SET search_path TO staging, public;
SET client_min_messages TO WARNING;

-- ---------------------------------------------------------------------
-- 0. Grade / season helpers (mirror master-etl.sql; this file runs alone)
-- ---------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION staging.season_start(s text) RETURNS int AS $$
  SELECT NULLIF(substring(btrim(coalesce(s, '')) from '^[0-9]{4}'), '')::int;
$$ LANGUAGE sql IMMUTABLE;

-- ---------------------------------------------------------------------
-- 1. Normalised match list (app grade / season / round / stage / scores)
--    NOTE: all PPL matches are season 2019/20+, so the "PPL before 2019/20
--    rolls into A Grade" rule is a no-op here; app_grade(parent_grade) suffices.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS staging.mnorm;
CREATE TABLE staging.mnorm AS
SELECT
  m.match_id,
  m.source_key,
  staging.app_grade(m.parent_grade)                       AS app_grade,
  staging.season_start(m.season)                          AS app_season,
  CASE WHEN m.round ~ '^Round [0-9]+$'
       THEN substring(m.round from '[0-9]+')::int END     AS app_round,
  CASE WHEN m.round IS NULL THEN NULL
       WHEN m.round ~ '^Round [0-9]+$' THEN NULL
       ELSE m.round END                                   AS app_stage,
  m.competition,
  m.match_date,
  m.venue,
  m.hh_result,
  m.opponent_name,
  c.id                                                    AS opponent_club_id,
  CASE WHEN m.team1 = m.hh_team THEN m.team1_score
       WHEN m.team2 = m.hh_team THEN m.team2_score
       WHEN m.team1 = m.opponent_name THEN m.team2_score
       WHEN m.team2 = m.opponent_name THEN m.team1_score
       ELSE NULL END                                      AS hhcc_score,
  CASE WHEN m.team1 = m.hh_team THEN m.team2_score
       WHEN m.team2 = m.hh_team THEN m.team1_score
       WHEN m.team1 = m.opponent_name THEN m.team1_score
       WHEN m.team2 = m.opponent_name THEN m.team2_score
       ELSE NULL END                                      AS opponent_score,
  m.hh_batted_first                                       AS hhcc_batted_first,
  (upper(coalesce(m.status, '')) = 'ABANDONED')           AS abandoned
FROM staging.matches m
LEFT JOIN public.clubs c ON c.id = m.opponent_club_id
WHERE staging.app_grade(m.parent_grade) IS NOT NULL
  AND staging.season_start(m.season) IS NOT NULL
  AND m.source_key IS NOT NULL;

-- distinct (grade, season) pairs this load owns (scopes reconciliation)
DROP TABLE IF EXISTS staging.mgs;
CREATE TABLE staging.mgs AS
SELECT DISTINCT app_grade AS grade, app_season AS season FROM staging.mnorm;

-- ---------------------------------------------------------------------
-- 2. Reverse any prior bulk reconciliation (idempotency / re-runnability)
-- ---------------------------------------------------------------------
-- 2a. Add back prior peel deltas to the season=NULL baseline, scoped to the
--     (grade, season) pairs this load manages, then drop those adjustments.
UPDATE public.player_grade_season_stats t SET
  games        = NULLIF(coalesce(t.games, 0)         + r.games, 0),
  innings      = NULLIF(coalesce(t.innings, 0)       + r.innings, 0),
  not_outs     = NULLIF(coalesce(t.not_outs, 0)      + r.not_outs, 0),
  runs         = NULLIF(coalesce(t.runs, 0)          + r.runs, 0),
  fifties      = NULLIF(coalesce(t.fifties, 0)       + r.fifties, 0),
  hundreds     = NULLIF(coalesce(t.hundreds, 0)      + r.hundreds, 0),
  wickets      = NULLIF(coalesce(t.wickets, 0)       + r.wickets, 0),
  runs_conceded= NULLIF(coalesce(t.runs_conceded, 0) + r.runs_conceded, 0),
  five_wickets = NULLIF(coalesce(t.five_wickets, 0)  + r.five_wickets, 0),
  catches      = NULLIF(coalesce(t.catches, 0)       + r.catches, 0),
  stumpings    = NULLIF(coalesce(t.stumpings, 0)     + r.stumpings, 0),
  run_outs     = NULLIF(coalesce(t.run_outs, 0)      + r.run_outs, 0)
FROM (
  SELECT ba.player_id, ba.grade,
    sum(ba.games) games, sum(ba.innings) innings, sum(ba.not_outs) not_outs,
    sum(ba.runs) runs, sum(ba.fifties) fifties, sum(ba.hundreds) hundreds,
    sum(ba.wickets) wickets, sum(ba.runs_conceded) runs_conceded,
    sum(ba.five_wickets) five_wickets, sum(ba.catches) catches,
    sum(ba.stumpings) stumpings, sum(ba.run_outs) run_outs
  FROM public.baseline_adjustments ba
  JOIN staging.mgs gs ON gs.grade = ba.grade AND gs.season = ba.season
  GROUP BY ba.player_id, ba.grade
) r
WHERE t.season IS NULL AND t.grade = r.grade AND t.player_id = r.player_id;

DELETE FROM public.baseline_adjustments ba
USING staging.mgs gs
WHERE gs.grade = ba.grade AND gs.season = ba.season;

-- 2b. Delete prior bulk-derived season snapshot rows for these (grade, season).
DELETE FROM public.player_grade_season_stats t
USING staging.mgs gs
WHERE t.season IS NOT NULL AND t.import_id IS NULL
  AND t.grade = gs.grade AND t.season = gs.season;

-- 2c. Delete prior bulk matches (cascades lines) by deleting their imports.
DELETE FROM public.imports
WHERE id IN (SELECT DISTINCT import_id FROM public.matches WHERE source_key IS NOT NULL);

-- ---------------------------------------------------------------------
-- 3. Import audit rows — one per (grade, season)
-- ---------------------------------------------------------------------
INSERT INTO public.imports (filename, grade, season, kind, row_count, status, imported_at)
SELECT 'Master DB match history', n.app_grade, n.app_season, 'match', count(*), 'committed', now()
FROM staging.mnorm n
GROUP BY n.app_grade, n.app_season;

-- ---------------------------------------------------------------------
-- 4. Matches
-- ---------------------------------------------------------------------
INSERT INTO public.matches
  (import_id, source_key, grade, season, round, stage, competition, match_date,
   venue, result, opponent, opponent_club_id, hhcc_score, opponent_score,
   hhcc_batted_first, abandoned)
SELECT i.id, n.source_key, n.app_grade, n.app_season, n.app_round, n.app_stage,
       n.competition, n.match_date, n.venue, n.hh_result, n.opponent_name,
       n.opponent_club_id, n.hhcc_score, n.opponent_score,
       n.hhcc_batted_first, n.abandoned
FROM staging.mnorm n
JOIN public.imports i
  ON i.filename = 'Master DB match history'
 AND i.kind = 'match'
 AND i.grade = n.app_grade
 AND i.season = n.app_season;

-- master match_id -> app matches.id map
DROP TABLE IF EXISTS staging.mmap;
CREATE TABLE staging.mmap AS
SELECT mt.id AS app_match_id, n.match_id AS master_match_id
FROM public.matches mt
JOIN staging.mnorm n ON n.source_key = mt.source_key;
CREATE INDEX ON staging.mmap (master_match_id);

-- ---------------------------------------------------------------------
-- 5. Halls Head per-player lines (merge batting + bowling per match+player).
--    HH lines with NULL player_id (privacy-masked) cannot link and are dropped.
--    Fielding is not in the master source -> 0 (career fielding stays in the
--    baseline; the peel subtracts 0, so career totals are unaffected).
-- ---------------------------------------------------------------------
CREATE INDEX ON staging.match_batting (match_id, player_id);
CREATE INDEX ON staging.match_bowling (match_id, player_id);

DROP TABLE IF EXISTS staging.hh_bat;
CREATE TABLE staging.hh_bat AS
SELECT match_id, player_id,
  bool_or(lower(coalesce(dismissal, '')) <> 'did not bat')              AS batted,
  min(bat_order)                                                        AS bat_order,
  sum(runs)                                                            AS runs,
  sum(balls)                                                           AS balls,
  sum(fours)                                                           AS fours,
  sum(sixes)                                                           AS sixes,
  bool_or(lower(coalesce(dismissal, '')) LIKE '%not out%')             AS not_out,
  (array_agg(dismissal ORDER BY runs DESC NULLS LAST))[1]              AS dismissal,
  max(runs)                                                            AS hs_runs
FROM staging.match_batting
WHERE is_halls_head = TRUE AND player_id IS NOT NULL
GROUP BY match_id, player_id;

DROP TABLE IF EXISTS staging.hh_bowl;
CREATE TABLE staging.hh_bowl AS
SELECT match_id, player_id,
  TRUE                                                                  AS bowled,
  (array_agg(overs ORDER BY (overs)::numeric DESC NULLS LAST))[1]::text AS overs,
  sum(maidens)                                                          AS maidens,
  sum(runs)                                                             AS runs_conceded,
  sum(wickets)                                                          AS wickets,
  sum(wides)                                                            AS wides,
  sum(no_balls)                                                         AS no_balls
FROM staging.match_bowling
WHERE is_halls_head = TRUE AND player_id IS NOT NULL
GROUP BY match_id, player_id;

INSERT INTO public.match_player_lines
  (match_id, player_id, batted, batting_pos, runs, balls, fours, sixes, not_out,
   dismissal, bowled, overs, maidens, runs_conceded, wickets, wides, no_balls,
   catches, stumpings, run_outs)
SELECT mm.app_match_id,
       COALESCE(b.player_id, w.player_id),
       COALESCE(b.batted, FALSE),
       b.bat_order, b.runs, b.balls, b.fours, b.sixes,
       COALESCE(b.not_out, FALSE),
       b.dismissal,
       COALESCE(w.bowled, FALSE),
       w.overs, w.maidens, w.runs_conceded, w.wickets, w.wides, w.no_balls,
       0, 0, 0
FROM staging.hh_bat b
FULL JOIN staging.hh_bowl w ON w.match_id = b.match_id AND w.player_id = b.player_id
JOIN staging.mmap mm ON mm.master_match_id = COALESCE(b.match_id, w.match_id);

-- ---------------------------------------------------------------------
-- 6. Opposition lines (display only; merge by name, no player link)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS staging.opp_bat;
CREATE TABLE staging.opp_bat AS
SELECT match_id, player_name AS name,
  bool_or(lower(coalesce(dismissal, '')) <> 'did not bat')  AS batted,
  min(bat_order)                                            AS bat_order,
  sum(runs) AS runs, sum(balls) AS balls, sum(fours) AS fours, sum(sixes) AS sixes,
  bool_or(lower(coalesce(dismissal, '')) LIKE '%not out%')  AS not_out,
  (array_agg(dismissal ORDER BY runs DESC NULLS LAST))[1]   AS dismissal
FROM staging.match_batting
WHERE is_halls_head = FALSE AND player_name IS NOT NULL
GROUP BY match_id, player_name;

DROP TABLE IF EXISTS staging.opp_bowl;
CREATE TABLE staging.opp_bowl AS
SELECT match_id, player_name AS name,
  TRUE AS bowled,
  (array_agg(overs ORDER BY (overs)::numeric DESC NULLS LAST))[1]::text AS overs,
  sum(maidens) AS maidens, sum(runs) AS runs_conceded, sum(wickets) AS wickets,
  sum(wides) AS wides, sum(no_balls) AS no_balls
FROM staging.match_bowling
WHERE is_halls_head = FALSE AND player_name IS NOT NULL
GROUP BY match_id, player_name;

INSERT INTO public.match_opposition_lines
  (match_id, name, batted, batting_pos, runs, balls, fours, sixes, not_out,
   dismissal, bowled, overs, maidens, runs_conceded, wickets, wides, no_balls,
   catches, stumpings, run_outs)
SELECT mm.app_match_id,
       COALESCE(b.name, w.name),
       COALESCE(b.batted, FALSE),
       b.bat_order, b.runs, b.balls, b.fours, b.sixes,
       COALESCE(b.not_out, FALSE),
       b.dismissal,
       COALESCE(w.bowled, FALSE),
       w.overs, w.maidens, w.runs_conceded, w.wickets, w.wides, w.no_balls,
       0, 0, 0
FROM staging.opp_bat b
FULL JOIN staging.opp_bowl w ON w.match_id = b.match_id AND w.name = b.name
JOIN staging.mmap mm ON mm.master_match_id = COALESCE(b.match_id, w.match_id);

-- ---------------------------------------------------------------------
-- 7. Derive match-era season snapshots (player_grade_season_stats).
--    EXCLUDE fill-ins (player_id >= 90000): they have no master career row,
--    so keeping them out keeps career/season totals aligned with the master.
--    Their match lines are still loaded above for per-match history.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS staging.season_lines;
CREATE TABLE staging.season_lines AS
SELECT l.player_id, mt.grade, mt.season,
       l.batted, l.not_out, l.runs, l.wickets, l.runs_conceded
FROM public.match_player_lines l
JOIN public.matches mt ON mt.id = l.match_id
WHERE mt.source_key IS NOT NULL AND l.player_id < 90000;
CREATE INDEX ON staging.season_lines (player_id, grade, season);

-- best innings / best bowling per (player, grade, season), precomputed once.
DROP TABLE IF EXISTS staging.hs_t;
CREATE TABLE staging.hs_t AS
SELECT DISTINCT ON (player_id, grade, season)
  player_id, grade, season,
  (runs::text || CASE WHEN not_out THEN '*' ELSE '' END) AS high_score
FROM staging.season_lines
WHERE batted AND runs IS NOT NULL
ORDER BY player_id, grade, season, runs DESC, not_out DESC;

DROP TABLE IF EXISTS staging.bb_t;
CREATE TABLE staging.bb_t AS
SELECT DISTINCT ON (player_id, grade, season)
  player_id, grade, season,
  (wickets::text || '/' || runs_conceded::text) AS best_bowling
FROM staging.season_lines
WHERE wickets IS NOT NULL AND wickets > 0 AND runs_conceded IS NOT NULL
ORDER BY player_id, grade, season, wickets DESC, runs_conceded ASC;

DROP TABLE IF EXISTS staging.season_agg;
CREATE TABLE staging.season_agg AS
SELECT s.player_id, s.grade, s.season,
  count(*)                                                       AS games,
  count(*) FILTER (WHERE s.batted)                              AS innings,
  count(*) FILTER (WHERE s.batted AND s.not_out)                AS not_outs,
  coalesce(sum(s.runs) FILTER (WHERE s.batted), 0)             AS runs,
  count(*) FILTER (WHERE s.batted AND s.runs >= 50 AND s.runs < 100) AS fifties,
  count(*) FILTER (WHERE s.batted AND s.runs >= 100)           AS hundreds,
  coalesce(sum(s.wickets), 0)                                  AS wickets,
  coalesce(sum(s.runs_conceded), 0)                            AS runs_conceded,
  count(*) FILTER (WHERE s.wickets >= 5)                       AS five_wickets
FROM staging.season_lines s
GROUP BY s.player_id, s.grade, s.season;

INSERT INTO public.player_grade_season_stats
  (player_id, grade, season, import_id, games, innings, not_outs, runs,
   high_score, fifties, hundreds, wickets, runs_conceded, best_bowling,
   five_wickets, catches, stumpings, run_outs)
SELECT
  a.player_id, a.grade, a.season, NULL::int,
  NULLIF(a.games, 0), NULLIF(a.innings, 0), NULLIF(a.not_outs, 0), NULLIF(a.runs, 0),
  hs.high_score,
  NULLIF(a.fifties, 0), NULLIF(a.hundreds, 0),
  NULLIF(a.wickets, 0), NULLIF(a.runs_conceded, 0),
  bb.best_bowling,
  NULLIF(a.five_wickets, 0),
  NULL::int, NULL::int, NULL::int
FROM staging.season_agg a
LEFT JOIN staging.hs_t hs USING (player_id, grade, season)
LEFT JOIN staging.bb_t bb USING (player_id, grade, season);

-- ---------------------------------------------------------------------
-- 8. Peel each match-era season out of the season=NULL baseline so the
--    career total stays invariant (mirror lib/baseline-reconcile.ts).
--    Per-season attribution = sequential greedy floor, computed set-based
--    via a running cumulative sum per (player, grade) ordered by season:
--      peeled(season) = LEAST(base, cum) - LEAST(base, cum - season)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS staging.base;
CREATE TABLE staging.base AS
SELECT b.player_id, b.grade,
  coalesce(sum(b.games), 0) games, coalesce(sum(b.innings), 0) innings,
  coalesce(sum(b.not_outs), 0) not_outs, coalesce(sum(b.runs), 0) runs,
  coalesce(sum(b.fifties), 0) fifties, coalesce(sum(b.hundreds), 0) hundreds,
  coalesce(sum(b.wickets), 0) wickets, coalesce(sum(b.runs_conceded), 0) runs_conceded,
  coalesce(sum(b.five_wickets), 0) five_wickets, coalesce(sum(b.catches), 0) catches,
  coalesce(sum(b.stumpings), 0) stumpings, coalesce(sum(b.run_outs), 0) run_outs
FROM public.player_grade_season_stats b
WHERE b.season IS NULL
  AND (b.player_id, b.grade) IN (SELECT player_id, grade FROM staging.season_lines)
GROUP BY b.player_id, b.grade;

-- per (player, grade, season) match-era totals
DROP TABLE IF EXISTS staging.seas;
CREATE TABLE staging.seas AS
SELECT s.player_id, s.grade, s.season,
  coalesce(s.games, 0) games, coalesce(s.innings, 0) innings,
  coalesce(s.not_outs, 0) not_outs, coalesce(s.runs, 0) runs,
  coalesce(s.fifties, 0) fifties, coalesce(s.hundreds, 0) hundreds,
  coalesce(s.wickets, 0) wickets, coalesce(s.runs_conceded, 0) runs_conceded,
  coalesce(s.five_wickets, 0) five_wickets, coalesce(s.catches, 0) catches,
  coalesce(s.stumpings, 0) stumpings, coalesce(s.run_outs, 0) run_outs
FROM public.player_grade_season_stats s
WHERE s.season IS NOT NULL AND s.import_id IS NULL
  AND (s.grade, s.season) IN (SELECT grade, season FROM staging.mgs);

-- per-season peeled delta (>= 0), attributed via running cumulative floor
DROP TABLE IF EXISTS staging.adj;
CREATE TABLE staging.adj AS
WITH cum AS (
  SELECT s.*,
    sum(games)        OVER w AS c_games,        sum(games)        OVER w - games        AS p_games,
    sum(innings)      OVER w AS c_innings,      sum(innings)      OVER w - innings      AS p_innings,
    sum(not_outs)     OVER w AS c_not_outs,     sum(not_outs)     OVER w - not_outs     AS p_not_outs,
    sum(runs)         OVER w AS c_runs,         sum(runs)         OVER w - runs         AS p_runs,
    sum(fifties)      OVER w AS c_fifties,      sum(fifties)      OVER w - fifties      AS p_fifties,
    sum(hundreds)     OVER w AS c_hundreds,     sum(hundreds)     OVER w - hundreds     AS p_hundreds,
    sum(wickets)      OVER w AS c_wickets,      sum(wickets)      OVER w - wickets      AS p_wickets,
    sum(runs_conceded)OVER w AS c_rc,           sum(runs_conceded)OVER w - runs_conceded AS p_rc,
    sum(five_wickets) OVER w AS c_fw,           sum(five_wickets) OVER w - five_wickets AS p_fw,
    sum(catches)      OVER w AS c_catches,      sum(catches)      OVER w - catches      AS p_catches,
    sum(stumpings)    OVER w AS c_stumpings,    sum(stumpings)    OVER w - stumpings    AS p_stumpings,
    sum(run_outs)     OVER w AS c_run_outs,     sum(run_outs)     OVER w - run_outs     AS p_run_outs
  FROM staging.seas s
  WINDOW w AS (PARTITION BY s.player_id, s.grade ORDER BY s.season
               ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
)
SELECT c.player_id, c.grade, c.season,
  LEAST(b.games, c.c_games)             - LEAST(b.games, c.p_games)             AS games,
  LEAST(b.innings, c.c_innings)         - LEAST(b.innings, c.p_innings)         AS innings,
  LEAST(b.not_outs, c.c_not_outs)       - LEAST(b.not_outs, c.p_not_outs)       AS not_outs,
  LEAST(b.runs, c.c_runs)               - LEAST(b.runs, c.p_runs)               AS runs,
  LEAST(b.fifties, c.c_fifties)         - LEAST(b.fifties, c.p_fifties)         AS fifties,
  LEAST(b.hundreds, c.c_hundreds)       - LEAST(b.hundreds, c.p_hundreds)       AS hundreds,
  LEAST(b.wickets, c.c_wickets)         - LEAST(b.wickets, c.p_wickets)         AS wickets,
  LEAST(b.runs_conceded, c.c_rc)        - LEAST(b.runs_conceded, c.p_rc)        AS runs_conceded,
  LEAST(b.five_wickets, c.c_fw)         - LEAST(b.five_wickets, c.p_fw)         AS five_wickets,
  LEAST(b.catches, c.c_catches)         - LEAST(b.catches, c.p_catches)         AS catches,
  LEAST(b.stumpings, c.c_stumpings)     - LEAST(b.stumpings, c.p_stumpings)     AS stumpings,
  LEAST(b.run_outs, c.c_run_outs)       - LEAST(b.run_outs, c.p_run_outs)       AS run_outs
FROM cum c
JOIN staging.base b ON b.player_id = c.player_id AND b.grade = c.grade;

-- 8a. Record the peel (only non-zero rows) for exact reversal / interop.
INSERT INTO public.baseline_adjustments
  (grade, season, player_id, games, innings, not_outs, runs, fifties, hundreds,
   wickets, runs_conceded, five_wickets, catches, stumpings, run_outs)
SELECT grade, season, player_id, games, innings, not_outs, runs, fifties, hundreds,
       wickets, runs_conceded, five_wickets, catches, stumpings, run_outs
FROM staging.adj
WHERE games > 0 OR innings > 0 OR not_outs > 0 OR runs > 0 OR fifties > 0
   OR hundreds > 0 OR wickets > 0 OR runs_conceded > 0 OR five_wickets > 0
   OR catches > 0 OR stumpings > 0 OR run_outs > 0;

-- 8b. Subtract the per-(player, grade) total peel from the season=NULL baseline.
UPDATE public.player_grade_season_stats t SET
  games        = NULLIF(coalesce(t.games, 0)          - p.games, 0),
  innings      = NULLIF(coalesce(t.innings, 0)        - p.innings, 0),
  not_outs     = NULLIF(coalesce(t.not_outs, 0)       - p.not_outs, 0),
  runs         = NULLIF(coalesce(t.runs, 0)           - p.runs, 0),
  fifties      = NULLIF(coalesce(t.fifties, 0)        - p.fifties, 0),
  hundreds     = NULLIF(coalesce(t.hundreds, 0)       - p.hundreds, 0),
  wickets      = NULLIF(coalesce(t.wickets, 0)        - p.wickets, 0),
  runs_conceded= NULLIF(coalesce(t.runs_conceded, 0)  - p.runs_conceded, 0),
  five_wickets = NULLIF(coalesce(t.five_wickets, 0)   - p.five_wickets, 0),
  catches      = NULLIF(coalesce(t.catches, 0)        - p.catches, 0),
  stumpings    = NULLIF(coalesce(t.stumpings, 0)      - p.stumpings, 0),
  run_outs     = NULLIF(coalesce(t.run_outs, 0)       - p.run_outs, 0)
FROM (
  SELECT a.player_id, a.grade,
    sum(a.games) games, sum(a.innings) innings, sum(a.not_outs) not_outs,
    sum(a.runs) runs, sum(a.fifties) fifties, sum(a.hundreds) hundreds,
    sum(a.wickets) wickets, sum(a.runs_conceded) runs_conceded,
    sum(a.five_wickets) five_wickets, sum(a.catches) catches,
    sum(a.stumpings) stumpings, sum(a.run_outs) run_outs
  FROM staging.adj a
  GROUP BY a.player_id, a.grade
) p
WHERE t.season IS NULL AND t.grade = p.grade AND t.player_id = p.player_id;

-- ---------------------------------------------------------------------
-- 9. Recompute aggregates for the affected grades (mirror lib/recompute.ts)
-- ---------------------------------------------------------------------
DELETE FROM public.player_grade_stats WHERE grade IN (SELECT grade FROM staging.mgs);
INSERT INTO public.player_grade_stats
  (player_id, surname, given_name, grade, season, games, innings, not_outs,
   runs, bat_avg, high_score, fifties, hundreds, wickets, runs_conceded,
   bowl_avg, best_bowling, five_wickets, catches, stumpings, run_outs)
SELECT
  s.player_id, p.surname, p.given_name, s.grade, NULL::int,
  NULLIF(COALESCE(SUM(s.games), 0), 0),
  NULLIF(COALESCE(SUM(s.innings), 0), 0),
  NULLIF(COALESCE(SUM(s.not_outs), 0), 0),
  NULLIF(COALESCE(SUM(s.runs), 0), 0),
  CASE WHEN COALESCE(SUM(s.innings), 0) - COALESCE(SUM(s.not_outs), 0) > 0
    THEN COALESCE(SUM(s.runs), 0)::real / (COALESCE(SUM(s.innings), 0) - COALESCE(SUM(s.not_outs), 0))
    ELSE NULL END,
  (SELECT high_score FROM public.player_grade_season_stats x
    WHERE x.player_id = s.player_id AND x.grade = s.grade
      AND x.high_score IS NOT NULL AND x.high_score <> ''
    ORDER BY NULLIF(regexp_replace(x.high_score, '[^0-9]', '', 'g'), '')::int DESC NULLS LAST,
             (x.high_score ~ '\*') DESC
    LIMIT 1),
  NULLIF(COALESCE(SUM(s.fifties), 0), 0),
  NULLIF(COALESCE(SUM(s.hundreds), 0), 0),
  NULLIF(COALESCE(SUM(s.wickets), 0), 0),
  NULLIF(COALESCE(SUM(s.runs_conceded), 0), 0),
  CASE WHEN COALESCE(SUM(s.wickets), 0) > 0
    THEN COALESCE(SUM(s.runs_conceded), 0)::real / SUM(s.wickets)
    ELSE NULL END,
  (SELECT best_bowling FROM public.player_grade_season_stats x
    WHERE x.player_id = s.player_id AND x.grade = s.grade
      AND x.best_bowling IS NOT NULL AND x.best_bowling <> ''
      AND x.best_bowling ~ '^[0-9]+/[0-9]+$'
    ORDER BY split_part(x.best_bowling, '/', 1)::int DESC,
             split_part(x.best_bowling, '/', 2)::int ASC
    LIMIT 1),
  NULLIF(COALESCE(SUM(s.five_wickets), 0), 0),
  NULLIF(COALESCE(SUM(s.catches), 0), 0),
  NULLIF(COALESCE(SUM(s.stumpings), 0), 0),
  NULLIF(COALESCE(SUM(s.run_outs), 0), 0)
FROM public.player_grade_season_stats s
JOIN public.players p ON p.id = s.player_id
WHERE s.grade IN (SELECT grade FROM staging.mgs)
GROUP BY s.player_id, p.surname, p.given_name, s.grade;

-- career totals for affected players
WITH affected AS (
  SELECT DISTINCT player_id FROM public.player_grade_season_stats WHERE grade IN (SELECT grade FROM staging.mgs)
  UNION
  SELECT DISTINCT player_id FROM public.player_grade_stats        WHERE grade IN (SELECT grade FROM staging.mgs)
),
agg AS (
  SELECT a.player_id,
    NULLIF(COALESCE(SUM(s.games), 0),   0) AS total_games,
    NULLIF(COALESCE(SUM(s.runs), 0),    0) AS total_runs,
    NULLIF(COALESCE(SUM(s.wickets), 0), 0) AS total_wickets,
    NULLIF(string_agg(DISTINCT s.grade, ', ' ORDER BY s.grade), '') AS grades_played
  FROM affected a
  LEFT JOIN public.player_grade_stats s ON s.player_id = a.player_id
  GROUP BY a.player_id
)
UPDATE public.players p SET
  total_games   = agg.total_games,
  total_runs    = agg.total_runs,
  total_wickets = agg.total_wickets,
  grades_played = agg.grades_played
FROM agg WHERE p.id = agg.player_id;

-- grade summaries for affected grades
DELETE FROM public.grade_summaries WHERE grade IN (SELECT grade FROM staging.mgs);
INSERT INTO public.grade_summaries
  (grade, players, games, innings, runs, wickets, catches, stumpings, run_outs)
SELECT grade, COUNT(DISTINCT player_id),
  NULLIF(COALESCE(SUM(games), 0), 0), NULLIF(COALESCE(SUM(innings), 0), 0),
  NULLIF(COALESCE(SUM(runs), 0), 0), NULLIF(COALESCE(SUM(wickets), 0), 0),
  NULLIF(COALESCE(SUM(catches), 0), 0), NULLIF(COALESCE(SUM(stumpings), 0), 0),
  NULLIF(COALESCE(SUM(run_outs), 0), 0)
FROM public.player_grade_stats
WHERE grade IN (SELECT grade FROM staging.mgs)
GROUP BY grade;
