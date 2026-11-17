-- A read-only login for diagnostics (an assistant session on Ash's own computer, or any
-- ad-hoc query tool). It can read the app's tables and the shared stats, and change nothing.
--
-- Run once in Replit's Production SQL runner. Before running, replace
-- CHOOSE-A-LONG-RANDOM-PASSWORD with a password you generate yourself (a password manager's
-- 32+ character generator is ideal). Never paste that password into a chat, a commit or a
-- file inside the repository.
--
-- Safe to run again: it creates the role only if missing and re-applies the grants.
-- To remove the role later, see the bottom of this file.

-- 1. The role: can log in, nothing else. Every session it opens is read-only, queries stop
--    after 30 seconds, and it can hold at most 3 connections.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ovation_readonly') then
    create role ovation_readonly login password 'CHOOSE-A-LONG-RANDOM-PASSWORD'
      nosuperuser nocreatedb nocreaterole noinherit connection limit 3;
  end if;
end $$;

alter role ovation_readonly set default_transaction_read_only = on;
alter role ovation_readonly set statement_timeout = '30s';
alter role ovation_readonly set idle_in_transaction_session_timeout = '60s';

-- 2. Read access to every table in the app's schema and the stats schemas that exist here
--    (central, the PlayHQ landing tables, the WA load). Tables created later by the account
--    running this script are readable too.
do $$
declare s text;
begin
  execute format('grant connect on database %I to ovation_readonly', current_database());
  foreach s in array array['public', 'central', 'playhq', 'wa'] loop
    if exists (select 1 from pg_namespace where nspname = s) then
      execute format('grant usage on schema %I to ovation_readonly', s);
      execute format('grant select on all tables in schema %I to ovation_readonly', s);
      execute format('alter default privileges in schema %I grant select on tables to ovation_readonly', s);
    end if;
  end loop;
end $$;

-- 3. Never readable, even read-only: password hashes, login and reset tokens, connected
--    social and Figma account tokens, the honour-board kiosk token, and members' contact
--    details (phones and emails). None of these is needed to look into stats.
do $$
declare t text;
begin
  foreach t in array array[
    'admins', 'platform_admins', 'admin_password_resets', 'captains',
    'availability_tokens', 'figma_connections', 'figma_connection_pending',
    'social_connections', 'social_connection_pending', 'honour_display_settings',
    'squad_members', 'email_list_members'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from ovation_readonly', t);
    end if;
  end loop;
end $$;

-- 4. Check: should list the schemas above with select = true, and the step-3 tables with
--    select = false.
select n.nspname as schema, c.relname as table_name,
       has_table_privilege('ovation_readonly', c.oid, 'select') as can_select
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where c.relkind in ('r', 'v', 'm', 'p')
   and n.nspname in ('public', 'central', 'playhq', 'wa')
   and (c.relname in ('players', 'admins', 'squad_members', 'social_connections')
        or n.nspname <> 'public' and c.relname in ('matches', 'players'))
 order by 1, 2;

-- To remove the role later (run all four):
--   revoke all on all tables in schema public, central, playhq from ovation_readonly;
--   alter default privileges in schema public, central, playhq revoke select on tables from ovation_readonly;
--   revoke all on schema public, central, playhq from ovation_readonly;
--   drop role ovation_readonly;
-- (Add wa to each list if that schema exists.)
