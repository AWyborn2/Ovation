/**
 * The junior projection: an enabled club's junior grades in `playhq.*` → the club's
 * `junior_*` tables, from the 2026/27 season onward
 * (docs/plans/2026-10-14-001-feat-junior-playhq-sync-plan.md, U5; KTD5–KTD10, R8–R13, R22).
 *
 * What it writes, per enabled tenant (the API decides the set once, `junior-sync.ts`):
 *
 *  - `junior_fixtures`: every in-scope match without a published scorecard (upcoming, or
 *    played but unscored), upserted on (tenant, PlayHQ match id) so its status stays current.
 *    A scored match only refreshes an existing fixture's status (KTD9, KTD10).
 *  - `junior_team_lists`: the club's own side for fixtures starting within 8 days, or played
 *    in the last 7 days (the scorecard's side, else the last lineup), published, source
 *    `playhq`. An admin-saved list is never overwritten (KTD9).
 *  - `junior_participants`: the club's own players only, from lineups (so they exist before
 *    their first game) and scorecards, keyed (tenant, lowercased GUID). An admin rename and
 *    `privacy_override` are never overwritten; privacy only tightens (KTD8).
 *  - `junior_matches` + lines + roster: finished or in-progress matches with scorecard lines,
 *    ids from `junior_sync_id_seq`. Lines are updated in place, matched on (innings,
 *    participant) or batting order; only new lines get new ids. After each match is written
 *    its `junior_stat_corrections` are re-applied and its participant ids mapped through
 *    `junior_participant_merges`, mirroring the one-off loader's steps 6–7 (KTD7).
 *
 * It never writes `public.fixtures`, `public.team_lists`, `central.*` or a senior player
 * table, never reads a grade with `is_junior = false`, never touches a season before 2026/27
 * and never a row below the sync id band (loader rows, admin-added lines) (KTD5, KTD6, R12).
 * Opposition players keep their participant id and PlayHQ's short name on the scorecard
 * lines only and never become participants (R22).
 *
 * Split in three: junior-plan.ts (the pure planners, unit-tested in junior-project.test.ts),
 * junior-write.ts (the database writers) and this module (reading `playhq.*` and running
 * each tenant), which re-exports both so callers keep importing from one place.
 */
import { sql } from "drizzle-orm";
import type { Queryable } from "./load";
import { lineupEntries } from "./team-lists";
import type { RawScorecard } from "./central-transform";
import { loadClubIdByOrg } from "./project";
import {
  juniorTenantsForMatch,
  mergeParticipantSeeds,
  planJuniorFixture,
  planJuniorMatch,
  seedsFromLineup,
  JUNIOR_SYNC_FIRST_SEASON,
  type JuniorFixturePlan,
  type JuniorMatchPlan,
  type JuniorParticipantSeed,
  type JuniorPlanContext,
  type JuniorSourceMatch,
  type JuniorSyncTenantRef,
} from "./junior-plan";
import {
  loadJuniorMergeMap,
  rowsOf,
  writeMatch,
  writeParticipants,
  writeTeamLists,
  type Db,
  type JuniorProjectionOpts,
  type JuniorProjectionSummary,
} from "./junior-write";

export * from "./junior-plan";
export type {
  JuniorProjectionError,
  JuniorProjectionOpts,
  JuniorProjectionSummary,
} from "./junior-write";

const lc = (s: string | null | undefined): string | null => (s ? s.toLowerCase() : null);

type SourceRow = {
  id: string;
  grade_name: string | null;
  season_name: string | null;
  is_junior: boolean;
  status: string | null;
  start_at: Date | string | null;
  round_name: string | null;
  venue_name: string | null;
  surface_name: string | null;
  venue_line1: string | null;
  venue_suburb: string | null;
  result_text: string | null;
  home_team_id: string | null;
  home_team_name: string | null;
  home_org_id: string | null;
  home_org_name: string | null;
  home_score: string | null;
  away_team_id: string | null;
  away_team_name: string | null;
  away_org_id: string | null;
  away_org_name: string | null;
  away_score: string | null;
  winner_team_id: string | null;
  owner_org_name: string | null;
  scorecard: RawScorecard | null;
};

