import { and, eq, gte, isNotNull, lt } from "drizzle-orm";
import {
  centralDb,
  centralMatchesTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralPlayersTable,
} from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { appGradeFromCentral, parseSeasonStartYear } from "./grades";
import { isPrivateRow } from "./privacy";
import { inList } from "./where";

/** One participant who has played for a club, with the names they appear under. */
export interface CentralClubPlayerName {
  participantId: string;
  /** Every distinct line name for the club (roster, batting, bowling), e.g. "J Wyllie". */
  lineNames: string[];
  /** `central.players.display_name`, or null when central has none. */
  displayName: string | null;
  isPrivate: boolean;
  /** Start year of the latest season they appeared for the club (2025 for 2025/26). */
  lastSeasonYear: number | null;
}

/**
 * Every participant who has appeared for a club in a SENIOR match, with their
 * line names and latest season — the candidates the squad import links a
 * PlayHQ participant export against, and the pool the admin's player search
 * draws from (squad player linking). Junior / pathway / unmapped grades are
 * dropped (juniors isolation): squad links point at senior player records.
 *
 * Roster, batting and bowling lines are all read, so a player with a scorecard
 * line but no roster row is still a candidate. Names come back as stored
 * (central keeps "J Wyllie", sometimes lower-case); matching is the caller's.
 * Private players are included and flagged: these reads back admin-only
 * screens, and a private player's name must not reach a public one.
 */
export async function centralClubPlayerNames(clubId: number): Promise<CentralClubPlayerName[]> {
  return withCentralCache(cacheKey("centralClubPlayerNames", [clubId]), () =>
    centralClubPlayerNamesImpl(clubId),
  );
}

async function centralClubPlayerNamesImpl(clubId: number): Promise<CentralClubPlayerName[]> {
  const m = centralMatchesTable;
  const lines = (
    t:
      | typeof centralMatchRostersTable
      | typeof centralMatchBattingTable
      | typeof centralMatchBowlingTable,
  ) =>
    centralDb
      .selectDistinct({
        participantId: t.participantId,
        playerName: t.playerName,
        season: m.season,
        grade: m.grade,
      })
      .from(t)
      .innerJoin(m, eq(m.matchId, t.matchId))
      .where(and(eq(t.clubId, clubId), isNotNull(t.participantId)));

  const rows = (
    await Promise.all([
      lines(centralMatchRostersTable),
      lines(centralMatchBattingTable),
      lines(centralMatchBowlingTable),
    ])
  ).flat();

  const byPid = new Map<string, { names: Set<string>; last: number | null }>();
  for (const r of rows) {
    if (!r.participantId || appGradeFromCentral(r.grade) === null) continue;
    let e = byPid.get(r.participantId);
    if (!e) {
      e = { names: new Set(), last: null };
      byPid.set(r.participantId, e);
    }
    const name = r.playerName?.trim();
    if (name) e.names.add(name);
    const year = parseSeasonStartYear(r.season);
    if (year !== null && (e.last === null || year > e.last)) e.last = year;
  }
  if (byPid.size === 0) return [];

  const players = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    .where(inList(centralPlayersTable.participantId, [...byPid.keys()]));
  const player = new Map(players.map((p) => [p.participantId, p]));

  return [...byPid].map(([participantId, e]) => {
    const p = player.get(participantId);
    return {
      participantId,
      lineNames: [...e.names].sort(),
      displayName: p?.displayName?.trim() || null,
      isPrivate: isPrivateRow(p),
      lastSeasonYear: e.last,
    };
  });
}

/** One participant's appearances for a club in a window of senior matches. */
export interface CentralClubSeasonPlayer {
  participantId: string;
  /** Every distinct line name in the window, e.g. "J Wyllie". */
  lineNames: string[];
  /** `central.players.display_name` ("Surname, Firstname" for PlayHQ-loaded players), or null. */
  displayName: string | null;
  isPrivate: boolean;
  /** The app grade of their most recent appearance in the window. */
  lastGrade: string | null;
  /** `YYYY-MM-DD` of that appearance. */
  lastMatchDate: string | null;
}

/**
 * Everyone who appeared for a club in a SENIOR match dated `from` (inclusive)
 * to `to` (exclusive), both `YYYY-MM-DD` — the season's played sides that fill
 * a squad register without a PlayHQ participant export (`squad-season-seed.ts`
 * in the API). Junior / pathway / unmapped grades are dropped (juniors
 * isolation). Roster, batting and bowling lines are all read. Private players
 * are included and flagged: the register is admin-only.
 */
export async function centralClubSeasonPlayers(
  clubId: number,
  from: string,
  to: string,
): Promise<CentralClubSeasonPlayer[]> {
  return withCentralCache(cacheKey("centralClubSeasonPlayers", [clubId, from, to]), () =>
    centralClubSeasonPlayersImpl(clubId, from, to),
  );
}

async function centralClubSeasonPlayersImpl(
  clubId: number,
  from: string,
  to: string,
): Promise<CentralClubSeasonPlayer[]> {
  const m = centralMatchesTable;
  const lines = (
    t:
      | typeof centralMatchRostersTable
      | typeof centralMatchBattingTable
      | typeof centralMatchBowlingTable,
  ) =>
    centralDb
      .selectDistinct({
        participantId: t.participantId,
        playerName: t.playerName,
        grade: m.grade,
        matchDate: m.matchDate,
      })
      .from(t)
      .innerJoin(m, eq(m.matchId, t.matchId))
      .where(
        and(
          eq(t.clubId, clubId),
          isNotNull(t.participantId),
          gte(m.matchDate, from),
          lt(m.matchDate, to),
        ),
      );

  const rows = (
    await Promise.all([
      lines(centralMatchRostersTable),
      lines(centralMatchBattingTable),
      lines(centralMatchBowlingTable),
    ])
  ).flat();

  const byPid = new Map<
    string,
    { names: Set<string>; grade: string | null; date: string | null }
  >();
  for (const r of rows) {
    const grade = appGradeFromCentral(r.grade);
    if (!r.participantId || grade === null) continue;
    let e = byPid.get(r.participantId);
    if (!e) {
      e = { names: new Set(), grade: null, date: null };
      byPid.set(r.participantId, e);
    }
    const name = r.playerName?.trim();
    if (name) e.names.add(name);
    if (r.matchDate && (e.date === null || r.matchDate > e.date)) {
      e.date = r.matchDate;
      e.grade = grade;
    }
  }
  if (byPid.size === 0) return [];

  const players = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    .where(inList(centralPlayersTable.participantId, [...byPid.keys()]));
  const player = new Map(players.map((p) => [p.participantId, p]));

  return [...byPid].map(([participantId, e]) => {
    const p = player.get(participantId);
    return {
      participantId,
      lineNames: [...e.names].sort(),
      displayName: p?.displayName?.trim() || null,
      isPrivate: isPrivateRow(p),
      lastGrade: e.grade,
      lastMatchDate: e.date,
    };
  });
}
