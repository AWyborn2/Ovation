-- Read-only diagnosis of one Halls Head player's career after the cut-over to central
-- reads: where native figures and central + club-history figures part ways.
-- Run each query in the Production SQL runner. Nothing here writes.
-- Change the two name patterns to look at a different player.

-- 1. The native player row(s) and the central identities (GUIDs) mapped to them.
select p.id as native_id, p.given_name, p.surname, p.total_games, p.total_runs,
       m.participant_id, cp.display_name as central_name
  from players p
  left join player_id_map m on m.tenant_id = 1 and m.player_id = p.id
  left join central.players cp on cp.participant_id = m.participant_id
 where p.surname ilike 'Howell' and p.given_name ilike 'Dan%';

-- 2. Every central identity with that surname who played for Halls Head (club 1),
--    whether the crosswalk maps it and to whom. An unmapped GUID with games here
--    is games the profile loses.
select r.participant_id, cp.display_name,
       count(distinct r.match_id) as hh_matches,
       min(m.season) as first_season, max(m.season) as last_season,
       pm.player_id as mapped_to_native_id
  from central.match_rosters r
  join central.matches m on m.match_id = r.match_id
  left join central.players cp on cp.participant_id = r.participant_id
  left join player_id_map pm on pm.tenant_id = 1 and pm.participant_id = r.participant_id
 where r.club_id = 1 and (cp.display_name ilike '%Howell%' or r.player_name ilike '%Howell%')
 group by r.participant_id, cp.display_name, pm.player_id
 order by hh_matches desc;

-- 3. Season by season: native snapshot figures beside what central has for the
--    mapped GUIDs and what the club history layer now holds.
with me as (
  select id from players where surname ilike 'Howell' and given_name ilike 'Dan%'
), guids as (
  select participant_id from player_id_map where tenant_id = 1 and player_id in (select id from me)
), native as (
  select grade, season, sum(games) as games, sum(runs) as runs, sum(wickets) as wkts
    from player_grade_season_stats where player_id in (select id from me)
   group by grade, season
), central_g as (
  select m.grade as central_grade, substring(m.season from '[0-9]{4}')::int as season,
         count(distinct r.match_id) as games
    from central.match_rosters r join central.matches m on m.match_id = r.match_id
   where r.club_id = 1 and r.participant_id in (select participant_id from guids)
   group by 1, 2
), central_r as (
  select m.grade as central_grade, substring(m.season from '[0-9]{4}')::int as season,
         sum(b.runs) as runs
    from central.match_batting b join central.matches m on m.match_id = b.match_id
   where b.club_id = 1 and b.participant_id in (select participant_id from guids)
   group by 1, 2
), history as (
  select grade, season, grain, sum(games) as games, sum(runs) as runs
    from club_history_rows where tenant_id = 1 and player_id in (select id from me)
   group by grade, season, grain
)
select 'native' as source, grade, season, null as grain, games, runs from native
union all
select 'central', central_grade, g.season, null, g.games, r.runs
  from central_g g left join central_r r using (central_grade, season)
union all
select 'history', grade, season, grain, games, runs from history
order by 2, 3 nulls first, 1;

-- 4. The boundaries in force (seasons before a grade's boundary come from history,
--    seasons from it on come from central).
select grade, start_season from club_history_boundaries where tenant_id = 1 order by grade;
