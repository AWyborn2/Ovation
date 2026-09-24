import { and, eq, gte, inArray, isNotNull, lt, lte, sql, type SQL } from "drizzle-orm";
import {
  db,
  playerGradeSeasonStatsTable as pgss,
  playersTable,
  matchesTable,
  matchPlayerLinesTable,
} from "@workspace/db";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";
import { matchDateExpr } from "./grades-helpers";
import {
  beats,
  parseRecordValue,
  type ProgressionCandidate,
  type RecordKind,
  type RecordsFilter,
} from "./records-analytics";

/**
 * Native (tenant #1) reads behind the filtered `/records`, `/records/leaders`
 * and `/records/progression` (stats plan U9). All read the per-(player, grade,
 * season) snapshot `player_grade_season_stats` — a season span drops the
 * pre-scorecard baseline (season = NULL) rows, a Career span keeps them — and
 * every query excludes fill-ins (player_id >= FILL_IN_THRESHOLD).
 */

function seasonRowConds(filter: RecordsFilter): SQL[] {
  const conds: SQL[] = [lt(pgss.playerId, FILL_IN_THRESHOLD)];
  if (filter.grade !== undefined) conds.push(eq(pgss.grade, filter.grade));
  if (filter.fromSeason !== undefined) conds.push(gte(pgss.season, filter.fromSeason));
  if (filter.toSeason !== undefined) conds.push(lte(pgss.season, filter.toSeason));
  return conds;
}

async function loadSeasonRows(filter: RecordsFilter) {
  return db
    .select({
      id: pgss.id,
      playerId: pgss.playerId,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
      grade: pgss.grade,
      season: pgss.season,
      games: pgss.games,
      innings: pgss.innings,
      notOuts: pgss.notOuts,
      runs: pgss.runs,
      highScore: pgss.highScore,
      fifties: pgss.fifties,
      hundreds: pgss.hundreds,
      wickets: pgss.wickets,
      runsConceded: pgss.runsConceded,
      bestBowling: pgss.bestBowling,
      fiveWickets: pgss.fiveWickets,
      catches: pgss.catches,
      stumpings: pgss.stumpings,
      runOuts: pgss.runOuts,
    })
    .from(pgss)
    .innerJoin(playersTable, eq(playersTable.id, pgss.playerId))
    .where(and(...seasonRowConds(filter)))
    .orderBy(pgss.season, pgss.id);
}

type SeasonRow = Awaited<ReturnType<typeof loadSeasonRows>>[number];

const round2 = (n: number) => Math.round(n * 100) / 100;

type CountingKey = "games" | "runs" | "wickets" | "catches" | "fifties" | "hundreds";

/** The club records (`ClubRecords` shape) over a grade and/or season span. */
export async function nativeFilteredRecords(filter: RecordsFilter) {
  const rows = await loadSeasonRows(filter);

  const holder = (key: CountingKey) => {
    const totals = new Map<number, { row: SeasonRow; value: number; grades: Set<string> }>();
    for (const r of rows) {
      let t = totals.get(r.playerId);
      if (!t) {
        t = { row: r, value: 0, grades: new Set() };
        totals.set(r.playerId, t);
      }
      t.value += r[key] ?? 0;
      if ((r.games ?? 0) > 0) t.grades.add(r.grade);
    }
    let best: { row: SeasonRow; value: number; grades: Set<string> } | null = null;
    for (const t of totals.values()) {
      if (t.value <= 0) continue;
      if (
        !best ||
        t.value > best.value ||
        (t.value === best.value && t.row.playerId < best.row.playerId)
      )
        best = t;
    }
    return best
      ? {
          playerId: best.row.playerId,
          givenName: best.row.givenName,
          surname: best.row.surname,
          value: best.value,
          grades: [...best.grades].sort(),
        }
      : null;
  };

  const single = (kind: RecordKind) => {
    const field = kind === "highScore" ? "highScore" : "bestBowling";
    let best: { row: SeasonRow; v: NonNullable<ReturnType<typeof parseRecordValue>> } | null = null;
    // Rows are ordered by season (NULL baseline last in Postgres ASC), so ties
    // keep the earliest holder.
    for (const r of rows) {
      const v = parseRecordValue(kind, r[field]);
      if (v && (!best || beats(kind, v, best.v))) best = { row: r, v };
    }
    if (!best) return null;
    const r = best.row;
    const outs = (r.innings ?? 0) - (r.notOuts ?? 0);
    return {
      id: r.id,
      playerId: r.playerId,
      surname: r.surname,
      givenName: r.givenName,
      grade: r.grade,
      season: r.season,
      games: r.games,
      innings: r.innings,
      notOuts: r.notOuts,
      runs: r.runs,
      batAvg: outs > 0 && r.runs != null ? round2(r.runs / outs) : null,
      highScore: r.highScore,
      fifties: r.fifties,
      hundreds: r.hundreds,
      wickets: r.wickets,
      runsConceded: r.runsConceded,
      bowlAvg:
        (r.wickets ?? 0) > 0 && r.runsConceded != null
          ? round2(r.runsConceded / (r.wickets as number))
          : null,
      bestBowling: r.bestBowling,
      fiveWickets: r.fiveWickets,
      catches: r.catches,
      stumpings: r.stumpings,
      runOuts: r.runOuts,
    };
  };

  return {
    mostGames: holder("games"),
    mostRuns: holder("runs"),
    mostWickets: holder("wickets"),
    highestScore: single("highScore"),
    bestBowling: single("bestBowling"),
    mostCatches: holder("catches"),
    mostFifties: holder("fifties"),
    mostHundreds: holder("hundreds"),
  };
}

export type LeaderMetric = "runs" | "wickets" | "catches" | "hundreds" | "games";

