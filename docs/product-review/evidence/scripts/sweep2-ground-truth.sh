#!/bin/bash
# sweep2-ground-truth.sh — direct-SQL ground truth for the club sweep 2 tester
# (tenants 7-11 reading from schema `central`). READ-ONLY.
# Leaderboard semantics mirror lib/db/src/central-queries.ts:
#   innings excludes 'did not bat'; not-outs from dismissal_type/dismissal text;
#   games = distinct matches from batting UNION roster restricted to players with a batting line.
DB='postgresql://ovation:ovation@localhost:5432/ovation'
PSQL="psql $DB -P pager=off -q"

for C in 7 8 9 10 11; do
echo "################ CLUB $C ################"
$PSQL <<EOF
-- 1. Home headline totals (mirrors centralClubTotals)
WITH cm AS (SELECT match_id, grade FROM central.matches WHERE home_club_id=$C OR away_club_id=$C)
SELECT
 (SELECT count(DISTINCT nullif(r.participant_id,'')) FROM central.match_rosters r WHERE r.club_id=$C AND r.match_id IN (SELECT match_id FROM cm)) AS players,
 (SELECT count(*) FROM central.match_rosters r WHERE r.club_id=$C AND r.match_id IN (SELECT match_id FROM cm)) AS games,
 (SELECT coalesce(sum(b.runs),0) FROM central.match_batting b WHERE b.club_id=$C AND b.match_id IN (SELECT match_id FROM cm)) AS runs,
 (SELECT coalesce(sum(w.wickets),0) FROM central.match_bowling w WHERE w.club_id=$C AND w.match_id IN (SELECT match_id FROM cm)) AS wickets,
 (SELECT count(DISTINCT grade) FROM cm) AS grades;

-- 2. B Grade batting leaderboard top 5
WITH cm AS (SELECT match_id FROM central.matches WHERE (home_club_id=$C OR away_club_id=$C) AND grade='B Grade'),
i AS (
  SELECT participant_id, match_id, coalesce(runs,0) AS runs,
    CASE WHEN lower(trim(coalesce(dismissal,'')))='did not bat' THEN 'dnb'
         WHEN lower(trim(coalesce(dismissal,''))) IN ('retired hurt','retired not out') THEN 'notout'
         WHEN lower(trim(coalesce(dismissal_type,''))) IN ('not out','') THEN 'notout'
         ELSE 'out' END AS kind
  FROM central.match_batting
  WHERE club_id=$C AND match_id IN (SELECT match_id FROM cm)
    AND participant_id IS NOT NULL AND participant_id<>''),
bat AS (
  SELECT participant_id,
    (count(*) FILTER (WHERE kind<>'dnb'))::int AS innings,
    coalesce(sum(runs) FILTER (WHERE kind<>'dnb'),0)::int AS runs,
    (count(*) FILTER (WHERE kind='notout'))::int AS not_outs,
    (count(*) FILTER (WHERE kind<>'dnb' AND runs>=100))::int AS hundreds,
    (count(*) FILTER (WHERE kind<>'dnb' AND runs>=50 AND runs<100))::int AS fifties,
    max(CASE WHEN kind<>'dnb' THEN runs*2+(kind='notout')::int END) AS hs_enc
  FROM i GROUP BY 1),
games AS (
  SELECT participant_id, count(DISTINCT match_id)::int AS games FROM (
    SELECT participant_id, match_id FROM i
    UNION
    SELECT participant_id, match_id FROM central.match_rosters
    WHERE club_id=$C AND match_id IN (SELECT match_id FROM cm)
      AND participant_id IN (SELECT participant_id FROM bat)) a
  GROUP BY 1)
SELECT p.display_name, g.games, b.innings, b.not_outs, b.runs,
  round(b.runs::numeric/nullif(b.innings-b.not_outs,0),2) AS avg,
  (b.hs_enc>>1)::text || CASE WHEN b.hs_enc%2=1 THEN '*' ELSE '' END AS hs,
  b.hundreds, b.fifties
FROM bat b JOIN games g USING(participant_id) LEFT JOIN central.players p USING(participant_id)
ORDER BY g.games DESC, b.runs DESC, reverse(split_part(reverse(p.display_name),' ',1)) ASC
LIMIT 5;

-- 3. Records: most games / most runs / most wickets / highest score / best bowling
WITH cm AS (SELECT match_id FROM central.matches WHERE home_club_id=$C OR away_club_id=$C),
apps AS (
  SELECT participant_id, match_id FROM central.match_rosters WHERE club_id=$C AND match_id IN (SELECT match_id FROM cm) AND coalesce(participant_id,'')<>''
  UNION SELECT participant_id, match_id FROM central.match_batting WHERE club_id=$C AND match_id IN (SELECT match_id FROM cm) AND coalesce(participant_id,'')<>''
  UNION SELECT participant_id, match_id FROM central.match_bowling WHERE club_id=$C AND match_id IN (SELECT match_id FROM cm) AND coalesce(participant_id,'')<>'')
SELECT 'most_games' AS rec, p.display_name, count(DISTINCT a.match_id)::text AS value
FROM apps a LEFT JOIN central.players p USING(participant_id) GROUP BY p.display_name ORDER BY count(DISTINCT a.match_id) DESC LIMIT 2;

