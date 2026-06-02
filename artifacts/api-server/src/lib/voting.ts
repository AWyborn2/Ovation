import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  playersTable,
  matchesTable,
  matchPlayerLinesTable,
  awardBallotsTable,
  type AwardVotingConfigRow,
} from "@workspace/db";

export type TallyEntry = {
  playerId: number;
  name: string;
  points: number;
  firstPlaces: number;
  secondPlaces: number;
  thirdPlaces: number;
};

export type ComputedTally = {
  roundsPlayed: number;
  entries: TallyEntry[];
  winnerPlayerIds: number[];
};

export function playerName(p: { givenName: string; surname: string }): string {
  return `${p.givenName} ${p.surname}`.trim();
}

/** Map playerId -> "Given Surname" for the supplied ids. */
export async function loadPlayerNames(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const rows = await db
    .select({
      id: playersTable.id,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
    })
    .from(playersTable)
    .where(inArray(playersTable.id, unique));
  for (const r of rows) map.set(r.id, playerName(r));
  return map;
}

/** Distinct imported (non-abandoned) round numbers for the tracked grades+season. */
export async function countRoundsPlayed(
  grades: string[],
  season: number,
): Promise<number> {
  if (grades.length === 0) return 0;
  const rows = await db
    .select({ round: matchesTable.round })
    .from(matchesTable)
    .where(
      and(
        inArray(matchesTable.grade, grades),
        eq(matchesTable.season, season),
        eq(matchesTable.abandoned, false),
        isNotNull(matchesTable.round),
      ),
    );
  const rounds = new Set<number>();
  for (const r of rows) if (r.round != null) rounds.add(r.round);
  return rounds.size;
}

/** Sum 3-2-1 points across every ballot for a voting config. */
export async function computeTally(config: AwardVotingConfigRow): Promise<ComputedTally> {
  const ballots = await db
    .select()
    .from(awardBallotsTable)
    .where(eq(awardBallotsTable.configId, config.id));

  type Agg = Omit<TallyEntry, "name">;
  const byPlayer = new Map<number, Agg>();
  const bump = (playerId: number, points: number, place: 1 | 2 | 3) => {
    let a = byPlayer.get(playerId);
    if (!a) {
      a = { playerId, points: 0, firstPlaces: 0, secondPlaces: 0, thirdPlaces: 0 };
      byPlayer.set(playerId, a);
    }
    a.points += points;
    if (place === 1) a.firstPlaces += 1;
    else if (place === 2) a.secondPlaces += 1;
    else a.thirdPlaces += 1;
  };
  for (const b of ballots) {
    bump(b.pick1PlayerId, 3, 1);
    bump(b.pick2PlayerId, 2, 2);
    bump(b.pick3PlayerId, 1, 3);
  }

  const names = await loadPlayerNames([...byPlayer.keys()]);
  const entries: TallyEntry[] = [...byPlayer.values()]
    .map((a) => ({ ...a, name: names.get(a.playerId) ?? `#${a.playerId}` }))
    .sort(
      (x, y) =>
        y.points - x.points ||
        y.firstPlaces - x.firstPlaces ||
        x.name.localeCompare(y.name),
    );

  const top = entries.length > 0 ? entries[0].points : 0;
  const winnerPlayerIds =
    top > 0 ? entries.filter((e) => e.points === top).map((e) => e.playerId) : [];

  const roundsPlayed = await countRoundsPlayed(config.grades, config.season);
  return { entries, winnerPlayerIds, roundsPlayed };
}

/** Whether the live tally is publicly visible per the admin's rules. */
export function isTallyVisible(config: AwardVotingConfigRow, roundsPlayed: number): boolean {
  if (!config.votingEnabled || !config.tallyVisible) return false;
  if (config.autoHideAfterRounds != null && roundsPlayed >= config.autoHideAfterRounds) {
    return false;
  }
  return true;
}

export type EligiblePlayer = { playerId: number; name: string };
export type MatchRound = {
  round: number;
  matchId: number;
  opponent: string | null;
  matchDate: string | null;
  players: EligiblePlayer[];
};

/** Imported (non-abandoned) rounds for a grade+season with their players. */
export async function loadRoundsForGrade(
  grade: string,
  season: number,
): Promise<MatchRound[]> {
  const matches = await db
    .select({
      id: matchesTable.id,
      round: matchesTable.round,
      opponent: matchesTable.opponent,
      matchDate: matchesTable.matchDate,
    })
    .from(matchesTable)
    .where(
      and(
        eq(matchesTable.grade, grade),
        eq(matchesTable.season, season),
        eq(matchesTable.abandoned, false),
        isNotNull(matchesTable.round),
      ),
    );
  if (matches.length === 0) return [];

  const lines = await db
    .select({
      matchId: matchPlayerLinesTable.matchId,
      playerId: matchPlayerLinesTable.playerId,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
    })
    .from(matchPlayerLinesTable)
    .innerJoin(playersTable, eq(playersTable.id, matchPlayerLinesTable.playerId))
    .where(
      inArray(
        matchPlayerLinesTable.matchId,
        matches.map((m) => m.id),
      ),
    );

  const playersByMatch = new Map<number, EligiblePlayer[]>();
  for (const l of lines) {
    if (!playersByMatch.has(l.matchId)) playersByMatch.set(l.matchId, []);
    playersByMatch
      .get(l.matchId)!
      .push({ playerId: l.playerId, name: playerName(l) });
  }
  for (const arr of playersByMatch.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name));
  }

  return matches
    .filter((m) => m.round != null)
    .map((m) => ({
      round: m.round as number,
      matchId: m.id,
      opponent: m.opponent,
      matchDate: m.matchDate,
      players: playersByMatch.get(m.id) ?? [],
    }))
    .sort((a, b) => a.round - b.round);
}
