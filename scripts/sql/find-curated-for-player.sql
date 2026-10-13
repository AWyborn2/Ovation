-- Read-only: every curated Halls Head row that names one player in a range of seasons
-- (awards, premierships, centuries, five-wicket hauls, partnerships, honour board
-- records, club roles). Used to find what the club credited to Dan Howell (player 47)
-- for the 2013/14–2016/17 seasons that turned out to be Tannah Dunning's.
-- Change the player id, surname and season range to look at anyone else.
with p(player_id, surname, from_year, to_year) as (values (47, 'Howell', 2013, 2016))
select 'award_winners' as tbl, w.id, w.season::text as season, a.title as detail, w.name as who
  from award_winners w join awards a on a.id = w.award_id, p
 where w.tenant_id = 1 and w.season between p.from_year and p.to_year
   and (w.player_id = p.player_id or p.player_id = any(w.player_ids) or w.name ilike '%' || p.surname || '%')
union all
select 'premiership_players', pp.id, pr.year::text, pr.grade, pp.name
  from premiership_players pp join premierships pr on pr.id = pp.premiership_id, p
 where pr.tenant_id = 1 and pr.year between p.from_year and p.to_year + 1
   and (pp.player_id = p.player_id or pp.name ilike '%' || p.surname || '%')
union all
select 'centuries', c.id, c.season, c.grade || ' ' || coalesce(c.score, ''), c.batsman
  from centuries c, p
 where c.tenant_id = 1 and substring(c.season from '[0-9]{4}')::int between p.from_year and p.to_year
   and (c.player_id = p.player_id or c.batsman ilike '%' || p.surname || '%')
union all
select 'five_wicket_hauls', f.id, f.season, f.grade || ' ' || coalesce(f.figures, ''), f.bowler
  from five_wicket_hauls f, p
 where f.tenant_id = 1 and substring(f.season from '[0-9]{4}')::int between p.from_year and p.to_year
   and (f.player_id = p.player_id or f.bowler ilike '%' || p.surname || '%')
union all
select 'partnership_records', r.id, r.season, r.grade || ' ' || r.wicket || ' wkt ' || r.runs, r.batsmen
  from partnership_records r, p
 where r.tenant_id = 1 and substring(r.season from '[0-9]{4}')::int between p.from_year and p.to_year
   and r.batsmen ilike '%' || p.surname || '%'
union all
select 'partnerships_50plus', r.id, r.season, r.grade || ' ' || r.wicket || ' wkt ' || r.runs, r.batsmen
  from partnerships_50plus r, p
 where r.tenant_id = 1 and substring(r.season from '[0-9]{4}')::int between p.from_year and p.to_year
   and r.batsmen ilike '%' || p.surname || '%'
union all
select 'club_roles', r.id, r.season::text, coalesce(r.grade, '') || ' ' || r.role, r.name
  from club_roles r, p
 where r.tenant_id = 1 and r.season between p.from_year and p.to_year
   and (r.player_id = p.player_id or r.name ilike '%' || p.surname || '%')
union all
select 'honour_board_records', h.id, null, h.category || ' ' || coalesce(h.value, ''), h.name
  from honour_board_records h, p
 where h.tenant_id = 1 and h.name ilike '%' || p.surname || '%'
order by 1, 3;