WITH cm AS (SELECT match_id FROM central.matches WHERE home_club_id=$C OR away_club_id=$C)
SELECT 'most_runs' AS rec, p.display_name, sum(b.runs)::text FROM central.match_batting b
LEFT JOIN central.players p USING(participant_id)
WHERE b.club_id=$C AND b.match_id IN (SELECT match_id FROM cm) GROUP BY p.display_name ORDER BY sum(b.runs) DESC NULLS LAST LIMIT 2;

WITH cm AS (SELECT match_id FROM central.matches WHERE home_club_id=$C OR away_club_id=$C)
SELECT 'most_wickets' AS rec, p.display_name, sum(w.wickets)::text FROM central.match_bowling w
LEFT JOIN central.players p USING(participant_id)
WHERE w.club_id=$C AND w.match_id IN (SELECT match_id FROM cm) GROUP BY p.display_name ORDER BY sum(w.wickets) DESC NULLS LAST LIMIT 2;

WITH cm AS (SELECT match_id FROM central.matches WHERE home_club_id=$C OR away_club_id=$C)
SELECT 'highest_score' AS rec, p.display_name,
  b.runs::text || CASE WHEN lower(coalesce(b.dismissal_type,'')) = 'not out' THEN '*' ELSE '' END, m.grade
FROM central.match_batting b LEFT JOIN central.players p USING(participant_id)
JOIN central.matches m ON m.match_id=b.match_id
WHERE b.club_id=$C AND b.match_id IN (SELECT match_id FROM cm) ORDER BY b.runs DESC NULLS LAST LIMIT 3;

WITH cm AS (SELECT match_id FROM central.matches WHERE home_club_id=$C OR away_club_id=$C)
SELECT 'best_bowling' AS rec, p.display_name, w.wickets::text||'/'||w.runs, m.grade
FROM central.match_bowling w LEFT JOIN central.players p USING(participant_id)
JOIN central.matches m ON m.match_id=w.match_id
WHERE w.club_id=$C AND w.match_id IN (SELECT match_id FROM cm) ORDER BY w.wickets DESC NULLS LAST, w.runs ASC LIMIT 3;
EOF
done

# 4. Chosen player careers (crosswalk tenant player_id -> GUID)
echo "################ CHOSEN PLAYER CAREERS ################"
for TP in "7 13" "8 14" "9 16" "10 22" "11 17"; do
set -- $TP; T=$1; P=$2
$PSQL <<EOF
WITH x AS (SELECT participant_id FROM player_id_map WHERE tenant_id=$T AND player_id=$P),
c AS (SELECT central_club_id AS club FROM tenants WHERE id=$T),
cm AS (SELECT match_id FROM central.matches m, c WHERE m.home_club_id=c.club OR m.away_club_id=c.club),
apps AS (
  SELECT r.match_id FROM central.match_rosters r, c, x WHERE r.club_id=c.club AND r.participant_id=x.participant_id AND r.match_id IN (SELECT match_id FROM cm)
  UNION SELECT b.match_id FROM central.match_batting b, c, x WHERE b.club_id=c.club AND b.participant_id=x.participant_id AND b.match_id IN (SELECT match_id FROM cm)
  UNION SELECT w.match_id FROM central.match_bowling w, c, x WHERE w.club_id=c.club AND w.participant_id=x.participant_id AND w.match_id IN (SELECT match_id FROM cm))
SELECT $T AS tenant, $P AS player_id, (SELECT participant_id FROM x) AS guid,
  (SELECT display_name FROM central.players, x WHERE central.players.participant_id=x.participant_id) AS name,
  (SELECT count(*) FROM apps) AS games,
  (SELECT coalesce(sum(b.runs),0) FROM central.match_batting b, c, x WHERE b.club_id=c.club AND b.participant_id=x.participant_id AND b.match_id IN (SELECT match_id FROM cm)) AS runs,
  (SELECT coalesce(sum(w.wickets),0) FROM central.match_bowling w, c, x WHERE w.club_id=c.club AND w.participant_id=x.participant_id AND w.match_id IN (SELECT match_id FROM cm)) AS wickets,
  (SELECT coalesce(sum(w.runs),0) FROM central.match_bowling w, c, x WHERE w.club_id=c.club AND w.participant_id=x.participant_id AND w.match_id IN (SELECT match_id FROM cm)) AS runs_conceded,
  (SELECT max(w.wickets) FROM central.match_bowling w, c, x WHERE w.club_id=c.club AND w.participant_id=x.participant_id AND w.match_id IN (SELECT match_id FROM cm)) AS max_wkts_inn;
EOF
done

# 5. Chosen match scorecards
echo "################ CHOSEN MATCH SCORECARDS ################"
for M in 345 340 339 334; do
$PSQL <<EOF
SELECT match_id, grade, season, round, home_team, away_team, home_score, away_score, result_text, venue FROM central.matches WHERE match_id=$M;
SELECT b.club_id, b.bat_order, p.display_name, b.runs, b.balls, b.fours, b.sixes, b.strike_rate, b.dismissal FROM central.match_batting b LEFT JOIN central.players p USING(participant_id) WHERE b.match_id=$M ORDER BY b.club_id, b.bat_order;
SELECT w.club_id, p.display_name, w.overs, w.maidens, w.runs, w.wickets, w.economy, w.wides, w.no_balls FROM central.match_bowling w LEFT JOIN central.players p USING(participant_id) WHERE w.match_id=$M ORDER BY w.club_id, w.id;
EOF
done