/** Junior matches of one organisation (2026 onward, coarse; the planners decide exactly). */
async function loadSourceMatches(
  central: Queryable,
  orgId: string,
  matchIds: string[] | undefined,
): Promise<JuniorSourceMatch[]> {
  const params: unknown[] = [orgId.toLowerCase(), `${JUNIOR_SYNC_FIRST_SEASON}-01-01`];
  let filter = "";
  if (matchIds) {
    params.push(matchIds.map((id) => id.toLowerCase()));
    filter = `and lower(m.id::text) = any($3::text[])`;
  }
  const { rows } = await central.query<SourceRow>(
    `select m.id::text as id, g.name as grade_name, g.season_name, g.is_junior,
            m.status, m.start_at, m.round_name, m.venue_name, m.surface_name,
            m.venue_line1, m.venue_suburb, m.result_text,
            m.home_team_id::text as home_team_id, m.home_team_name,
            m.home_org_id::text as home_org_id, ho.name as home_org_name, m.home_score,
            m.away_team_id::text as away_team_id, m.away_team_name,
            m.away_org_id::text as away_org_id, ao.name as away_org_name, m.away_score,
            m.winner_team_id::text as winner_team_id, oo.name as owner_org_name,
            s.raw as scorecard
       from playhq.matches m
       join playhq.grades g on g.id = m.grade_id
       left join playhq.organisations ho on ho.id = m.home_org_id
       left join playhq.organisations ao on ao.id = m.away_org_id
       left join playhq.organisations oo on oo.id = g.owner_org_id
       left join playhq.scorecards s on s.match_id = m.id
      where g.is_junior = true
        and (lower(m.home_org_id::text) = $1 or lower(m.away_org_id::text) = $1)
        and (m.start_at is null or m.start_at >= $2::date)
        ${filter}
      order by m.start_at nulls last, m.id`,
    params,
  );
  return rows.map((r) => ({
    id: r.id.toLowerCase(),
    gradeName: r.grade_name,
    seasonName: r.season_name,
    isJunior: r.is_junior === true,
    status: r.status,
    startAt: r.start_at ? new Date(r.start_at) : null,
    roundName: r.round_name,
    venueName: r.venue_name,
    surfaceName: r.surface_name,
    venueLine1: r.venue_line1,
    venueSuburb: r.venue_suburb,
    resultText: r.result_text,
    homeTeamId: r.home_team_id,
    homeTeamName: r.home_team_name,
    homeOrgId: r.home_org_id,
    homeOrgName: r.home_org_name,
    homeScore: r.home_score,
    awayTeamId: r.away_team_id,
    awayTeamName: r.away_team_name,
    awayOrgId: r.away_org_id,
    awayOrgName: r.away_org_name,
    awayScore: r.away_score,
    winnerTeamId: r.winner_team_id,
    ownerOrgName: r.owner_org_name,
    scorecard: r.scorecard,
  }));
}

/** Every participant GUID on these matches' team sheets and lines, plus these lineups. */
function guidsIn(matches: JuniorSourceMatch[], lineups: { players: unknown }[]): string[] {
  const ids = new Set<string>();
  for (const m of matches) {
    for (const t of m.scorecard?.teams ?? [])
      for (const p of t.players ?? []) if (p.participantId) ids.add(p.participantId.toLowerCase());
    for (const inn of m.scorecard?.innings ?? []) {
      for (const b of inn.batting ?? [])
        if (b.participantId) ids.add(b.participantId.toLowerCase());
      for (const w of inn.bowling ?? [])
        if (w.participantId) ids.add(w.participantId.toLowerCase());
    }
  }
  for (const l of lineups)
    for (const e of lineupEntries(l.players))
      if (e.participantId) ids.add(e.participantId.toLowerCase());
  return [...ids];
}

/**
 * Project the enabled tenants' junior grades from `playhq.*` into their `junior_*` tables.
 * One tenant's failure never stops another's; one match's failure never stops the rest
 * (each is its own transaction and is reported in `errors`, with ids only).
 */
