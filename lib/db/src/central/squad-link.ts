import { and, eq, isNotNull } from "drizzle-orm";
import {
  centralDb,
  centralMatchesTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralPlayersTable,
} from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { appGradeFromCentral, classifyCentralGrade, parseSeasonStartYear } from "./grades";
import { isPrivateRow } from "./privacy";
import { inList } from "./where";

export interface CurrentSeasonSquadPlayer {
  participantId: string;
  name: string;
  section: "senior" | "junior";
  gradeHint: string | null;
  isPrivate: boolean;
}

/** Roster/scorecard appearances for this club and season, never opponents or past seasons. */
export async function centralCurrentSeasonSquad(
  clubId: number,
  season: number,
): Promise<CurrentSeasonSquadPlayer[]> {
  const lines = (
    t: typeof centralMatchRostersTable | typeof centralMatchBattingTable | typeof centralMatchBowlingTable,
  ) => centralDb.selectDistinct({
    participantId: t.participantId,
    name: t.playerName,
    season: centralMatchesTable.season,
    grade: centralMatchesTable.grade,
  }).from(t).innerJoin(centralMatchesTable, eq(t.matchId, centralMatchesTable.matchId))
    .where(and(eq(t.clubId, clubId), isNotNull(t.participantId)));
  const rows = (await Promise.all([
    lines(centralMatchRostersTable), lines(centralMatchBattingTable), lines(centralMatchBowlingTable),
  ])).flat();
  const current = rows.filter((r) => parseSeasonStartYear(r.season) === season);
  const ids = [...new Set(current.map((r) => r.participantId!))];
  if (!ids.length) return [];
  const players = await centralDb.select({
    participantId: centralPlayersTable.participantId,
    displayName: centralPlayersTable.displayName,
    isPrivate: centralPlayersTable.isPrivate,
  }).from(centralPlayersTable).where(inList(centralPlayersTable.participantId, ids));
  const byId = new Map(players.map((p) => [p.participantId, p]));
  const result = new Map<string, CurrentSeasonSquadPlayer>();
  for (const r of current) {
    const classification = classifyCentralGrade(r.grade);
    const junior = classification.note?.startsWith("WA junior/pathway") ?? false;
    if (!junior && classification.appGrade === null) continue;
    const p = byId.get(r.participantId!);
    const name = p?.displayName?.trim() || r.name?.trim();
    if (!name) continue;
    const prev = result.get(r.participantId!);
    // A junior who also plays senior cricket belongs to the senior selection pool.
    if (prev?.section === "senior") continue;
    result.set(r.participantId!, {
      participantId: r.participantId!, name,
      section: junior ? "junior" : "senior",
      gradeHint: classification.appGrade ?? r.grade,
      isPrivate: isPrivateRow(p),
    });
  }
  return [...result.values()];
}

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
