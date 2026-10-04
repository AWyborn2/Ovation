-- central_projector: the role and supporting objects for the PlayHQ → central projector.
--
-- Plan: docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md (P1, D1).
--
-- After each PlayHQ sync, the projector copies finished senior matches from `playhq.*` into the
-- central stats tables. It is the only writer to `central`. The app's central handle stays
-- read-only, and the API refuses to project unless this role can write exactly the tables listed
-- in lib/db/src/playhq-ingest/projector-pool.ts (PROJECTOR_WRITABLE).
--
-- Run once as the schema owner (the Replit Database → Production SQL runner, or psql as the
-- database owner), AFTER the central schema and scripts/sql/playhq-schema.sql exist. The script
-- is idempotent: re-running it refreshes the crosswalk seeds and grants. Then set a password out
-- of band:
--
--   alter role central_projector with password '<generated>';
--
-- and build CENTRAL_PROJECTOR_DATABASE_URL from it (production DATABASE_URL with this user).
-- Never commit the password.

-- ── Id allocation ────────────────────────────────────────────────────────────────────────────
-- Central has no sequences: every id came from the external builder (PCA ≈ 1..12k matches, WA
-- projected at 100001+). Projected matches take ids from 1,000,001 up; projected child rows
-- take ids above every existing child id, so the two can never collide with the builder's
-- ranges.
create sequence if not exists central.projected_match_id_seq start with 1000001;
create sequence if not exists central.projected_line_id_seq start with 1;

do $$
declare
  m bigint;
  l bigint;
begin
  select greatest(1000000, coalesce(max(match_id), 0)) into m from central.matches;
  if (select last_value from central.projected_match_id_seq) <= m then
    perform setval('central.projected_match_id_seq', m + 1, false);
  end if;
  select greatest(
           coalesce((select max(id) from central.match_batting), 0),
           coalesce((select max(id) from central.match_bowling), 0),
           coalesce((select max(id) from central.match_rosters), 0),
           coalesce((select max(id) from central.fall_of_wickets), 0),
           coalesce((select max(id) from central.fielding), 0))
    into l;
  -- Start the line sequence at the next round 10M above the builder's ids.
  l := (l / 10000000 + 1) * 10000000;
  if (select last_value from central.projected_line_id_seq) < l then
    perform setval('central.projected_line_id_seq', l, false);
  end if;
end $$;

-- ── Dedupe key ───────────────────────────────────────────────────────────────────────────────
-- A PlayHQ match maps to at most one central match. If the builder left duplicates, the index is
-- skipped with a warning, and the projector refuses to touch the ambiguous ids (it checks too).
do $$
declare dupes int;
begin
  if not exists (select 1 from pg_indexes
                  where schemaname = 'central' and indexname = 'matches_playhq_match_id_uidx') then
    select count(*) into dupes from (
      select playhq_match_id from central.matches
       where playhq_match_id is not null
       group by playhq_match_id having count(*) > 1) d;
    if dupes = 0 then
      create unique index matches_playhq_match_id_uidx
        on central.matches (playhq_match_id) where playhq_match_id is not null;
    else
      raise warning 'central.matches has % duplicated playhq_match_id values; unique index skipped', dupes;
    end if;
  end if;
end $$;

-- ── Crosswalks ───────────────────────────────────────────────────────────────────────────────
-- PlayHQ organisation → central club. Seeded from history: every central match the builder
-- loaded with a playhq_match_id pairs the PlayHQ home/away organisation with the central
-- home/away club. The most frequent pairing wins. Manual rows (source = 'manual') are never
-- overwritten by a re-seed.
create table if not exists central.club_playhq_orgs (
  playhq_org_id text primary key,
  club_id       integer not null,
  source        text    not null default 'history' check (source in ('history', 'manual')),
  votes         integer not null default 0,
  updated_at    timestamptz not null default now()
);

