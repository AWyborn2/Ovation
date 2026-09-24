import type { PlayerMatchLine } from "@workspace/api-client-react";
import type { Discipline } from "../use-stats-view";
import { type InningsEntry, inningsOf, isOut, matchBallsBowled } from "./range";
import {
  type Analytic,
  battingAverage,
  bestIndices,
  bowlingAverage,
  economyRate,
  insufficient,
  NO_BOWLING_REASON,
  ready,
  knownBalls,
  strikeRateOverKnownBalls,
  sumKnown,
} from "./shared";

/**
 * Splits (R2): "Where he scores" / "Where he strikes".
 *
 * Batting groups: Home vs Away, Batting position, Match situation (batting
 * first vs chasing). Bowling groups: Home vs Away, Match situation (bowling
 * first vs defending) — there's no over-by-over data, so no "bowling role"
 * (Scope Boundaries). A group only appears where its key is known for at least
 * one innings (home/away is null on the native path), and entries whose key is
 * unknown are counted in `unassigned` rather than guessed — so a group's rows
 * plus `unassigned` sum to the range total (R5).
 *
 * The best row per group is flagged by average: highest for batting, lowest
 * for bowling (shared.LOWER_IS_BETTER).
 */

export interface BattingSplitRow {
  key: string;
  label: string;
  innings: number;
  outs: number;
  runs: number;
  ballsFaced: number | null;
  average: number | null;
  strikeRate: number | null;
  best: boolean;
}

export interface BowlingSplitRow {
  key: string;
  label: string;
  matches: number;
  wickets: number;
  runsConceded: number;
  ballsBowled: number | null;
  average: number | null;
  economy: number | null;
  best: boolean;
}

export interface SplitGroup<Row> {
  key: "homeAway" | "position" | "situation";
  title: string;
  rows: Row[];
  /** Innings (batting) or matches (bowling) whose key isn't recorded. */
  unassigned: number;
}

export type BattingSplits = SplitGroup<BattingSplitRow>[];
export type BowlingSplits = SplitGroup<BowlingSplitRow>[];

type Bucket<E> = { key: string; label: string; of: (e: E) => boolean | null };

/** Position bands in display order. */
export const POSITION_BANDS: ReadonlyArray<{
  key: string;
  label: string;
  min: number;
  max: number;
}> = [
  { key: "open", label: "Opening", min: 1, max: 2 },
  { key: "3", label: "No. 3", min: 3, max: 3 },
  { key: "4", label: "No. 4", min: 4, max: 4 },
  { key: "5-6", label: "No. 5–6", min: 5, max: 6 },
  { key: "7+", label: "No. 7+", min: 7, max: Infinity },
];

function band(pos: number | null): string | null {
  if (pos == null || pos < 1) return null;
  return POSITION_BANDS.find((b) => pos >= b.min && pos <= b.max)?.key ?? null;
}

function batGroup(
  key: SplitGroup<BattingSplitRow>["key"],
  title: string,
  innings: InningsEntry[],
  buckets: Bucket<InningsEntry>[],
): SplitGroup<BattingSplitRow> | null {
  let unassigned = 0;
  const rows = buckets.map((b) => ({ ...b, list: [] as InningsEntry[] }));
  for (const inn of innings) {
    const hit = rows.find((r) => r.of(inn) === true);
    if (hit) hit.list.push(inn);
    else unassigned += 1;
  }
  const kept = rows.filter((r) => r.list.length > 0);
  if (kept.length === 0) return null;
  const out: BattingSplitRow[] = kept.map((r) => {
    const runs = r.list.reduce((s, i) => s + (i.runs ?? 0), 0);
    const outs = r.list.filter(isOut).length;
    const ballsFaced = sumKnown(r.list.map((i) => knownBalls(i.balls)));
    return {
      key: r.key,
      label: r.label,
      innings: r.list.length,
      outs,
      runs,
      ballsFaced,
      average: battingAverage(runs, outs),
      strikeRate: strikeRateOverKnownBalls(r.list),
      best: false,
    };
  });
  const best = bestIndices(
    "battingAverage",
    out.map((r) => r.average),
  );
  for (const i of best) out[i].best = true;
  return { key, title, rows: out, unassigned };
}