export async function projectJuniors(
  opts: JuniorProjectionOpts,
): Promise<JuniorProjectionSummary[]> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const now = opts.now ?? new Date();
  if (opts.tenants.length === 0 || (opts.matchIds && opts.matchIds.length === 0)) return [];
  const { db } = await import("../index");
  const clubIdByOrg = await loadClubIdByOrg();

  const summaries: JuniorProjectionSummary[] = [];
  for (const t of opts.tenants) {
    const summary: JuniorProjectionSummary = {
      tenantId: t.tenantId,
      matches: 0,
      fixturesWritten: 0,
      teamListsWritten: 0,
      teamListsKeptAdmin: 0,
      matchesCreated: 0,
      matchesUpdated: 0,
      matchesSkipped: 0,
      participantsCreated: 0,
      participantsUpdated: 0,
      shirtNumbersActivated: 0,
      touchedParticipantIds: [],
      errors: [],
    };
    summaries.push(summary);
    // One tenant's failure (e.g. its reads) never stops another's: it is reported in the
    // tenant's summary, which is still returned so whatever it did write is recomputed.
    try {
      await projectTenant(db, opts.central, t, now, clubIdByOrg, opts.matchIds, summary);
    } catch (err) {
      summary.errors.push({ stage: "read", message: errMessage(err) });
    }
    log(
      `tenant ${t.tenantId}: ${summary.matches} junior match(es) → ${summary.fixturesWritten} fixture(s), ` +
        `${summary.teamListsWritten} team list(s) (${summary.teamListsKeptAdmin} kept: admin's), ` +
        `${summary.matchesCreated} new / ${summary.matchesUpdated} refreshed match(es), ` +
        `${summary.matchesSkipped} loader match(es) left alone, ${summary.participantsCreated} new / ` +
        `${summary.participantsUpdated} refreshed participant(s), ${summary.errors.length} error(s)`,
    );
  }
  return summaries;
}

/**
 * An error as safe text for warnings and logs: the Postgres error code and the first line of
 * the message, with key values and failing rows (which can hold a player's name) removed.
 */
export function juniorProjectionErrorText(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  const first = (err instanceof Error ? err.message : String(err)).split("\n")[0] ?? "";
  const text = first
    .replace(/Failing row contains.*$/i, "")
    .replace(/\([^()]*\)=\([^()]*\)/g, "(…)")
    .trim();
  return typeof code === "string" && code ? `${code}: ${text}` : text;
}

const errMessage = juniorProjectionErrorText;

