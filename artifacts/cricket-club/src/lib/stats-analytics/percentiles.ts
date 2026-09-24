import type {
  GradeDistribution,
  GradeDistributionBest,
  GradeDistributionPlayer,
} from "@workspace/api-client-react";
import { type Analytic, insufficient, isLowerBetter, type MetricKey, ready } from "./shared";

/**
 * Ranks (Profile "Where he ranks") and "% of club best" (Compare radar), from
 * the grade distribution endpoint (U5, KTD4). Percentiles are mid-rank: the
 * share of qualifiers the player beats, counting ties as half — so the median
 * player sits at exactly 50. Lower-is-better metrics invert (beating = lower).
 */

export type DistributionMetric = keyof GradeDistributionBest;

export const DISTRIBUTION_METRICS: ReadonlyArray<{ key: DistributionMetric; label: string }> = [
  { key: "games", label: "Games" },
  { key: "catches", label: "Catches" },
  { key: "runs", label: "Runs" },
  { key: "battingAverage", label: "Batting average" },
  { key: "highScore", label: "High score" },
  { key: "fifties", label: "Fifties" },
  { key: "hundreds", label: "Hundreds" },
  { key: "battingStrikeRate", label: "Strike rate" },
  { key: "wickets", label: "Wickets" },
  { key: "maidens", label: "Maidens" },
  { key: "fiveWickets", label: "5-wicket hauls" },
  { key: "bowlingAverage", label: "Bowling average" },
  { key: "economy", label: "Economy" },
  { key: "bowlingStrikeRate", label: "Bowling strike rate" },
];

/** The six radar axes per discipline (handoff §6, minus data we don't capture). */
export const BATTING_RANK_METRICS: DistributionMetric[] = [
  "runs",
  "battingAverage",
  "battingStrikeRate",
  "highScore",
  "fifties",
  "catches",
];
export const BOWLING_RANK_METRICS: DistributionMetric[] = [
  "wickets",
  "bowlingAverage",
  "economy",
  "bowlingStrikeRate",
  "maidens",
  "fiveWickets",
];

/** A qualifier's value for a metric, or null when not qualified / not recorded. */
export function metricValue(p: GradeDistributionPlayer, key: DistributionMetric): number | null {
  const bat = p.batting;
  const bowl = p.bowling;
  switch (key) {
    case "games":
      return p.games;
    case "catches":
      return p.catches;
    case "runs":
      return bat?.runs ?? null;
    case "battingAverage":
      return bat?.average ?? null;
    case "highScore":
      return bat?.highScore ?? null;
    case "fifties":
      return bat?.fifties ?? null;
    case "hundreds":
      return bat?.hundreds ?? null;
    case "battingStrikeRate":
      return bat?.strikeRate ?? null;
    case "wickets":
      return bowl?.wickets ?? null;
    case "maidens":
      return bowl?.maidens ?? null;
    case "fiveWickets":
      return bowl?.fiveWickets ?? null;
    case "bowlingAverage":
      return bowl?.average ?? null;
    case "economy":
      return bowl?.economy ?? null;
    case "bowlingStrikeRate":
      return bowl?.strikeRate ?? null;
  }
}

/**
 * Mid-rank percentile (0–100) of `value` within `population`. Null when the
 * population is empty. Lower-is-better metrics count values ABOVE as beaten.
 */
export function percentileRank(
  population: ReadonlyArray<number>,
  value: number,
  metric: MetricKey,
): number | null {
  const pop = population.filter((v) => Number.isFinite(v));
  if (pop.length === 0) return null;
  const lower = isLowerBetter(metric);
  let beaten = 0;
  let tied = 0;
  for (const v of pop) {
    if (v === value) tied += 1;
    else if (lower ? v > value : v < value) beaten += 1;
  }
  return ((beaten + tied / 2) / pop.length) * 100;
}

/**
 * Value as a % of the club best (0–100), honouring direction: for lower-is-
 * better it's best ÷ value. Null when either side is missing or zero-divides.
 */
export function pctOfBest(
  value: number | null,
  best: number | null,
  metric: MetricKey,
): number | null {
  if (value == null || best == null) return null;
  if (isLowerBetter(metric)) {
    if (value <= 0) return best <= 0 ? 100 : null;
    return Math.min(100, Math.max(0, (best / value) * 100));
  }
  if (best <= 0) return value >= best ? 100 : 0;
  return Math.min(100, Math.max(0, (value / best) * 100));
}

export interface RankRow {
  key: DistributionMetric;
  label: string;
  value: number | null;
  /** 0–100; null when the player doesn't qualify for this metric. */
  percentile: number | null;
  best: number | null;
  pctOfBest: number | null;
  lowerIsBetter: boolean;
  /** Qualifiers ranked on this metric. */
  qualifiers: number;
}

export function playerRanks(
  distribution: GradeDistribution,
  playerId: number,
  metrics: ReadonlyArray<DistributionMetric>,
): Analytic<RankRow[]> {
  const me = distribution.players.find((p) => p.playerId === playerId);
  if (!me) return insufficient("Below the qualifier for this grade");
  const rows = metrics.map((key) => {
    const population = distribution.players
      .map((p) => metricValue(p, key))
      .filter((v): v is number => v != null);
    const value = metricValue(me, key);
    const best = distribution.best[key] ?? null;
    return {
      key,
      label: DISTRIBUTION_METRICS.find((m) => m.key === key)?.label ?? key,
      value,
      percentile: value == null ? null : percentileRank(population, value, key),
      best,
      pctOfBest: pctOfBest(value, best, key),
      lowerIsBetter: isLowerBetter(key),
      qualifiers: population.length,
    };
  });
  if (rows.every((r) => r.percentile == null)) {
    return insufficient("Below the qualifier for this grade");
  }
  return ready(rows);
}
