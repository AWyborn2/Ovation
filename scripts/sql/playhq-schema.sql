-- playhq.* — raw landing schema for data collected from play.cricket.com.au (PlayHQ's public
-- grassroots proxy) by the `playcricket-stats-scraper` skill and loaded by
-- `scripts/src/playhq-load.ts`.
--
-- Every row is keyed on the PlayHQ GUID the site itself uses (organisation, season, grade,
-- team, match, participant, innings, ball), so re-loads are idempotent upserts and joins to
-- `central.*` / `wa.*` are exact-id joins (participant_id, playhq_match_id) — never name
-- matches. `raw` columns keep the verbatim payload so a column we did not model can be
-- backfilled later without re-scraping.
--
-- Provenance / governance: this is scraped public-site data under the pilot-only,
-- non-commercial framing in CLAUDE.md ("Data governance"). It is a landing zone, not the app's
-- read path — nothing in `artifacts/` reads `playhq.*`; projection into `central.*` (which the
-- app does read) is a separate, reviewed step. Lives in the same Postgres as `central` and
-- `wa` (CENTRAL_DATABASE_URL), written only by build/ops tooling — never by the app.
create schema if not exists playhq;

create table if not exists playhq.scrape_runs (
  id            bigserial primary key,
  source_file   text,
  org_id        uuid,
  plan          jsonb,
  exported_at   timestamptz,
  loaded_at     timestamptz not null default now(),
  counts        jsonb,
  notes         text
);

create table if not exists playhq.organisations (
  id          uuid primary key,
  name        text,
  short_name  text,
  logo_url    text,
  updated_at  timestamptz not null default now()
);

create table if not exists playhq.seasons (
  id          uuid primary key,
  org_id      uuid not null,            -- organisation the season list was read from
  name        text not null,            -- "Summer 2025/26"
  start_date  timestamptz,
  is_current  boolean,
  updated_at  timestamptz not null default now()
);

create table if not exists playhq.grades (
  id             uuid primary key,      -- one grade in one season
  name           text not null,
  season_id      uuid,
  season_name    text,
  owner_org_id   uuid,                  -- association that runs the grade
  source_org_id  uuid,                  -- organisation whose discovery found it (club or assoc)
  is_junior      boolean not null default false,
  raw            jsonb,
  updated_at     timestamptz not null default now()
);
create index if not exists playhq_grades_season_idx on playhq.grades (season_id);

create table if not exists playhq.teams (
  id            uuid primary key,       -- season-specific team GUID
  grade_id      uuid,
  name          text,
  display_name  text,
  org_id        uuid,
  updated_at    timestamptz not null default now()
);
create index if not exists playhq_teams_grade_idx on playhq.teams (grade_id);
create index if not exists playhq_teams_org_idx on playhq.teams (org_id);

-- Fixtures AND results: every match the grade listing returns, whatever its status.
create table if not exists playhq.matches (
  id                uuid primary key,
  grade_id          uuid not null,
  status            text,               -- UPCOMING / PENDING / COMPLETED / ABANDONED / ...
  status_id         integer,
  match_type        text,               -- One Day / Two Day / T20 ...
  match_type_id     integer,
  round_id          uuid,
  round_name        text,
  round_short       text,
  start_at          timestamptz,        -- first scheduled day
  end_at            timestamptz,        -- last scheduled day (multi-day matches)
  match_days        integer,
  venue_name        text,
  venue_line1       text,
  venue_suburb      text,
  venue_state       text,
  venue_postcode    text,
  surface_name      text,
  latitude          double precision,
  longitude         double precision,
  result_text       text,
  home_team_id      uuid,
  home_team_name    text,
  home_org_id       uuid,
  home_score        text,
  home_overs        numeric,
  away_team_id      uuid,
  away_team_name    text,
  away_org_id       uuid,
  away_score        text,
  away_overs        numeric,
  winner_team_id    uuid,
  is_live_streaming boolean,
  raw               jsonb not null,
  first_seen_at     timestamptz not null default now(),
  fetched_at        timestamptz not null,
  updated_at        timestamptz not null default now()
);
create index if not exists playhq_matches_grade_idx on playhq.matches (grade_id);
create index if not exists playhq_matches_start_idx on playhq.matches (start_at);
create index if not exists playhq_matches_status_idx on playhq.matches (status);
create index if not exists playhq_matches_home_org_idx on playhq.matches (home_org_id);
create index if not exists playhq_matches_away_org_idx on playhq.matches (away_org_id);

-- Written by the loader whenever a re-load changes a fixture-facing field on an existing
-- match (start time, venue, teams, status, result). This is the weekly "what changed" feed.
create table if not exists playhq.fixture_changes (
  id          bigserial primary key,
  match_id    uuid not null,
  grade_id    uuid,
  changed_at  timestamptz not null default now(),
  field       text not null,
  old_value   text,
  new_value   text
);
create index if not exists playhq_fixture_changes_match_idx on playhq.fixture_changes (match_id);
create index if not exists playhq_fixture_changes_at_idx on playhq.fixture_changes (changed_at);