const METRIC_COLUMN = {
  runs: pgss.runs,
  wickets: pgss.wickets,
  catches: pgss.catches,
  hundreds: pgss.hundreds,
  games: pgss.games,
} as const;

/**
 * Every player's total for `metric` over the filter, highest first (value > 0
 * only). `lastSeason` is the player's latest season row in any grade — it
 * drives the "still playing" marker, so it ignores the filter.
 */
export async function nativeRecordLeaders(metric: LeaderMetric, filter: RecordsFilter) {
  const col = METRIC_COLUMN[metric];
  const total = sql<number>`coalesce(sum(${col}), 0)::int`;
  const rows = await db
    .select({
      playerId: pgss.playerId,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
      value: total,
    })
    .from(pgss)
    .innerJoin(playersTable, eq(playersTable.id, pgss.playerId))
    .where(and(...seasonRowConds(filter)))
    .groupBy(pgss.playerId, playersTable.givenName, playersTable.surname)
    .having(sql`coalesce(sum(${col}), 0) > 0`)
    .orderBy(sql`${total} desc`, playersTable.surname, playersTable.givenName, pgss.playerId);
  return rows.map((r) => ({ ...r, value: Number(r.value) }));
}

/** Latest season (start year) per player, across every grade. */
export async function nativeLastSeasons(playerIds: number[]): Promise<Map<number, number>> {
  if (playerIds.length === 0) return new Map();
  const rows = await db
    .select({ playerId: pgss.playerId, last: sql<number | null>`max(${pgss.season})` })
    .from(pgss)
    .where(and(inArray(pgss.playerId, playerIds), isNotNull(pgss.season)))
    .groupBy(pgss.playerId);
  return new Map(
    rows.filter((r) => r.last !== null).map((r) => [r.playerId, Number(r.last)] as const),
  );
}

export interface NativePlayerRef {
  playerId: number;
}

/**
 * Progression inputs for one kind: scorecard innings (dated by match), season
 * snapshot figures (dated by season; `seasonLevel`) and baseline career
 * figures (season NULL → undated). Fill-ins excluded throughout.
 */
export async function nativeProgressionCandidates(
  kind: RecordKind,
  grade: string | undefined,
): Promise<{
  dated: ProgressionCandidate<NativePlayerRef>[];
  undated: ProgressionCandidate<NativePlayerRef>[];
}> {
  const isoDate = sql<string | null>`to_char(${matchDateExpr}, 'YYYY-MM-DD')`;
  const lineConds: SQL[] = [lt(matchPlayerLinesTable.playerId, FILL_IN_THRESHOLD)];
  if (grade !== undefined) lineConds.push(eq(matchesTable.grade, grade));
  if (kind === "highScore") {
    lineConds.push(eq(matchPlayerLinesTable.batted, true), isNotNull(matchPlayerLinesTable.runs));
  } else {
    lineConds.push(eq(matchPlayerLinesTable.bowled, true), gte(matchPlayerLinesTable.wickets, 1));
  }
  const seasonConds: SQL[] = [lt(pgss.playerId, FILL_IN_THRESHOLD)];
  if (grade !== undefined) seasonConds.push(eq(pgss.grade, grade));
  seasonConds.push(isNotNull(kind === "highScore" ? pgss.highScore : pgss.bestBowling));

  const [lines, seasonRows] = await Promise.all([
    db
      .select({
        playerId: matchPlayerLinesTable.playerId,
        runs: matchPlayerLinesTable.runs,
        notOut: matchPlayerLinesTable.notOut,
        wickets: matchPlayerLinesTable.wickets,
        runsConceded: matchPlayerLinesTable.runsConceded,
        matchId: matchesTable.id,
        grade: matchesTable.grade,
        season: matchesTable.season,
        matchDate: isoDate,
      })
      .from(matchPlayerLinesTable)
      .innerJoin(matchesTable, eq(matchesTable.id, matchPlayerLinesTable.matchId))
      .where(and(...lineConds)),
    db
      .select({
        playerId: pgss.playerId,
        grade: pgss.grade,
        season: pgss.season,
        highScore: pgss.highScore,
        bestBowling: pgss.bestBowling,
      })
      .from(pgss)
      .where(and(...seasonConds)),
  ]);

  const dated: ProgressionCandidate<NativePlayerRef>[] = [];
  const undated: ProgressionCandidate<NativePlayerRef>[] = [];
  for (const l of lines) {
    const value =
      kind === "highScore"
        ? { primary: l.runs ?? 0, secondary: l.notOut ? 1 : 0 }
        : { primary: l.wickets ?? 0, secondary: l.runsConceded ?? 0 };
    dated.push({
      player: { playerId: l.playerId },
      grade: l.grade,
      season: l.season,
      matchId: l.matchId,
      matchDate: l.matchDate,
      value,
    });
  }
  for (const r of seasonRows) {
    const value = parseRecordValue(kind, kind === "highScore" ? r.highScore : r.bestBowling);
    if (!value) continue;
    const c: ProgressionCandidate<NativePlayerRef> = {
      player: { playerId: r.playerId },
      grade: r.grade,
      season: r.season,
      matchId: null,
      matchDate: null,
      value,
      seasonLevel: true,
    };
    (r.season === null ? undated : dated).push(c);
  }
  return { dated, undated };
}

/** Display names for native player ids. */
export async function nativePlayerNames(
  ids: number[],
): Promise<Map<number, { givenName: string; surname: string }>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: playersTable.id,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
    })
    .from(playersTable)
    .where(inArray(playersTable.id, ids));
  return new Map(rows.map((r) => [r.id, { givenName: r.givenName, surname: r.surname }]));
}
