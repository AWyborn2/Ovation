import type { PlayerMatchLine, PlayerSeasonStat } from "@workspace/api-client-react";
import type { Discipline } from "../use-stats-view";
import {
  baselineTotals,
  filterMatches,
  isCareer,
  sortMatchesChronological,
  type StatsRange,
} from "./range";
import { type Analytic, insufficient, MIN_POINTS, NO_BOWLING_REASON, ready } from "./shared";

/**
 * Career race (Compare, R3): cumulative runs or wickets by GAMES PLAYED (not
 * date), so eras compare fairly. On a Career range each line is seeded with
 * the pre-scorecard baseline (KTD3): it starts at (baseline games, baseline
 * total) instead of the origin. A bounded range cumulates from zero within it.
 */

export interface RacePoint {
  games: number;
  value: number;
  /** Null for the seed point (origin or baseline). */
  matchId: number | null;
  season: number | null;
}

export interface RaceSeries {
  key: string;
  points: RacePoint[];
  /** The seed the line starts from. */
  start: { games: number; value: number };
  final: { games: number; value: number };
}

export function raceSeries(
  key: string,
  matches: ReadonlyArray<PlayerMatchLine>,
  seasons: ReadonlyArray<PlayerSeasonStat>,
  discipline: Discipline,
  range: StatsRange,
): RaceSeries {
  const career = isCareer(range);
  const base = career ? baselineTotals(seasons) : null;
  const start = {
    games: base?.games ?? 0,
    value: base ? (discipline === "bowl" ? base.wickets : base.runs) : 0,
  };
  const points: RacePoint[] = [{ ...start, matchId: null, season: null }];
  let games = start.games;
  let value = start.value;
  for (const m of sortMatchesChronological(filterMatches(matches, range))) {
    games += 1;
    value +=
      discipline === "bowl"
        ? m.bowled
          ? (m.wickets ?? 0)
          : 0
        : (m.innings ?? []).reduce((s, i) => s + (i.runs ?? 0), 0);
    points.push({ games, value, matchId: m.matchId, season: m.season ?? null });
  }
  return { key, points, start, final: { games, value } };
}

/**
 * The cumulative value after exactly `games` games, or null when that point
 * isn't on the line (before a baseline-seeded start, or past the career).
 */
export function valueAtGames(series: RaceSeries, games: number): number | null {
  return series.points.find((p) => p.games === games)?.value ?? null;
}

export interface RaceInput {
  key: string;
  matches: ReadonlyArray<PlayerMatchLine>;
  seasons: ReadonlyArray<PlayerSeasonStat>;
}

export interface Race {
  series: RaceSeries[];
  /**
   * Who led after N games, N = the shortest career among the players. Null
   * when a player's value at N isn't known (their baseline starts past N).
   */
  aheadAfter: {
    games: number;
    values: number[];
    /** Index into `series`; null on a tie. */
    leader: number | null;
  } | null;
}

export function careerRace(
  inputs: ReadonlyArray<RaceInput>,
  discipline: Discipline,
  range: StatsRange,
): Analytic<Race> {
  const series = inputs.map((p) => raceSeries(p.key, p.matches, p.seasons, discipline, range));
  if (discipline === "bowl" && series.every((s) => s.final.value === 0)) {
    return insufficient(NO_BOWLING_REASON);
  }
  if (series.every((s) => s.points.length < MIN_POINTS)) {
    return insufficient("Fewer than 3 games in this range");
  }
  const n = Math.min(...series.map((s) => s.final.games));
  const values = series.map((s) => valueAtGames(s, n));
  let aheadAfter: Race["aheadAfter"] = null;
  if (series.length > 1 && values.every((v): v is number => v != null)) {
    const top = Math.max(...values);
    const leaders = values.flatMap((v, i) => (v === top ? [i] : []));
    aheadAfter = { games: n, values, leader: leaders.length === 1 ? leaders[0] : null };
  }
  return ready({ series, aheadAfter });
}
