import type { PlayerMatchLine } from "@workspace/api-client-react";
import { inningsOf } from "./range";
import { type Analytic, insufficient, MIN_POINTS, NO_BOWLING_REASON, ready } from "./shared";

/**
 * Score / wicket distribution (R2): a five-bucket histogram over the range's
 * innings, plus the conversion callout (50→100 for batting, 3+ wicket
 * innings for bowling). Buckets sum to the innings count.
 */

export interface DistributionBucket {
  key: string;
  label: string;
  count: number;
  /** Share of innings, 0–1. */
  share: number;
}

export interface ScoreDistribution {
  innings: number;
  buckets: DistributionBucket[];
  fifties: number;
  hundreds: number;
  /** Hundreds ÷ scores of 50+ (0–1); null with no 50+ score. */
  conversion: number | null;
}

export const SCORE_BUCKETS: ReadonlyArray<{
  key: string;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "0-9", label: "0–9", min: 0, max: 9 },
  { key: "10-29", label: "10–29", min: 10, max: 29 },
  { key: "30-49", label: "30–49", min: 30, max: 49 },
  { key: "50-99", label: "50–99", min: 50, max: 99 },
  { key: "100+", label: "100+", min: 100, max: Infinity },
];

export function scoreDistribution(
  matches: ReadonlyArray<PlayerMatchLine>,
): Analytic<ScoreDistribution> {
  const innings = inningsOf(matches);
  if (innings.length < MIN_POINTS) return insufficient("Fewer than 3 innings in this range");
  const runs = innings.map((i) => i.runs ?? 0);
  const buckets = SCORE_BUCKETS.map((b) => {
    const count = runs.filter((r) => r >= b.min && r <= b.max).length;
    return { key: b.key, label: b.label, count, share: count / innings.length };
  });
  const hundreds = runs.filter((r) => r >= 100).length;
  const fifties = runs.filter((r) => r >= 50 && r < 100).length;
  return ready({
    innings: innings.length,
    buckets,
    fifties,
    hundreds,
    conversion: fifties + hundreds > 0 ? hundreds / (fifties + hundreds) : null,
  });
}

export interface WicketDistribution {
  innings: number;
  buckets: DistributionBucket[];
  /** Bowling innings returning 3+ wickets. */
  threePlus: number;
  /** threePlus ÷ bowling innings (0–1). */
  threePlusRate: number;
}

export const WICKET_BUCKETS: ReadonlyArray<{
  key: string;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "0", label: "0 wkts", min: 0, max: 0 },
  { key: "1", label: "1 wkt", min: 1, max: 1 },
  { key: "2", label: "2 wkts", min: 2, max: 2 },
  { key: "3", label: "3 wkts", min: 3, max: 3 },
  { key: "4+", label: "4+ wkts", min: 4, max: Infinity },
];

export function wicketDistribution(
  matches: ReadonlyArray<PlayerMatchLine>,
): Analytic<WicketDistribution> {
  const bowled = matches.filter((m) => m.bowled);
  if (bowled.length === 0) return insufficient(NO_BOWLING_REASON);
  if (bowled.length < MIN_POINTS) return insufficient("Fewer than 3 bowling innings in this range");
  const wk = bowled.map((m) => m.wickets ?? 0);
  const buckets = WICKET_BUCKETS.map((b) => {
    const count = wk.filter((w) => w >= b.min && w <= b.max).length;
    return { key: b.key, label: b.label, count, share: count / bowled.length };
  });
  const threePlus = wk.filter((w) => w >= 3).length;
  return ready({
    innings: bowled.length,
    buckets,
    threePlus,
    threePlusRate: threePlus / bowled.length,
  });
}