export function battingSplits(matches: ReadonlyArray<PlayerMatchLine>): Analytic<BattingSplits> {
  const innings = inningsOf(matches);
  if (innings.length === 0) return insufficient("No batting recorded in this range");
  const groups = [
    batGroup("homeAway", "Home vs away", innings, [
      { key: "home", label: "Home", of: (i) => (i.isHome == null ? null : i.isHome) },
      { key: "away", label: "Away", of: (i) => (i.isHome == null ? null : !i.isHome) },
    ]),
    batGroup(
      "position",
      "Batting position",
      innings,
      POSITION_BANDS.map((b) => ({
        key: b.key,
        label: b.label,
        of: (i: InningsEntry) => {
          const k = band(i.battingPos);
          return k == null ? null : k === b.key;
        },
      })),
    ),
    batGroup("situation", "Match situation", innings, [
      {
        key: "first",
        label: "Batting first",
        of: (i) => (i.battedFirst == null ? null : i.battedFirst),
      },
      {
        key: "chasing",
        label: "Chasing",
        of: (i) => (i.battedFirst == null ? null : !i.battedFirst),
      },
    ]),
  ].filter((g): g is SplitGroup<BattingSplitRow> => g != null);
  if (groups.length === 0) return insufficient("Split detail not recorded");
  return ready(groups);
}

function bowlGroup(
  key: SplitGroup<BowlingSplitRow>["key"],
  title: string,
  matches: PlayerMatchLine[],
  buckets: Bucket<PlayerMatchLine>[],
): SplitGroup<BowlingSplitRow> | null {
  let unassigned = 0;
  const rows = buckets.map((b) => ({ ...b, list: [] as PlayerMatchLine[] }));
  for (const m of matches) {
    const hit = rows.find((r) => r.of(m) === true);
    if (hit) hit.list.push(m);
    else unassigned += 1;
  }
  const kept = rows.filter((r) => r.list.length > 0);
  if (kept.length === 0) return null;
  const out: BowlingSplitRow[] = kept.map((r) => {
    const wickets = r.list.reduce((s, m) => s + (m.wickets ?? 0), 0);
    const runsConceded = r.list.reduce((s, m) => s + (m.runsConceded ?? 0), 0);
    const ballsBowled = sumKnown(r.list.map(matchBallsBowled));
    return {
      key: r.key,
      label: r.label,
      matches: r.list.length,
      wickets,
      runsConceded,
      ballsBowled,
      average: bowlingAverage(runsConceded, wickets),
      economy: economyRate(runsConceded, ballsBowled),
      best: false,
    };
  });
  const best = bestIndices(
    "bowlingAverage",
    out.map((r) => r.average),
  );
  for (const i of best) out[i].best = true;
  return { key, title, rows: out, unassigned };
}

export function bowlingSplits(matches: ReadonlyArray<PlayerMatchLine>): Analytic<BowlingSplits> {
  const bowled = matches.filter((m) => m.bowled);
  if (bowled.length === 0) return insufficient(NO_BOWLING_REASON);
  const groups = [
    bowlGroup("homeAway", "Home vs away", bowled, [
      { key: "home", label: "Home", of: (m) => (m.isHome == null ? null : m.isHome) },
      { key: "away", label: "Away", of: (m) => (m.isHome == null ? null : !m.isHome) },
    ]),
    bowlGroup("situation", "Match situation", bowled, [
      // The club batting second means this player's side bowled first.
      {
        key: "first",
        label: "Bowling first",
        of: (m) => (m.battedFirst == null ? null : !m.battedFirst),
      },
      {
        key: "defending",
        label: "Defending",
        of: (m) => (m.battedFirst == null ? null : m.battedFirst),
      },
    ]),
  ].filter((g): g is SplitGroup<BowlingSplitRow> => g != null);
  if (groups.length === 0) return insufficient("Split detail not recorded");
  return ready(groups);
}

export function splits(
  matches: ReadonlyArray<PlayerMatchLine>,
  discipline: Discipline,
): Analytic<BattingSplits> | Analytic<BowlingSplits> {
  return discipline === "bowl" ? bowlingSplits(matches) : battingSplits(matches);
}
