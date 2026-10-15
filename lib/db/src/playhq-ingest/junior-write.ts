/**
 * The junior projection's database writers (docs/plans/2026-10-14-001-feat-junior-playhq-sync-plan.md,
 * U5; KTD5–KTD10): participants, team lists, scored matches with their stable lines, and
 * the per-match re-application of admin corrections and duplicate merges (the one-off
 * loader's steps 6–7, scoped to one tenant and one synced match).
 *
 * Every statement is scoped to the tenant it is handed; nothing here reads `playhq.*`
 * (the planners in junior-plan.ts decide what to write, junior-project.ts orchestrates).
 */
import { sql } from "drizzle-orm";
import {
  battingLineKey,
  bowlingLineKey,
  deletedLineKeys,
  juniorMatchScope,
  juniorMatchWriteTarget,
  lineIdentityParticipant,
  planJuniorTeamList,
  planParticipantWrite,
  reconcileLines,
  rosterLineKey,
  teamListAction,
  teamListWindow,
  JUNIOR_LINE_TABLES,
  type ExistingParticipant,
  type JuniorBattingPlan,
  type JuniorBowlingPlan,
  type JuniorLineTable,
  type JuniorMatchPlan,
  type JuniorParticipantSeed,
  type JuniorPlanContext,
  type JuniorRosterPlan,
  type JuniorSourceMatch,
  type JuniorSyncTenantRef,
  type LineKeyInput,
} from "./junior-plan";
import type { Queryable } from "./load";
import { activateHeldJuniorShirtNumbers } from "../shirt-numbers";
import { JUNIOR_SYNC_ID_START, type JuniorTeamListPlayer } from "../schema/juniors";
// Types only: the module itself is imported lazily by `projectJuniors`.
import type * as DbModuleNs from "../index";

const lc = (s: string | null | undefined): string | null => (s ? s.toLowerCase() : null);

