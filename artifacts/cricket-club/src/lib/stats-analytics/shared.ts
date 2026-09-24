/**
 * Shared vocabulary for the stats analytics module (plan 2026-09-24-002, U4):
 * the chart-ready-or-insufficient result type, metric direction (lower is
 * better for bowling average, economy and bowling strike rate — flagged ONCE
 * here and honoured by splits, opposition, percentiles and Compare), and the
 * cricket rate helpers every derivation shares.
 *
 * Pure: no React, no fetch. Inputs are the generated API types.
 */

/** A derivation either yields chart-ready data or says why it can't (R6). */
export type Analytic<T> = { ok: true; data: T } | { ok: false; reason: string };

/** A chart with fewer than this many data points shows its empty state (R6). */
export const MIN_POINTS = 3;

/** The handoff's empty-state wording for a non-bowler in bowling mode. */
export const NO_BOWLING_REASON = "No bowling recorded in this range";

export function ready<T>(data: T): Analytic<T> {
  return { ok: true, data };
}

export function insufficient<T = never>(reason: string): Analytic<T> {
  return { ok: false, reason };
}

/**
 * Every ranked metric the analytics pages show. The distribution-derived keys
 * match `GradeDistributionBest` (U5) so percentiles and "% of club best" can
 * index straight into it.
 */
export type MetricKey =
  | "games"
  | "catches"
  | "innings"
  | "outs"
  | "runs"
  | "battingAverage"
  | "highScore"
  | "fifties"
  | "hundreds"
  | "battingStrikeRate"
  | "wickets"
  | "maidens"
  | "fiveWickets"
  | "bowlingAverage"
  | "economy"
  | "bowlingStrikeRate";

/** The one place lower-is-better is declared. */
export const LOWER_IS_BETTER: ReadonlySet<MetricKey> = new Set<MetricKey>([
  "bowlingAverage",
  "economy",
  "bowlingStrikeRate",
]);

export function isLowerBetter(metric: MetricKey): boolean {
  return LOWER_IS_BETTER.has(metric);
}

/** True when `a` is strictly better than `b` for this metric. */
export function isBetter(metric: MetricKey, a: number, b: number): boolean {
  return isLowerBetter(metric) ? a < b : a > b;
}

/**
 * Indices of the best value(s) among `values` (nulls never win). Ties return
 * every tied index; an all-null list returns [].
 */
export function bestIndices(metric: MetricKey, values: ReadonlyArray<number | null>): number[] {
  let best: number | null = null;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    if (best == null || isBetter(metric, v, best)) best = v;
  }
  if (best == null) return [];
  const out: number[] = [];
  values.forEach((v, i) => {
    if (v === best) out.push(i);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Rates. Each returns null where the denominator is zero/unknown — a missing
// figure, never a made-up 0 or Infinity.
// ---------------------------------------------------------------------------

export function battingAverage(runs: number, outs: number): number | null {
  return outs > 0 ? runs / outs : null;
}

export function battingStrikeRate(runs: number, balls: number | null): number | null {
  return balls != null && balls > 0 ? (runs / balls) * 100 : null;
}

export function bowlingAverage(runsConceded: number, wickets: number): number | null {
  return wickets > 0 ? runsConceded / wickets : null;
}

export function economyRate(runsConceded: number, balls: number | null): number | null {
  return balls != null && balls > 0 ? (runsConceded / balls) * 6 : null;
}

export function bowlingStrikeRate(balls: number | null, wickets: number): number | null {
  return balls != null && wickets > 0 ? balls / wickets : null;
}

/** Sum a list where null means "not recorded": all-null → null, else the known sum. */
export function sumKnown(values: ReadonlyArray<number | null | undefined>): number | null {
  let total: number | null = null;
  for (const v of values) if (v != null) total = (total ?? 0) + v;
  return total;
}
