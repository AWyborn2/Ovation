-- sweep1 ground truth queries. Usage: psql -v club=N -f sweep1-groundtruth.sql
-- (a) home tile totals
select 'totals' as q,
  (select count(distinct nullif(participant_id,'')) from central.match_rosters where club_id = :club) as players,
  (select count(*) from central.match_rosters where club_id = :club) as games_appearances,
  (select coalesce(sum(runs),0) from central.match_batting where club_id = :club) as runs,
  (select coalesce(sum(wickets),0) from central.match_bowling where club_id = :club) as wickets,
  (select count(*) from central.matches where home_club_id = :club or away_club_id = :club) as club_matches;

-- (b) A Grade batting leaderboard (mirror central-queries.ts semantics)
with m as (
  select match_id from central.matches
  where (home_club_id = :club or away_club_id = :club) and grade = 'A Grade'
),
i as (
  select participant_id, match_id, coalesce(runs,0) as runs,
    case
      when lower(trim(coalesce(dismissal,''))) = 'did not bat' then 'dnb'
      when lower(trim(coalesce(dismissal,''))) in ('retired hurt','retired not out') then 'notout'
      when lower(trim(coalesce(dismissal_type,''))) in ('not out','') then 'notout'
      else 'out'
    end as kind
  from central.match_batting
  where club_id = :club and match_id in (select match_id from m)
    and participant_id is not null and participant_id <> ''
),
bat as (
  select participant_id,
    (count(*) filter (where kind <> 'dnb'))::int as innings,
    coalesce(sum(runs) filter (where kind <> 'dnb'),0)::int as runs,
    (count(*) filter (where kind = 'notout'))::int as not_outs,
    max(case when kind <> 'dnb' then runs*2 + (kind='notout')::int end) as hs_enc
  from i group by participant_id
),
games as (
  select participant_id, count(distinct match_id)::int as games from (
    select participant_id, match_id from i
    union
    select participant_id, match_id from central.match_rosters
    where club_id = :club and match_id in (select match_id from m)
      and participant_id in (select participant_id from bat)
  ) apps group by participant_id
)
select p.display_name, g.games, b.innings, b.not_outs, b.runs,
  (coalesce(b.hs_enc,0)/2)::int || case when coalesce(b.hs_enc,0)%2=1 then '*' else '' end as hs,
  case when b.innings - b.not_outs > 0 then round(b.runs::numeric/(b.innings-b.not_outs),2) else null end as avg
from bat b join games g using (participant_id)
left join central.players p using (participant_id)
order by g.games desc, b.runs desc, p.display_name
limit 5;
