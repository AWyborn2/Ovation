-- playhq_ingest — the database role behind PLAYHQ_INGEST_DATABASE_URL.
--
-- The API's scheduled-ingest endpoint (POST /api/internal/playhq/ingest) writes `playhq.*`
-- through this role and nothing else. It may read and write schema `playhq` and has NO
-- privilege on `central` or `wa`: the association dataset stays read-only to the app, and
-- the API refuses to ingest if this role turns out to be able to write there
-- (lib/db/src/playhq-ingest/pool.ts, assertIngestScope).
--
-- Run once as the schema owner (Supabase SQL editor / psql as `postgres`), AFTER
-- scripts/sql/playhq-schema.sql. Idempotent. Then set a password out of band:
--
--   alter role playhq_ingest with password '<generated>';
--
-- and build PLAYHQ_INGEST_DATABASE_URL from it. On Supabase's session pooler the user name
-- is `playhq_ingest.<project-ref>`, e.g.
--   postgresql://playhq_ingest.<ref>:<password>@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres
-- Never commit the password.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'playhq_ingest') then
    create role playhq_ingest login nosuperuser nocreatedb nocreaterole noinherit;
  end if;
end $$;

-- playhq: read + write rows (no DDL — schema changes stay with playhq-schema.sql).
grant usage on schema playhq to playhq_ingest;
grant select, insert, update on all tables in schema playhq to playhq_ingest;
grant usage, select on all sequences in schema playhq to playhq_ingest;
alter default privileges in schema playhq grant select, insert, update on tables to playhq_ingest;
alter default privileges in schema playhq grant usage, select on sequences to playhq_ingest;

-- central / wa: nothing. Revoke defensively in case a broad grant was made earlier.
do $$
declare s text;
begin
  foreach s in array array['central', 'wa'] loop
    if exists (select 1 from pg_namespace where nspname = s) then
      execute format('revoke all on all tables in schema %I from playhq_ingest', s);
      execute format('revoke all on schema %I from playhq_ingest', s);
    end if;
  end loop;
end $$;

-- Long loads are batched statements; keep each bounded, and never sit in an open transaction.
alter role playhq_ingest set statement_timeout = '120s';
alter role playhq_ingest set idle_in_transaction_session_timeout = '60s';