insert into central.club_playhq_orgs (playhq_org_id, club_id, source, votes)
select distinct on (org_id) org_id, club_id, 'history', n
  from (
    select pairs.org_id, pairs.club_id, count(*) as n
      from (
        select lower(pm.home_org_id::text) as org_id, cm.home_club_id as club_id
          from central.matches cm join playhq.matches pm on pm.id::text = cm.playhq_match_id
         where pm.home_org_id is not null and cm.home_club_id is not null
        union all
        select lower(pm.away_org_id::text), cm.away_club_id
          from central.matches cm join playhq.matches pm on pm.id::text = cm.playhq_match_id
         where pm.away_org_id is not null and cm.away_club_id is not null
      ) pairs
     group by pairs.org_id, pairs.club_id
  ) ranked
 order by org_id, n desc, club_id
on conflict (playhq_org_id) do update
   set club_id = excluded.club_id, votes = excluded.votes, updated_at = now()
 where central.club_playhq_orgs.source = 'history';

-- PlayHQ grade name → central grade label. The key is the PlayHQ grade name normalised by
-- central.playhq_grade_key() (lowercased, season tokens such as "2025/26" or "2025-26" removed,
-- whitespace collapsed), so one row serves every season. Seeded from history, most frequent wins;
-- manual rows survive re-seeds.
create or replace function central.playhq_grade_key(name text) returns text
  language sql immutable as $$
  select btrim(regexp_replace(
           regexp_replace(lower(coalesce(name, '')),
                          '(19|20)[0-9]{2}\s*[-/]\s*([0-9]{2}|(19|20)[0-9]{2})|\m(19|20)[0-9]{2}\M', ' ', 'g'),
           '\s+', ' ', 'g'))
$$;

create table if not exists central.grade_playhq_map (
  grade_key     text primary key,
  central_grade text not null,
  source        text not null default 'history' check (source in ('history', 'manual')),
  votes         integer not null default 0,
  updated_at    timestamptz not null default now()
);

insert into central.grade_playhq_map (grade_key, central_grade, source, votes)
select distinct on (grade_key) grade_key, central_grade, 'history', n
  from (
    select central.playhq_grade_key(g.name) as grade_key, cm.grade as central_grade, count(*) as n
      from central.matches cm
      join playhq.matches pm on pm.id::text = cm.playhq_match_id
      join playhq.grades g   on g.id = pm.grade_id
     where cm.grade is not null and g.name is not null
     group by 1, 2
  ) ranked
 where grade_key <> ''
 order by grade_key, n desc, central_grade
on conflict (grade_key) do update
   set central_grade = excluded.central_grade, votes = excluded.votes, updated_at = now()
 where central.grade_playhq_map.source = 'history';

-- ── The role ─────────────────────────────────────────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'central_projector') then
    create role central_projector login nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;

grant usage on schema central to central_projector;
grant usage on schema playhq to central_projector;
grant select on all tables in schema central to central_projector;
grant select on all tables in schema playhq to central_projector;
grant select, insert, update, delete on
  central.matches, central.match_batting, central.match_bowling, central.match_rosters,
  central.fall_of_wickets, central.fielding, central.players
  to central_projector;
grant usage, select on central.projected_match_id_seq, central.projected_line_id_seq
  to central_projector;
grant execute on function central.playhq_grade_key(text) to central_projector;

-- Defensive: nothing else is writable (a broad grant made earlier is undone here).
revoke insert, update, delete, truncate on
  central.clubs, central.premiers, central.ladder, central.club_name_history,
  central.club_playhq_orgs, central.grade_playhq_map
  from central_projector;
revoke truncate on
  central.matches, central.match_batting, central.match_bowling, central.match_rosters,
  central.fall_of_wickets, central.fielding, central.players
  from central_projector;
do $$
declare s text;
begin
  foreach s in array array['wa', 'playhq'] loop
    if exists (select 1 from pg_namespace where nspname = s) then
      execute format('revoke insert, update, delete, truncate on all tables in schema %I from central_projector', s);
    end if;
  end loop;
end $$;

alter role central_projector set statement_timeout = '60s';
alter role central_projector set idle_in_transaction_session_timeout = '60s';
