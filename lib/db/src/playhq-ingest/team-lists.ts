/**
 * Copy the team a club selected in PlayHQ into the fixture's team list (`public.team_lists`,
 * source = "playhq"), so the Team List card drafts itself from the club's own PlayHQ
 * selection (Ash, 5 Oct 2026).
 *
 * Reads `playhq.match_lineups` (the scheduled sync's lineup records: each upcoming match's
 * `teams[].players` as PlayHQ publishes them once a club names its side) for each upcoming
 * PlayHQ fixture of a linked tenant, keeps only the tenant's own side, links each player to
 * the tenant's register through `player_id_map`, and upserts the XI as published.
 * A list an admin entered or edited (source = "admin") is never touched; an unchanged
 * selection writes nothing.
 */
import { and, eq, gt, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { Queryable } from "./load";
import type { TeamListPlayer } from "../schema/fixtures";

// ---------------------------------------------------------------------------
// Pure mapping (unit-tested)
// ---------------------------------------------------------------------------

export interface LineupEntry {
  participantId: string | null;
  name: string | null;
  position: number | null;
  isCaptain: boolean;
  isWicketKeeper: boolean;
}

/**
 * The stored selection (`playhq.match_lineups.players`, one team's `players` array from
 * `GET /scores/matches/{id}` as captured): `{participantId, name, shortName, roles[]}`
 * in PlayHQ's order. Captain / keeper come from `roles`.
 */
export function lineupEntries(players: unknown): LineupEntry[] {
  if (!Array.isArray(players)) return [];
  return players.map((p, i) => {
    const x = (p ?? {}) as Record<string, unknown>;
    const roles = Array.isArray(x.roles) ? x.roles.map((r) => String(r)) : [];
    const name = typeof x.name === "string" && x.name.trim() ? x.name : x.shortName;
    return {
      participantId: typeof x.participantId === "string" ? x.participantId : null,
      name: typeof name === "string" ? name : null,
      position: i + 1,
      isCaptain: roles.some((r) => /captain/i.test(r) && !/vice/i.test(r)),
      isWicketKeeper: roles.some((r) => /keeper|^wk$/i.test(r)),
    };
  });
}

/** Fill-in ids (>= 90000) never appear on a team list (fill-in exclusion invariant). */
const FILL_IN_THRESHOLD = 90000;

/**
 * The club's selection as a team list: in PlayHQ's order (then by name), renumbered 1..n,
 * with the captain / keeper roles, each player linked to the register when the tenant's
 * crosswalk knows them.
 */
export function lineupToTeamList(
  entries: readonly LineupEntry[],
  playerIdOf: ReadonlyMap<string, number>,
): TeamListPlayer[] {
  const seen = new Set<string>();
  const rows = entries
    .filter((e) => {
      if (!e.participantId) return !!e.name?.trim();
      const key = e.participantId.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
        (a.name ?? "").localeCompare(b.name ?? ""),
    );
  return rows.map((e, i) => {
    const key = e.participantId?.toLowerCase() ?? null;
    const playerId = key ? playerIdOf.get(key) : undefined;
    const role: TeamListPlayer["role"] =
      e.isCaptain && e.isWicketKeeper
        ? "C/WK"
        : e.isCaptain
          ? "C"
          : e.isWicketKeeper
            ? "WK"
            : undefined;
    return {
      order: i + 1,
      ...(playerId != null && playerId < FILL_IN_THRESHOLD ? { playerId } : {}),
      displayName: (e.name ?? "").trim(),
      ...(role ? { role } : {}),
    };
  });
}

/** Key-order-independent comparison of two team lists. */
export function sameTeamList(a: readonly TeamListPlayer[], b: readonly TeamListPlayer[]): boolean {
  const norm = (l: readonly TeamListPlayer[]) =>
    JSON.stringify(l.map((p) => [p.order, p.playerId ?? null, p.displayName, p.role ?? null]));
  return norm(a) === norm(b);
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

/** How far ahead a selection is copied (matches the Team List card's own lead time). */
export const TEAM_LIST_LOOKAHEAD_DAYS = 8;

export interface TeamListProjectionOpts {
  /** Tenants linked to these PlayHQ organisations (compared case-insensitively). */
  orgIds?: string[];
  tenantId?: number;
  syncEnabledOnly?: boolean;
  /** Reader for `playhq.*`. */
  central: Queryable;
  now?: Date;
  log?: (line: string) => void;
}

export interface TeamListProjectionSummary {
  tenantId: number;
  /** Fixtures with a PlayHQ selection for the club's side. */
  selections: number;
  written: number;
  /** Selections not copied because an admin owns that fixture's list. */
  keptAdmin: number;
}

export async function projectTeamLists(
  opts: TeamListProjectionOpts,
): Promise<TeamListProjectionSummary[]> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const now = opts.now ?? new Date();
  const { db, tenantsTable, fixturesTable, teamListsTable, playerIdMapTable } =
    await import("../index");

  const conds = [isNotNull(tenantsTable.playhqOrgId)];
  if (opts.tenantId) conds.push(eq(tenantsTable.id, opts.tenantId));
  if (opts.syncEnabledOnly) conds.push(eq(tenantsTable.playhqSyncEnabled, true));
  if (opts.orgIds) {
    const wanted = [...new Set(opts.orgIds.map((o) => o.toLowerCase()))];
    if (wanted.length === 0) return [];
    conds.push(inArray(sql<string>`lower(${tenantsTable.playhqOrgId})`, wanted));
  }
  const tenants = await db
    .select({ id: tenantsTable.id, orgId: tenantsTable.playhqOrgId })
    .from(tenantsTable)
    .where(and(...conds));

  const summaries: TeamListProjectionSummary[] = [];
  for (const t of tenants) {
    const orgId = (t.orgId ?? "").toLowerCase();
    const fixtures = await db
      .select({ id: fixturesTable.id, matchId: fixturesTable.playhqMatchId })
      .from(fixturesTable)
      .where(
        and(
          eq(fixturesTable.tenantId, t.id),
          isNotNull(fixturesTable.playhqMatchId),
          gt(fixturesTable.startAt, now),
          lte(
            fixturesTable.startAt,
            new Date(now.getTime() + TEAM_LIST_LOOKAHEAD_DAYS * 24 * 3600 * 1000),
          ),
        ),
      );
    const summary: TeamListProjectionSummary = {
      tenantId: t.id,
      selections: 0,
      written: 0,
      keptAdmin: 0,
    };
    summaries.push(summary);
    if (fixtures.length === 0) continue;

    // The club's own side only: the lineup's team belongs to the tenant's organisation.
    const lineups = await opts.central.query<{ match_id: string; players: unknown }>(
      `select l.match_id::text as match_id, l.players
         from playhq.match_lineups l
         join playhq.matches m on m.id = l.match_id
        where l.match_id = any($1::uuid[])
          and ((l.team_id = m.home_team_id and m.home_org_id = $2)
            or (l.team_id = m.away_team_id and m.away_org_id = $2))`,
      [fixtures.map((f) => f.matchId), orgId],
    );
    const byMatch = new Map<string, LineupEntry[]>();
    for (const r of lineups.rows) {
      const entries = lineupEntries(r.players);
      if (entries.length) byMatch.set(r.match_id.toLowerCase(), entries);
    }
    if (byMatch.size === 0) continue;

    const guids = [
      ...new Set(
        [...byMatch.values()]
          .flat()
          .map((e) => e.participantId?.toLowerCase())
          .filter((g): g is string => !!g),
      ),
    ];
    const playerIdOf = new Map<string, number>();
    if (guids.length) {
      const mapped = await db
        .select({ guid: playerIdMapTable.participantId, playerId: playerIdMapTable.playerId })
        .from(playerIdMapTable)
        .where(
          and(
            eq(playerIdMapTable.tenantId, t.id),
            inArray(sql<string>`lower(${playerIdMapTable.participantId})`, guids),
          ),
        );
      for (const m of mapped) playerIdOf.set(m.guid.toLowerCase(), m.playerId);
    }

    const existing = await db
      .select()
      .from(teamListsTable)
      .where(
        and(
          eq(teamListsTable.tenantId, t.id),
          inArray(
            teamListsTable.fixtureId,
            fixtures.map((f) => f.id),
          ),
        ),
      );
    const existingOf = new Map(existing.map((r) => [r.fixtureId, r]));

    for (const f of fixtures) {
      const entries = f.matchId ? byMatch.get(f.matchId.toLowerCase()) : undefined;
      if (!entries?.length) continue;
      const players = lineupToTeamList(entries, playerIdOf);
      if (players.length === 0) continue;
      summary.selections++;
      const current = existingOf.get(f.id);
      if (current && current.source !== "playhq") {
        summary.keptAdmin++;
        continue;
      }
      if (current && current.isPublished && sameTeamList(current.players, players)) continue;
      await db
        .insert(teamListsTable)
        .values({ tenantId: t.id, fixtureId: f.id, players, isPublished: true, source: "playhq" })
        .onConflictDoUpdate({
          target: [teamListsTable.tenantId, teamListsTable.fixtureId],
          set: { players, isPublished: true },
          // Never over an admin's list, even one saved since it was read above.
          setWhere: sql`${teamListsTable.source} = 'playhq'`,
        });
      summary.written++;
    }
    log(
      `tenant ${t.id}: ${summary.selections} PlayHQ team selection(s) → ${summary.written} written, ${summary.keptAdmin} kept (admin's list)`,
    );
  }
  return summaries;
}
