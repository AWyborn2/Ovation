import type { PlayerMatchLine } from "@workspace/api-client-react";
import type { Discipline } from "../use-stats-view";
import { inningsOf, isOut } from "./range";
import { type Analytic, insufficient, MIN_POINTS, ready } from "./shared";

/**
 * "How he gets out" donut (R2), from the per-innings `dismissalType` of every
 * dismissal in range. Retired-out and unrecognised text fall into "other".
 */

export type DismissalCategory = "caught" | "bowled" | "lbw" | "runOut" | "stumped" | "other";

export const DISMISSAL_CATEGORIES: ReadonlyArray<{ key: DismissalCategory; label: string }> = [
  { key: "caught", label: "Caught" },
  { key: "bowled", label: "Bowled" },
  { key: "lbw", label: "LBW" },
  { key: "runOut", label: "Run out" },
  { key: "stumped", label: "Stumped" },
  { key: "other", label: "Other" },
];

export interface DismissalSlice {
  key: DismissalCategory;
  label: string;
  count: number;
  /** Share of all dismissals, 0–1 (the chart kit rounds to whole percents). */
  share: number;
}

export interface DismissalBreakdown {
  /** Dismissals counted (the donut's total). */
  outs: number;
  /** Innings in range, for the "98 of 110 innings" eyebrow. */
  innings: number;
  /** Every category in display order, zero-count ones included. */
  slices: DismissalSlice[];
  /** The largest slice (for the centre headline). */
  top: DismissalSlice;
}

export const NOT_RECORDED_REASON = "Dismissal detail not recorded";

export function dismissalBreakdown(
  matches: ReadonlyArray<PlayerMatchLine>,
  discipline: Discipline = "bat",
): Analytic<DismissalBreakdown> {
  if (discipline === "bowl") {
    // The player's own rows don't say how his wickets fell (that lives on the
    // opposition's batting lines, which this read doesn't return).
    return insufficient("How wickets were taken isn't recorded");
  }
  const innings = inningsOf(matches);
  const outs = innings.filter(isOut);
  if (outs.length === 0) return insufficient("No dismissals in this range");

  const counts = new Map<DismissalCategory, number>();
  for (const inn of outs) {
    const t = inn.dismissalType;
    const cat: DismissalCategory =
      t === "caught" || t === "bowled" || t === "lbw" || t === "runOut" || t === "stumped"
        ? t
        : "other";
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  // Nothing typed at all means the scorecards carried no "how out" text.
  if ((counts.get("other") ?? 0) === outs.length) return insufficient(NOT_RECORDED_REASON);
  if (outs.length < MIN_POINTS) return insufficient("Fewer than 3 dismissals in this range");

  const slices = DISMISSAL_CATEGORIES.map(({ key, label }) => {
    const count = counts.get(key) ?? 0;
    return { key, label, count, share: count / outs.length };
  });
  const top = slices.reduce((a, b) => (b.count > a.count ? b : a));
  return ready({ outs: outs.length, innings: innings.length, slices, top });
}