-- Season ladder as published (one row per ladder table x team; grades can publish several
-- ladders, e.g. "One Day" and "Two Day").
create table if not exists playhq.ladders (
  grade_id             uuid not null,
  ladder_name          text not null,
  team_id              uuid not null,
  team_name            text,
  org_id               uuid,
  rank                 integer,
  played               integer,
  competition_points   numeric,
  bonus_points         numeric,
  quotient             numeric,
  net_run_rate         numeric,
  won                  integer,
  lost                 integer,
  ties                 integer,
  no_results           integer,
  byes                 integer,
  forfeits             integer,
  disqualifications    integer,
  adjustments          numeric,
  runs_for             integer,
  overs_faced          numeric,
  wickets_lost         integer,
  runs_against         integer,
  overs_bowled         numeric,
  wickets_taken        integer,
  includes_adjustments boolean,
  includes_unofficial  boolean,
  raw                  jsonb,
  fetched_at           timestamptz not null,
  primary key (grade_id, ladder_name, team_id)
);

-- Full names: the batting / bowling / fielding grade reports expose "Surname, Firstname" for
-- the same participant GUID the scorecards use. Coverage is a source-side limit (junior
-- pathway grades never publish names) — a missing full_name is expected, not an error.
create table if not exists playhq.players (
  participant_id  uuid primary key,
  full_name       text,
  short_name      text,
  last_org_id     uuid,
  last_org_name   text,
  updated_at      timestamptz not null default now()
);

create table if not exists playhq.player_grade_stats (
  grade_id        uuid not null,
  participant_id  uuid not null,
  full_name       text,
  short_name      text,
  org_id          uuid,
  org_name        text,
  matches         integer,
  batting         jsonb,               -- verbatim `statistics` block of the batting report
  bowling         jsonb,
  fielding        jsonb,
  fetched_at      timestamptz not null,
  primary key (grade_id, participant_id)
);

-- Scorecards (IncludeScorecard) — raw plus normalised lines. Same shapes the
-- playhq-season-scraper skill has used since 2026.
create table if not exists playhq.scorecards (
  match_id        uuid primary key,
  grade_id        uuid,
  status          text,
  is_ball_by_ball boolean,
  result_text     text,
  raw             jsonb not null,
  fetched_at      timestamptz not null
);

create table if not exists playhq.match_innings (
  innings_id       uuid primary key,
  match_id         uuid not null,
  innings_number   integer,
  innings_order    integer,
  name             text,
  batting_team_id  uuid,
  runs             integer,
  wickets          integer,
  overs_text       text,               -- cricket notation, "43.3" = 43 overs 3 balls
  balls_bowled     integer,            -- derived from overs_text
  is_declared      boolean,
  is_follow_on     boolean,
  close_type       text,
  byes             integer,
  leg_byes         integer,
  wides            integer,
  no_balls         integer,
  penalties        integer,
  extras           integer
);
create index if not exists playhq_match_innings_match_idx on playhq.match_innings (match_id);

create table if not exists playhq.match_batting (
  innings_id         uuid not null,
  participant_id     uuid not null,
  bat_instance       integer not null default 1,
  bat_order          integer,
  short_name         text,
  runs               integer,
  balls              integer,
  fours              integer,
  sixes              integer,
  strike_rate        numeric,
  minutes            integer,
  dismissal_text     text,
  dismissal_type     text,
  dismissal_type_id  integer,
  primary key (innings_id, participant_id, bat_instance)
);

create table if not exists playhq.match_bowling (
  innings_id      uuid not null,
  participant_id  uuid not null,
  bowl_order      integer,
  short_name      text,
  overs_text      text,
  balls_bowled    integer,
  maidens         integer,
  runs            integer,
  wickets         integer,
  economy         numeric,
  wides           integer,
  no_balls        integer,
  primary key (innings_id, participant_id)
);

create table if not exists playhq.match_fielding (
  innings_id           uuid not null,
  participant_id       uuid not null,
  short_name           text,
  catches              integer,
  wk_catches           integer,
  total_catches        integer,
  stumpings            integer,
  run_outs             integer,
  assisted_run_outs    integer,
  unassisted_run_outs  integer,
  primary key (innings_id, participant_id)
);

create table if not exists playhq.fall_of_wickets (
  innings_id      uuid not null,
  wicket          integer not null,
  participant_id  uuid,
  short_name      text,
  runs            integer,
  primary key (innings_id, wicket)
);

-- Ball-by-ball. `seq` is the delivery's position in the innings as published (the site's
-- ball_number restarts every over and wides/no-balls share numbers, so seq is the only
-- stable ordering). Roughly 550 rows per completed one-day match.
create table if not exists playhq.balls (
  ball_id             uuid primary key,
  match_id            uuid not null,
  innings_id          uuid not null,
  innings_number      integer,
  batting_team_id     uuid,
  seq                 integer not null,
  over_number         integer,
  ball_number         integer,
  ball_display_number integer,
  ball_time           timestamptz,
  striker_id          uuid,
  striker_name        text,
  non_striker_id      uuid,
  non_striker_name    text,
  bowler_id           uuid,
  bowler_name         text,
  runs_bat            integer,
  wides               integer,
  no_balls            integer,
  byes                integer,
  leg_byes            integer,
  penalty_runs        integer,
  is_wicket           boolean not null default false,
  dismissal_type      text,
  dismissal_type_id   integer,
  dismissed_id        uuid,
  fielder_id          uuid,
  fielder_name        text,
  progress_runs       integer,
  progress_wickets    integer,
  progress_score      text,
  striker_runs        integer,
  striker_balls       integer,
  short_description   text,
  description         text,
  highlight_url       text
);
create index if not exists playhq_balls_match_idx on playhq.balls (match_id, innings_id, seq);
create index if not exists playhq_balls_bowler_idx on playhq.balls (bowler_id);
create index if not exists playhq_balls_striker_idx on playhq.balls (striker_id);