async function projectTenant(
  db: Db,
  central: Queryable,
  t: JuniorSyncTenantRef,
  now: Date,
  clubIdByOrg: Map<string, number>,
  matchIds: string[] | undefined,
  summary: JuniorProjectionSummary,
): Promise<void> {
  const tenantId = t.tenantId;
  const all = await loadSourceMatches(central, t.orgId, matchIds);
  const ref = { tenantId, orgId: t.orgId.toLowerCase() };

  // This tenant's in-scope matches and their fixture plans (scope needs only the tenant
  // and its organisation, so nothing else is read when there are none).
  const fixturePlans = new Map<string, JuniorFixturePlan>();
  for (const m of all) {
    if (juniorTenantsForMatch(m, [ref]).length === 0) continue;
    const f = planJuniorFixture(m, ref);
    if (f) fixturePlans.set(m.id, f);
  }
  const inScope = all.filter((m) => fixturePlans.has(m.id));
  summary.matches = inScope.length;
  if (inScope.length === 0) return;

  const lineups = (
    await central.query<{ match_id: string; team_id: string; players: unknown }>(
      `select lower(match_id::text) as match_id, lower(team_id::text) as team_id, players
         from playhq.match_lineups where match_id = any($1::uuid[])`,
      [inScope.map((m) => m.id)],
    )
  ).rows;
  const guids = guidsIn(inScope, lineups);
  const fullNames = new Map<string, string>();
  if (guids.length) {
    const { rows } = await central.query<{ participant_id: string; full_name: string }>(
      `select lower(participant_id::text) as participant_id, full_name
         from playhq.players
        where participant_id = any($1::uuid[]) and full_name is not null`,
      [guids],
    );
    for (const r of rows) fullNames.set(r.participant_id, r.full_name);
  }
  const merges = await loadJuniorMergeMap(db, tenantId);
  const ctx: JuniorPlanContext = { tenantId, orgId: ref.orgId, fullNames, merges, clubIdByOrg };

  const lineupOf = new Map<string, unknown>();
  for (const l of lineups) lineupOf.set(`${l.match_id}|${l.team_id}`, l.players);
  const ownTeamIds = (m: JuniorSourceMatch) =>
    [
      lc(m.homeOrgId) === ref.orgId ? lc(m.homeTeamId) : null,
      lc(m.awayOrgId) === ref.orgId ? lc(m.awayTeamId) : null,
    ].filter((x): x is string => !!x);

  const matchPlans = new Map<string, JuniorMatchPlan>();
  const seeds: JuniorParticipantSeed[] = [];
  for (const m of inScope) {
    const plan = planJuniorMatch(m, ctx);
    if (plan) {
      matchPlans.set(m.id, plan);
      seeds.push(...plan.participants);
    }
    for (const team of ownTeamIds(m))
      seeds.push(...seedsFromLineup(lineupOf.get(`${m.id}|${team}`), ctx));
  }

  // 1. Participants: before the lines and lists that name them.
  try {
    await writeParticipants(db, tenantId, mergeParticipantSeeds(seeds), summary);
  } catch (err) {
    summary.errors.push({ stage: "participants", message: errMessage(err) });
  }

  // 2. Fixtures: unscored matches upserted; a scored match only refreshes an existing status.
  try {
    for (const m of inScope) {
      const f = fixturePlans.get(m.id)!;
      const written = matchPlans.has(m.id)
        ? await rowsOf<{ id: number }>(
            db,
            sql`update junior_fixtures set status = ${f.status}, updated_at = now()
                 where tenant_id = ${tenantId} and playhq_match_id = ${f.playhqMatchId}
                   and status is distinct from ${f.status}
                returning id`,
          )
        : await rowsOf<{ id: number }>(
            db,
            sql`insert into junior_fixtures
                  (tenant_id, playhq_match_id, season_start_year, age_group, grade, team_name,
                   opponent_name, venue, start_at, is_home, status)
                values (${tenantId}, ${f.playhqMatchId}, ${f.seasonStartYear}, ${f.ageGroup},
                        ${f.grade}, ${f.teamName}, ${f.opponentName}, ${f.venue},
                        ${f.startAt ? f.startAt.toISOString() : null}::timestamptz, ${f.isHome}, ${f.status})
                on conflict (tenant_id, playhq_match_id) do update set
                  season_start_year = excluded.season_start_year, age_group = excluded.age_group,
                  grade = excluded.grade, team_name = excluded.team_name,
                  opponent_name = excluded.opponent_name, venue = excluded.venue,
                  start_at = excluded.start_at, is_home = excluded.is_home,
                  status = excluded.status, updated_at = now()
                where (junior_fixtures.season_start_year, junior_fixtures.age_group,
                       junior_fixtures.grade, junior_fixtures.team_name,
                       junior_fixtures.opponent_name, junior_fixtures.venue,
                       junior_fixtures.start_at, junior_fixtures.is_home, junior_fixtures.status)
                  is distinct from
                      (excluded.season_start_year, excluded.age_group, excluded.grade,
                       excluded.team_name, excluded.opponent_name, excluded.venue,
                       excluded.start_at, excluded.is_home, excluded.status)
                returning id`,
          );
      summary.fixturesWritten += written.length;
    }
  } catch (err) {
    summary.errors.push({ stage: "fixtures", message: errMessage(err) });
  }

  // 3. Team lists: the club's side for fixtures in the window, never over an admin's.
  try {
    await writeTeamLists(db, tenantId, inScope, lineupOf, ctx, now, summary);
  } catch (err) {
    summary.errors.push({ stage: "teamLists", message: errMessage(err) });
  }

  // 4. Scored matches, one transaction each.
  const touched = new Set(summary.touchedParticipantIds);
  for (const [playhqMatchId, plan] of matchPlans) {
    try {
      const outcome = await db.transaction((tx) => writeMatch(tx, tenantId, plan));
      if (outcome.kind === "skip") summary.matchesSkipped++;
      else if (outcome.kind === "insert") summary.matchesCreated++;
      else summary.matchesUpdated++;
      for (const p of outcome.participants) touched.add(p);
    } catch (err) {
      summary.errors.push({ stage: "match", playhqMatchId, message: errMessage(err) });
    }
  }
  summary.touchedParticipantIds = [...touched].sort();
}
