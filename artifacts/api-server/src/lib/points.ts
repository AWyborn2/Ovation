import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  playersTable,
  matchesTable,
  matchPlayerLinesTable,
  type AwardPointsConfigRow,
} from "@workspace/db";
import { playerName } from "./voting";

/** The nine scorable stat categories of a points award. */
export type PointsCategoryKey =
  | "runs"
  | "wickets"
  | "catches"
  | "stumpings"
  | "runOuts"
  | "games"
  | "fifties"
  | "hundreds"
  | "fiveWickets";

export type PointsCategory = { enabled: boolean; value: number };
export type PointsCategories = Record<PointsCategoryKey, PointsCategory>;

export type PointsLeaderboardEntry = {
  playerId: number;
  name: string;
  points: number;
  runs: number;
  wickets: number;
  catches: number;
  stumpings: number;
  runOuts: number;
  games: number;
  fifties: number;
  hundreds: number;
  fiveWickets: number;
};

export type ComputedLeaderboard = {
  entries: PointsLeaderboardEntry[];
  winnerPlayerIds: number[];
};

/** Pull the per-category (enabled, value) pairs off a stored config row. */
export function configCategories(c: AwardPointsConfigRow): PointsCategories {
  return {
    runs: { enabled: c.runsEnabled, value: c.runsValue },
    wickets: { enabled: c.wicketsEnabled, value: c.wicketsValue },
    catches: { enabled: c.catchesEnabled, value: c.catchesValue },
    stumpings: { enabled: c.stumpingsEnabled, value: c.stumpingsValue },
    runOuts: { enabled: c.runOutsEnabled, value: c.runOutsValue },
    games: { enabled: c.gamesEnabled, value: c.gamesValue },
    fifties: { enabled: c.fiftiesEnabled, value: c.fiftiesValue },
    hundreds: { enabled: c.hundredsEnabled, value: c.hundredsValue },
    fiveWickets: { enabled: c.fiveWicketsEnabled, value: c.fiveWicketsValue },
  };
}

type Agg = Omit<PointsLeaderboardEntry, "name" | "points">;

function emptyAgg(playerId: number): Agg {
  return {
    playerId,
    runs: 0,
    wickets: 0,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    games: 0,
    fifties: 0,
    hundreds: 0,
    fiveWickets: 0,
  };
}

function score(agg: Agg, cats: PointsCategories): number {
  let total = 0;
  if (cats.runs.enabled) total += agg.runs * cats.runs.value;
  if (cats.wickets.enabled) total += agg.wickets * cats.wickets.value;
  if (cats.catches.enabled) total += agg.catches * cats.catches.value;
  if (cats.stumpings.enabled) total += agg.stumpings * cats.stumpings.value;
  if (cats.runOuts.enabled) total += agg.runOuts * cats.runOuts.value;
  if (cats.games.enabled) total += agg.games * cats.games.value;
  if (cats.fifties.enabled) total += agg.fifties * cats.fifties.value;
  if (cats.hundreds.enabled) total += agg.hundreds * cats.hundreds.value;
  if (cats.fiveWickets.enabled) total += agg.fiveWickets * cats.fiveWickets.value;
  return total;
}

/**
 * Tally a points award for the grade fixed on the award (`grade`) and the
 * config's season. Sums each player's match lines, derives milestone counts
 * (50s/100s/5-fers) per innings, and multiplies by the enabled category values.
 * Finals matches (matches.stage NOT NULL) are excluded unless `includeFinals`.
 */
export async function computeLeaderboard(
  config: AwardPointsConfigRow,
  grade: string,
): Promise<ComputedLeaderboard> {
  const matchWhere = config.includeFinals
    ? and(eq(matchesTable.grade, grade), eq(matchesTable.season, config.season), eq(matchesTable.abandoned, false))
    : and(
        eq(matchesTable.grade, grade),
        eq(matchesTable.season, config.season),
        eq(matchesTable.abandoned, false),
        isNull(matchesTable.stage),
      );

  const lines = await db
    .select({
      playerId: matchPlayerLinesTable.playerId,
      runs: matchPlayerLinesTable.runs,
      wickets: matchPlayerLinesTable.wickets,
      catches: matchPlayerLinesTable.catches,
      stumpings: matchPlayerLinesTable.stumpings,
      runOuts: matchPlayerLinesTable.runOuts,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
    })
    .from(matchPlayerLinesTable)
    .innerJoin(matchesTable, eq(matchesTable.id, matchPlayerLinesTable.matchId))
    .innerJoin(playersTable, eq(playersTable.id, matchPlayerLinesTable.playerId))
    .where(matchWhere);

  const byPlayer = new Map<number, Agg>();
  const names = new Map<number, string>();
  for (const l of lines) {
    let a = byPlayer.get(l.playerId);
    if (!a) {
      a = emptyAgg(l.playerId);
      byPlayer.set(l.playerId, a);
      names.set(l.playerId, playerName(l));
    }
    const runs = l.runs ?? 0;
    const wickets = l.wickets ?? 0;
    a.runs += runs;
    a.wickets += wickets;
    a.catches += l.catches ?? 0;
    a.stumpings += l.stumpings ?? 0;
    a.runOuts += l.runOuts ?? 0;
    a.games += 1;
    if (runs >= 100) a.hundreds += 1;
    else if (runs >= 50) a.fifties += 1;
    if (wickets >= 5) a.fiveWickets += 1;
  }

  const cats = configCategories(config);
  const entries: PointsLeaderboardEntry[] = [...byPlayer.values()]
    .map((a) => ({
      ...a,
      name: names.get(a.playerId) ?? `#${a.playerId}`,
      points: score(a, cats),
    }))
    .sort(
      (x, y) =>
        y.points - x.points ||
        y.runs - x.runs ||
        y.wickets - x.wickets ||
        x.name.localeCompare(y.name),
    );

  const top = entries.length > 0 ? entries[0].points : 0;
  const winnerPlayerIds =
    top > 0 ? entries.filter((e) => e.points === top).map((e) => e.playerId) : [];

  return { entries, winnerPlayerIds };
}

/** Whether the live leaderboard should be publicly visible. */
export function isLeaderboardVisible(
  config: AwardPointsConfigRow,
  awardPublished: boolean,
): boolean {
  return awardPublished && config.leaderboardVisible;
}