type DbModule = typeof DbModuleNs;
export type Db = DbModule["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Pick<Db, "execute">;

export interface JuniorProjectionOpts {
  /** The enabled tenants and their junior organisations (the API's junior-sync gate). */
  tenants: readonly JuniorSyncTenantRef[];
  /** Reader for `playhq.*`. */
  central: Queryable;
  /** Restrict to these PlayHQ matches (the ingest passes its dump's); absent → every one. */
  matchIds?: string[];
  now?: Date;
  log?: (line: string) => void;
}

export interface JuniorProjectionError {
  /** `read`: the tenant's `playhq.*` / merge-map reads failed, so nothing was projected. */
  stage: "read" | "participants" | "shirtNumbers" | "fixtures" | "teamLists" | "match";
  playhqMatchId?: string;
  message: string;
}

export interface JuniorProjectionSummary {
  tenantId: number;
  /** In-scope junior matches read for the tenant. */
  matches: number;
  fixturesWritten: number;
  teamListsWritten: number;
  teamListsKeptAdmin: number;
  matchesCreated: number;
  matchesUpdated: number;
  /** Matches whose row belongs to the loader (below the sync band): left alone. */
  matchesSkipped: number;
  participantsCreated: number;
  participantsUpdated: number;
  /** Held junior shirt numbers made live because their participant arrived (name agreed). */
  shirtNumbersActivated: number;
  /** Lowercased GUIDs whose stored metadata the caller should recompute. */
  touchedParticipantIds: string[];
  errors: JuniorProjectionError[];
}

export async function rowsOf<R>(exec: Exec, q: ReturnType<typeof sql>): Promise<R[]> {
  const res = await exec.execute(q);
  return (res as unknown as { rows: R[] }).rows;
}

/**
 * The tenant's merge map as the sync uses it everywhere (planning, live-line and tombstone
 * keys, re-pointing): duplicate → keeper as stored, only for a keeper that still has a
 * participant row. One definition, so line identity never differs between the planned and
 * the stored side (an orphaned merge would otherwise churn a line's id on every sync).
 */
export function juniorMergeMapSql(tenantId: number): ReturnType<typeof sql> {
  return sql`select m.duplicate_participant_id as dup, m.keeper_participant_id as keeper
          from junior_participant_merges m
         where m.tenant_id = ${tenantId}
           and exists (select 1 from junior_participants k
                        where k.tenant_id = ${tenantId}
                          and k.participant_id = m.keeper_participant_id)`;
}

/** The tenant's merge map (see {@link juniorMergeMapSql}), both ids lowercased. */
export async function loadJuniorMergeMap(
  exec: Exec,
  tenantId: number,
): Promise<Map<string, string>> {
  const merges = new Map<string, string>();
  for (const r of await rowsOf<{ dup: string; keeper: string }>(exec, juniorMergeMapSql(tenantId)))
    merges.set(r.dup.toLowerCase(), r.keeper.toLowerCase());
  return merges;
}

export async function writeParticipants(
  db: Db,
  tenantId: number,
  seeds: JuniorParticipantSeed[],
  summary: JuniorProjectionSummary,
): Promise<void> {
  if (seeds.length === 0) return;
  const ids = seeds.map((s) => s.participantId);
  await db.transaction(async (tx) => {
    const existing = new Map<string, ExistingParticipant>();
    // The stored spelling of each GUID (a legacy row may not be lowercased).
    const stored = new Map<string, string>();
    for (const r of await rowsOf<{
      participant_id: string;
      display_name: string | null;
      is_private: boolean;
    }>(
      tx,
      sql`select participant_id, display_name, is_private from junior_participants
           where tenant_id = ${tenantId} and lower(participant_id) = any(${sql.param(ids)}::text[])
           for update`,
    )) {
      existing.set(r.participant_id.toLowerCase(), {
        displayName: r.display_name,
        isPrivate: r.is_private,
      });
      stored.set(r.participant_id.toLowerCase(), r.participant_id);
    }
    // Admin renames: a journalled display_name correction (the loader's rule, ETL 0f).
    const renamed = new Set(
      (
        await rowsOf<{ target_id: string }>(
          tx,
          sql`select distinct lower(target_id) as target_id from junior_stat_corrections
               where tenant_id = ${tenantId} and target_table = 'junior_participants'
                 and op = 'update' and patch ? 'display_name'
                 and lower(target_id) = any(${sql.param(ids)}::text[])`,
        )
      ).map((r) => r.target_id),
    );
    for (const seed of seeds) {
      const w = planParticipantWrite(
        existing.get(seed.participantId) ?? null,
        seed,
        renamed.has(seed.participantId),
      );
      if (w.kind === "insert") {
        const r = await rowsOf<{ participant_id: string }>(
          tx,
          sql`insert into junior_participants (tenant_id, participant_id, display_name, is_private)
              values (${tenantId}, ${seed.participantId}, ${w.displayName}, ${w.isPrivate})
              on conflict (tenant_id, participant_id) do nothing
              returning participant_id`,
        );
        summary.participantsCreated += r.length;
      } else if (w.kind === "update") {
        const key = stored.get(seed.participantId) ?? seed.participantId;
        await tx.execute(
          sql`update junior_participants set
                display_name = coalesce(${w.displayName ?? null}::text, display_name),
                is_private = is_private or ${w.isPrivate === true},
                privacy_override = privacy_override and not ${w.clearOverride === true},
                privacy_override_by = case when ${w.clearOverride === true} then null
                                           else privacy_override_by end,
                privacy_override_at = case when ${w.clearOverride === true} then null
                                           else privacy_override_at end
              where tenant_id = ${tenantId} and participant_id = ${key}`,
        );
        summary.participantsUpdated++;
      }
    }
  });
  // Junior shirt numbers uploaded before these players were in the app go live now, when
  // the PlayHQ name agrees with the club's sheet (held otherwise, for an admin). Its own
  // step: a failure here never undoes the participants just written.
  try {
    summary.shirtNumbersActivated += await activateHeldJuniorShirtNumbers(db, tenantId, ids);
  } catch (err) {
    summary.errors.push({
      stage: "shirtNumbers",
      message: err instanceof Error ? err.message : String(err),
    });
  }
  const touched = new Set(summary.touchedParticipantIds);
  for (const s of seeds) touched.add(s.participantId);
  summary.touchedParticipantIds = [...touched];
}

export async function writeTeamLists(
  db: Db,
  tenantId: number,
  matches: JuniorSourceMatch[],
  lineupOf: Map<string, unknown>,
  ctx: JuniorPlanContext,
  now: Date,
  summary: JuniorProjectionSummary,
): Promise<void> {
  const candidates = matches.filter((m) => teamListWindow(m.startAt, now) !== null);
  if (candidates.length === 0) return;
  const fixtures = await rowsOf<{ id: number; playhq_match_id: string }>(
    db,
    sql`select id, playhq_match_id from junior_fixtures
         where tenant_id = ${tenantId}
           and playhq_match_id = any(${sql.param(candidates.map((m) => m.id))}::text[])`,
  );
  const fixtureOf = new Map(fixtures.map((f) => [f.playhq_match_id.toLowerCase(), f.id]));
  const lists = fixtures.length
    ? await rowsOf<{
        junior_fixture_id: number;
        source: string;
        is_published: boolean;
        players: JuniorTeamListPlayer[];
      }>(
        db,
        sql`select junior_fixture_id, source, is_published, players from junior_team_lists
             where tenant_id = ${tenantId}
               and junior_fixture_id = any(${sql.param(fixtures.map((f) => f.id))}::int[])`,
      )
    : [];
  const listOf = new Map(lists.map((l) => [l.junior_fixture_id, l]));

  for (const m of candidates) {
    const fixtureId = fixtureOf.get(m.id);
    if (fixtureId === undefined) continue;
    const s = juniorMatchScope(m, ctx);
    if (!s?.ours.teamId) continue;
    // After the start: the scorecard's side when PlayHQ has one, else the last lineup.
    let side: unknown = lineupOf.get(`${m.id}|${s.ours.teamId}`);
    if (teamListWindow(m.startAt, now) === "played") {
      const sheet = (m.scorecard?.teams ?? []).find((x) => lc(x.id) === s.ours.teamId)?.players;
      if (sheet?.length) side = sheet;
    }
    const players = planJuniorTeamList(side, ctx.merges);
    const current = listOf.get(fixtureId) ?? null;
    const window = teamListWindow(m.startAt, now);
    const action = teamListAction(
      current
        ? { source: current.source, isPublished: current.is_published, players: current.players }
        : null,
      players,
      window,
    );
    if (action === "keepAdmin") summary.teamListsKeptAdmin++;
    if (action !== "write") continue;
    const written = await rowsOf<{ id: number }>(
      db,
      sql`insert into junior_team_lists (tenant_id, junior_fixture_id, players, is_published, source)
          values (${tenantId}, ${fixtureId}, ${JSON.stringify(players)}::jsonb, true, 'playhq')
          on conflict (tenant_id, junior_fixture_id) do update set
            players = excluded.players, is_published = true, source = 'playhq', updated_at = now()
          where junior_team_lists.source = 'playhq'
             or (junior_team_lists.source = 'selection' and ${window === "played"})
          returning id`,
    );
    summary.teamListsWritten += written.length;
  }
}

interface ExistingLine {
  id: number;
  innings: number | null;
  is_halls_head: boolean;
  bat_order?: number | null;
  participant_id: string | null;
  player_name: string | null;
}

/**
 * Write one scored match and its lines (KTD7), then re-apply its corrections and merges
 * (the loader's steps 6–7, scoped to this tenant and this match). Returns the club's
 * participants on the match, for the metadata recompute.
 */
export async function writeMatch(
  tx: Tx,
  tenantId: number,
  plan: JuniorMatchPlan,
): Promise<{ kind: "insert" | "update" | "skip"; participants: string[] }> {
  const f = plan.match;
  const [existing] = await rowsOf<{ id: number }>(
    tx,
    sql`select id from junior_matches
         where tenant_id = ${tenantId} and playhq_match_id = ${f.playhqMatchId}
         for update`,
  );
  const kind = juniorMatchWriteTarget(existing?.id ?? null);
  if (kind === "skip") return { kind, participants: [] };

  // Column, value and SQL type of every field the sync owns on the match row.
  const fields: [string, string | number | boolean | null, "text" | "int" | "boolean"][] = [
    ["season", f.season, "text"],
    ["season_start_year", f.seasonStartYear, "int"],
    ["grade", f.grade, "text"],
    ["age_group", f.ageGroup, "text"],
    ["age_group_raw", f.ageGroupRaw, "text"],
    ["team_name", f.teamName, "text"],
    ["competition", f.competition, "text"],
    ["association", f.association, "text"],
    ["round", f.round, "text"],
    ["match_date", f.matchDate, "text"],
    ["venue", f.venue, "text"],
    ["venue_oval", f.venueOval, "text"],
    ["venue_address", f.venueAddress, "text"],
    ["venue_suburb", f.venueSuburb, "text"],
    ["status", f.status, "text"],
    ["team1", f.team1, "text"],
    ["team1_score", f.team1Score, "text"],
    ["team2", f.team2, "text"],
    ["team2_score", f.team2Score, "text"],
    ["hh_team_id", f.hhTeamId, "text"],
    ["hh_result", f.hhResult, "text"],
    ["winner", f.winner, "text"],
    ["toss_winner", f.tossWinner, "text"],
    ["hh_batted_first", f.hhBattedFirst, "boolean"],
    ["opponent_name", f.opponentName, "text"],
    ["opponent_club_id", f.opponentClubId, "int"],
  ];
  const cols = sql.join(
    fields.map(([col, v]) => sql`${sql.raw(col)} = ${v}`),
    sql`, `,
  );
  // An unchanged row is not rewritten (its corrections are re-applied below either way).
  const changed = sql`(${sql.raw(fields.map(([col]) => col).join(", "))}) is distinct from (${sql.join(
    fields.map(([, v, type]) => sql`${v}::${sql.raw(type)}`),
    sql`, `,
  )})`;
  let matchId: number;
  if (kind === "insert") {
    const [row] = await rowsOf<{ id: number }>(
      tx,
      sql`insert into junior_matches (id, tenant_id, playhq_match_id)
          values (nextval('junior_sync_id_seq'), ${tenantId}, ${f.playhqMatchId})
          returning id`,
    );
    matchId = row!.id;
  } else matchId = existing!.id;
  await tx.execute(
    sql`update junior_matches set ${cols}
         where id = ${matchId} and tenant_id = ${tenantId} and ${changed}`,
  );

  // Journal entries that shape line identity: participant re-points and deletions.
  const journal = await rowsOf<{
    id: number;
    target_table: JuniorLineTable;
    target_id: string;
    op: string;
    prev_values: Record<string, unknown> | null;
  }>(
    tx,
    sql`select id, target_table, target_id, op, prev_values from junior_stat_corrections
         where tenant_id = ${tenantId}
           and target_table = any(${sql.param([...JUNIOR_LINE_TABLES])}::text[])
           and (match_id = ${matchId} or playhq_match_id = ${f.playhqMatchId}
                or prev_values->>'match_id' = ${String(matchId)})
           and (op = 'delete' or (op = 'update' and patch ? 'participant_id'))
         order by id`,
  );
  // The same merge map the planners used (keepers that still exist), read in this transaction.
  const merges = await loadJuniorMergeMap(tx, tenantId);

  const tables = [
    {
      table: "junior_match_batting" as const,
      planned: plan.batting as LineKeyInput[],
      keyOf: battingLineKey,
    },
    {
      table: "junior_match_bowling" as const,
      planned: plan.bowling as LineKeyInput[],
      keyOf: bowlingLineKey,
    },
    {
      table: "junior_match_rosters" as const,
      planned: plan.rosters as LineKeyInput[],
      keyOf: rosterLineKey,
    },
  ];
  for (const { table, planned, keyOf } of tables) {
    const lines = await rowsOf<ExistingLine>(
      tx,
      table === "junior_match_batting"
        ? sql`select id, innings, is_halls_head, bat_order, participant_id, player_name
                from junior_match_batting where match_id = ${matchId} and id >= ${JUNIOR_SYNC_ID_START}`
        : table === "junior_match_bowling"
          ? sql`select id, innings, is_halls_head, participant_id, player_name
                  from junior_match_bowling where match_id = ${matchId} and id >= ${JUNIOR_SYNC_ID_START}`
          : sql`select id, null::int as innings, is_halls_head, participant_id, player_name
                  from junior_match_rosters where match_id = ${matchId} and id >= ${JUNIOR_SYNC_ID_START}`,
    );
    // A line's participant re-points, in journal order (their pre-images lead back to the
    // participant PlayHQ gave the line).
    const repointsOf = (targetId: string) =>
      journal
        .filter((j) => j.target_table === table && j.op === "update" && j.target_id === targetId)
        .map((j) => ({ participantId: (j.prev_values?.participant_id as string | null) ?? null }));
    const existingKeys = lines.map((l) => ({
      id: l.id,
      key: keyOf({
        innings: l.innings,
        participantId: lineIdentityParticipant(l.participant_id, repointsOf(String(l.id)), merges),
        batOrder: l.bat_order ?? null,
        isHallsHead: l.is_halls_head,
        playerName: l.player_name,
      }),
    }));
    // Tombstones keyed exactly like live lines: a line re-pointed and then deleted, or
    // deleted and later merged, still matches its planned line and is not re-created.
    const deleted = deletedLineKeys(
      table,
      journal
        .filter((j) => j.target_table === table && j.op === "delete")
        .map((j) => ({ targetId: j.target_id, prevValues: j.prev_values })),
      (targetId, pid) => lineIdentityParticipant(pid, repointsOf(targetId), merges),
    );
    const r = reconcileLines(existingKeys, planned, keyOf, deleted);
    for (const id of r.removes)
      await tx.execute(
        sql`delete from ${sql.raw(table)} where id = ${id} and match_id = ${matchId} and id >= ${JUNIOR_SYNC_ID_START}`,
      );
    for (const u of r.updates) await writeLine(tx, table, matchId, u.row, u.id);
    for (const row of r.inserts) await writeLine(tx, table, matchId, row, null);
  }

  // Nothing to re-apply when the tenant has no corrections journalled for a match or its
  // lines (checked here, inside the match's transaction, like the re-apply reads).
  const [journalled] = await rowsOf<{ has_any: boolean }>(
    tx,
    sql`select exists (select 1 from junior_stat_corrections
         where tenant_id = ${tenantId}
           and target_table = any(${sql.param(["junior_matches", ...JUNIOR_LINE_TABLES])}::text[])) as has_any`,
  );
  if (journalled?.has_any) await reapplyCorrections(tx, tenantId, matchId);
  await reapplyMerges(tx, tenantId, matchId, merges.size > 0);

  const own = new Set<string>();
  for (const l of [...plan.batting, ...plan.bowling, ...plan.rosters])
    if (l.isHallsHead && l.participantId) own.add(l.participantId);
  for (const r of await rowsOf<{ participant_id: string }>(
    tx,
    sql`select participant_id from junior_match_batting where match_id = ${matchId} and is_halls_head and participant_id is not null
        union select participant_id from junior_match_bowling where match_id = ${matchId} and is_halls_head and participant_id is not null
        union select participant_id from junior_match_rosters where match_id = ${matchId} and is_halls_head and participant_id is not null`,
  ))
    own.add(r.participant_id);
  return { kind, participants: [...own] };
}

async function writeLine(
  tx: Tx,
  table: JuniorLineTable,
  matchId: number,
  row: LineKeyInput,
  id: number | null,
): Promise<void> {
  const idSql = id === null ? sql`nextval('junior_sync_id_seq')` : sql`${id}`;
  if (table === "junior_match_batting") {
    const b = row as unknown as JuniorBattingPlan;
    await tx.execute(
      sql`insert into junior_match_batting
            (id, match_id, innings, batting_team, is_halls_head, bat_order, participant_id,
             player_name, runs, balls, fours, sixes, strike_rate, dismissal)
          values (${idSql}, ${matchId}, ${b.innings}, ${b.battingTeam}, ${b.isHallsHead},
                  ${b.batOrder}, ${b.participantId}, ${b.playerName}, ${b.runs}, ${b.balls},
                  ${b.fours}, ${b.sixes}, ${b.strikeRate}, ${b.dismissal})
          on conflict (id) do update set
            innings = excluded.innings, batting_team = excluded.batting_team,
            is_halls_head = excluded.is_halls_head, bat_order = excluded.bat_order,
            participant_id = excluded.participant_id, player_name = excluded.player_name,
            runs = excluded.runs, balls = excluded.balls, fours = excluded.fours,
            sixes = excluded.sixes, strike_rate = excluded.strike_rate,
            dismissal = excluded.dismissal
          where junior_match_batting.match_id = ${matchId}
            and (junior_match_batting.innings, junior_match_batting.batting_team,
                 junior_match_batting.is_halls_head, junior_match_batting.bat_order,
                 junior_match_batting.participant_id, junior_match_batting.player_name,
                 junior_match_batting.runs, junior_match_batting.balls, junior_match_batting.fours,
                 junior_match_batting.sixes, junior_match_batting.strike_rate,
                 junior_match_batting.dismissal)
              is distinct from
                (excluded.innings, excluded.batting_team, excluded.is_halls_head,
                 excluded.bat_order, excluded.participant_id, excluded.player_name, excluded.runs,
                 excluded.balls, excluded.fours, excluded.sixes, excluded.strike_rate,
                 excluded.dismissal)`,
    );
  } else if (table === "junior_match_bowling") {
    const w = row as unknown as JuniorBowlingPlan;
    await tx.execute(
      sql`insert into junior_match_bowling
            (id, match_id, innings, bowling_team, is_halls_head, participant_id, player_name,
             overs, maidens, runs, wickets, economy, wides, no_balls)
          values (${idSql}, ${matchId}, ${w.innings}, ${w.bowlingTeam}, ${w.isHallsHead},
                  ${w.participantId}, ${w.playerName}, ${w.overs}, ${w.maidens}, ${w.runs},
                  ${w.wickets}, ${w.economy}, ${w.wides}, ${w.noBalls})
          on conflict (id) do update set
            innings = excluded.innings, bowling_team = excluded.bowling_team,
            is_halls_head = excluded.is_halls_head, participant_id = excluded.participant_id,
            player_name = excluded.player_name, overs = excluded.overs,
            maidens = excluded.maidens, runs = excluded.runs, wickets = excluded.wickets,
            economy = excluded.economy, wides = excluded.wides, no_balls = excluded.no_balls
          where junior_match_bowling.match_id = ${matchId}
            and (junior_match_bowling.innings, junior_match_bowling.bowling_team,
                 junior_match_bowling.is_halls_head, junior_match_bowling.participant_id,
                 junior_match_bowling.player_name, junior_match_bowling.overs,
                 junior_match_bowling.maidens, junior_match_bowling.runs,
                 junior_match_bowling.wickets, junior_match_bowling.economy,
                 junior_match_bowling.wides, junior_match_bowling.no_balls)
              is distinct from
                (excluded.innings, excluded.bowling_team, excluded.is_halls_head,
                 excluded.participant_id, excluded.player_name, excluded.overs, excluded.maidens,
                 excluded.runs, excluded.wickets, excluded.economy, excluded.wides,
                 excluded.no_balls)`,
    );
  } else {
    const r = row as unknown as JuniorRosterPlan;
    await tx.execute(
      sql`insert into junior_match_rosters
            (id, match_id, team_name, is_halls_head, participant_id, player_name)
          values (${idSql}, ${matchId}, ${r.teamName}, ${r.isHallsHead}, ${r.participantId},
                  ${r.playerName})
          on conflict (id) do update set
            team_name = excluded.team_name, is_halls_head = excluded.is_halls_head,
            participant_id = excluded.participant_id, player_name = excluded.player_name
          where junior_match_rosters.match_id = ${matchId}
            and (junior_match_rosters.team_name, junior_match_rosters.is_halls_head,
                 junior_match_rosters.participant_id, junior_match_rosters.player_name)
              is distinct from
                (excluded.team_name, excluded.is_halls_head, excluded.participant_id,
                 excluded.player_name)`,
    );
  }
}

/**
 * Re-apply this match's admin corrections (the loader's step 6, scoped to one tenant and one
 * synced match): admin-added lines (6a), per-column last-write-wins update patches (6b),
 * then deletions (6c). Anchored on the stored PlayHQ match id like the loader.
 */
async function reapplyCorrections(tx: Tx, tenantId: number, matchId: number): Promise<void> {
  const anchor = sql`exists (select 1 from junior_matches m
      where m.id = ${matchId} and m.tenant_id = ${tenantId}
        and (c.playhq_match_id is null or m.playhq_match_id = c.playhq_match_id))`;
  // 6a. Admin-added rows (patch = the full row).
  await tx.execute(sql`
    insert into junior_match_batting (
      id, match_id, innings, batting_team, is_halls_head, bat_order,
      participant_id, player_name, runs, balls, fours, sixes, strike_rate, dismissal)
    select (c.patch->>'id')::int, (c.patch->>'match_id')::int, (c.patch->>'innings')::int,
      c.patch->>'batting_team', coalesce((c.patch->>'is_halls_head')::boolean, true),
      (c.patch->>'bat_order')::int, c.patch->>'participant_id', c.patch->>'player_name',
      (c.patch->>'runs')::int, (c.patch->>'balls')::int, (c.patch->>'fours')::int,
      (c.patch->>'sixes')::int, (c.patch->>'strike_rate')::real, c.patch->>'dismissal'
    from junior_stat_corrections c
    where c.tenant_id = ${tenantId} and c.target_table = 'junior_match_batting' and c.op = 'insert'
      and (c.patch->>'match_id')::int = ${matchId} and ${anchor}
    on conflict (id) do nothing`);
  await tx.execute(sql`
    insert into junior_match_bowling (
      id, match_id, innings, bowling_team, is_halls_head, participant_id,
      player_name, overs, maidens, runs, wickets, economy, wides, no_balls)
    select (c.patch->>'id')::int, (c.patch->>'match_id')::int, (c.patch->>'innings')::int,
      c.patch->>'bowling_team', coalesce((c.patch->>'is_halls_head')::boolean, true),
      c.patch->>'participant_id', c.patch->>'player_name', (c.patch->>'overs')::real,
      (c.patch->>'maidens')::int, (c.patch->>'runs')::int, (c.patch->>'wickets')::int,
      (c.patch->>'economy')::real, (c.patch->>'wides')::int, (c.patch->>'no_balls')::int
    from junior_stat_corrections c
    where c.tenant_id = ${tenantId} and c.target_table = 'junior_match_bowling' and c.op = 'insert'
      and (c.patch->>'match_id')::int = ${matchId} and ${anchor}
    on conflict (id) do nothing`);
  await tx.execute(sql`
    insert into junior_match_rosters (id, match_id, team_name, is_halls_head, participant_id, player_name)
    select (c.patch->>'id')::int, (c.patch->>'match_id')::int, c.patch->>'team_name',
      coalesce((c.patch->>'is_halls_head')::boolean, true), c.patch->>'participant_id',
      c.patch->>'player_name'
    from junior_stat_corrections c
    where c.tenant_id = ${tenantId} and c.target_table = 'junior_match_rosters' and c.op = 'insert'
      and (c.patch->>'match_id')::int = ${matchId} and ${anchor}
    on conflict (id) do nothing`);

  // 6b. Merged update patches: later journal rows win per column.
  const eff = (table: string, targets: ReturnType<typeof sql>) => sql`(
    select c.target_id, jsonb_object_agg(kv.key, kv.value order by c.id) as eff,
           max(c.playhq_match_id) as playhq_match_id
      from junior_stat_corrections c
      cross join lateral jsonb_each(c.patch) kv
     where c.tenant_id = ${tenantId} and c.op = 'update' and c.patch is not null
       and c.target_table = ${table} and c.target_id in (${targets})
     group by c.target_id)`;
  const uAnchor = sql`(u.playhq_match_id is null or exists (select 1 from junior_matches m
      where m.id = ${matchId} and m.playhq_match_id = u.playhq_match_id))`;
  await tx.execute(sql`
    update junior_matches t set
      team1_score     = case when u.eff ? 'team1_score'     then u.eff->>'team1_score'                else t.team1_score end,
      team2_score     = case when u.eff ? 'team2_score'     then u.eff->>'team2_score'                else t.team2_score end,
      hh_result       = case when u.eff ? 'hh_result'       then u.eff->>'hh_result'                  else t.hh_result end,
      winner          = case when u.eff ? 'winner'          then u.eff->>'winner'                     else t.winner end,
      toss_winner     = case when u.eff ? 'toss_winner'     then u.eff->>'toss_winner'                else t.toss_winner end,
      hh_batted_first = case when u.eff ? 'hh_batted_first' then (u.eff->>'hh_batted_first')::boolean else t.hh_batted_first end,
      status          = case when u.eff ? 'status'          then u.eff->>'status'                     else t.status end,
      match_date      = case when u.eff ? 'match_date'      then u.eff->>'match_date'                 else t.match_date end,
      round           = case when u.eff ? 'round'           then u.eff->>'round'                      else t.round end,
      venue           = case when u.eff ? 'venue'           then u.eff->>'venue'                      else t.venue end
    from ${eff("junior_matches", sql`${String(matchId)}`)} u
    where t.id = ${matchId} and t.tenant_id = ${tenantId} and ${uAnchor}`);
  await tx.execute(sql`
    update junior_match_batting t set
      runs           = case when u.eff ? 'runs'           then (u.eff->>'runs')::int         else t.runs end,
      balls          = case when u.eff ? 'balls'          then (u.eff->>'balls')::int        else t.balls end,
      fours          = case when u.eff ? 'fours'          then (u.eff->>'fours')::int        else t.fours end,
      sixes          = case when u.eff ? 'sixes'          then (u.eff->>'sixes')::int        else t.sixes end,
      strike_rate    = case when u.eff ? 'strike_rate'    then (u.eff->>'strike_rate')::real else t.strike_rate end,
      dismissal      = case when u.eff ? 'dismissal'      then u.eff->>'dismissal'           else t.dismissal end,
      bat_order      = case when u.eff ? 'bat_order'      then (u.eff->>'bat_order')::int    else t.bat_order end,
      participant_id = case when u.eff ? 'participant_id' then u.eff->>'participant_id'      else t.participant_id end,
      player_name    = case when u.eff ? 'player_name'    then u.eff->>'player_name'         else t.player_name end
    from ${eff("junior_match_batting", sql`select id::text from junior_match_batting where match_id = ${matchId}`)} u
    where t.match_id = ${matchId} and t.id = u.target_id::int and ${uAnchor}`);
  await tx.execute(sql`
    update junior_match_bowling t set
      overs          = case when u.eff ? 'overs'          then (u.eff->>'overs')::real      else t.overs end,
      maidens        = case when u.eff ? 'maidens'        then (u.eff->>'maidens')::int     else t.maidens end,
      runs           = case when u.eff ? 'runs'           then (u.eff->>'runs')::int        else t.runs end,
      wickets        = case when u.eff ? 'wickets'        then (u.eff->>'wickets')::int     else t.wickets end,
      economy        = case when u.eff ? 'economy'        then (u.eff->>'economy')::real    else t.economy end,
      wides          = case when u.eff ? 'wides'          then (u.eff->>'wides')::int       else t.wides end,
      no_balls       = case when u.eff ? 'no_balls'       then (u.eff->>'no_balls')::int    else t.no_balls end,
      participant_id = case when u.eff ? 'participant_id' then u.eff->>'participant_id'     else t.participant_id end,
      player_name    = case when u.eff ? 'player_name'    then u.eff->>'player_name'        else t.player_name end
    from ${eff("junior_match_bowling", sql`select id::text from junior_match_bowling where match_id = ${matchId}`)} u
    where t.match_id = ${matchId} and t.id = u.target_id::int and ${uAnchor}`);
  await tx.execute(sql`
    update junior_match_rosters t set
      participant_id = case when u.eff ? 'participant_id' then u.eff->>'participant_id' else t.participant_id end,
      player_name    = case when u.eff ? 'player_name'    then u.eff->>'player_name'    else t.player_name end
    from ${eff("junior_match_rosters", sql`select id::text from junior_match_rosters where match_id = ${matchId}`)} u
    where t.match_id = ${matchId} and t.id = u.target_id::int and ${uAnchor}`);

  // 6c. Deletions last.
  for (const table of JUNIOR_LINE_TABLES) {
    await tx.execute(sql`
      delete from ${sql.raw(table)} t
      using junior_stat_corrections c
      where c.tenant_id = ${tenantId} and c.target_table = ${table} and c.op = 'delete'
        and t.id = c.target_id::int and t.match_id = ${matchId} and ${anchor}`);
  }
}

/**
 * Map this match's lines through the tenant's merge map (the loader's step 7a–7b, scoped to
 * one tenant and one synced match), then put the club's directory names on its own lines
 * (7d, and the rename propagation of 6b).
 */
async function reapplyMerges(
  tx: Tx,
  tenantId: number,
  matchId: number,
  hasMerges: boolean,
): Promise<void> {
  const map = sql`(${juniorMergeMapSql(tenantId)})`;
  // The tenant's merge map was read in this transaction: with none, nothing re-points.
  if (hasMerges)
    for (const table of JUNIOR_LINE_TABLES)
      await tx.execute(sql`
      update ${sql.raw(table)} t set participant_id = jpm.keeper
      from ${map} jpm
      where lower(t.participant_id) = lower(jpm.dup) and t.match_id = ${matchId}`);
  await tx.execute(sql`
    delete from junior_match_rosters a
    using junior_match_rosters b
    where a.match_id = ${matchId} and b.match_id = ${matchId}
      and a.participant_id is not null and a.participant_id = b.participant_id
      and a.id > b.id`);
  for (const table of JUNIOR_LINE_TABLES)
    await tx.execute(sql`
      update ${sql.raw(table)} t set player_name = p.display_name
      from junior_participants p
      where p.tenant_id = ${tenantId} and p.participant_id = t.participant_id
        and p.display_name is not null and t.is_halls_head and t.match_id = ${matchId}
        and t.player_name is distinct from p.display_name`);
}
