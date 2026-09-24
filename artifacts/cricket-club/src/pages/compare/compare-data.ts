import type {
  Fixture,
  FixturesResultsPage,
  GetPlayersVsClubParams,
  GradeDistributionBest,
  PlayerMatchLine,
  PlayerSeasonStat,
  PlayersVsClub,
  PlayhqFixture,
  PlayhqLadder,
  VsClubBatter,
  VsClubBowler,
} from "@workspace/api-client-react";
import { hbarWidths } from "@/components/stats-charts/hbar-list";
import {
  bestIndices,
  battingAverage,
  battingStrikeRate,
  bowlingAverage,
  bowlingStrikeRate,
  economyRate,
  filterSeasonRows,
  isLowerBetter,
  pctOfBest,
  scorecardCoverage,
  sumKnown,
  UNKNOWN_OPPONENT_KEY,
  type DistributionMetric,
  type MetricKey,
  type OppositionRow,
  type Race,
  type StatsRange,
} from "@/lib/stats-analytics";
import { seasonLabel, type Discipline } from "@/lib/use-stats-view";

/**
 * Compare page (plan 2026-09-24-002, U7) derivations. Pure: no React, no
 * fetch. Season-level views (tape, verdict, radar, season bars) read
 * `PlayerSeasonStat` rows; per-match views (opposition, race) read the U4
 * analytics module over `PlayerMatchLine` rows (KTD1, KTD3).
 *
 * `seasonTotals` is deliberately generic (any list of season rows → totals and
 * rates) so the Profile hero (U6) can reuse it rather than re-deriving.
 */

// ---------------------------------------------------------------------------
// Player slots in the URL (a, b, c)
// ---------------------------------------------------------------------------

export type Slot = "a" | "b" | "c";
export const SLOTS: readonly Slot[] = ["a", "b", "c"];
export type Slots = Record<Slot, number | null>;

function parseId(raw: string | null): number | null {
  if (raw == null || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n > 0 ? n : null;
}

export function parseSlots(search: string): Slots {
  const p = new URLSearchParams(search);
  return { a: parseId(p.get("a")), b: parseId(p.get("b")), c: parseId(p.get("c")) };
}

/**
 * Merge slot changes into a query string (no `?`). Every other param — the
 * season bar's `from`/`to`/`d` included — is kept as is.
 */
export function applySlots(search: string, patch: Partial<Slots>): string {
  const p = new URLSearchParams(search);
  for (const slot of SLOTS) {
    if (!(slot in patch)) continue;
    const id = patch[slot];
    if (id == null) p.delete(slot);
    else p.set(slot, String(id));
  }
  return p.toString();
}

/** "Swap first two": exchange A and B. */
export function swapFirstTwo(slots: Slots): Partial<Slots> {
  return { a: slots.b, b: slots.a };
}

/**
 * Where the selection helper's "Compare" puts a player: the first empty slot
 * (normally the third), or B when all three are taken. Null when the player is
 * already being compared.
 */
export function helperSlotFor(slots: Slots, playerId: number): Slot | null {
  if (SLOTS.some((s) => slots[s] === playerId)) return null;
  return SLOTS.find((s) => slots[s] == null) ?? "b";
}

// ---------------------------------------------------------------------------
// Season totals (tape, verdict, radar)
// ---------------------------------------------------------------------------

export interface HighScore {
  runs: number;
  notOut: boolean;
}

export interface BowlingFigures {
  wickets: number;
  runs: number;
}

/** "123*" → { runs: 123, notOut: true }; unparseable → null. */
export function parseHighScore(value: string | null | undefined): HighScore | null {
  const m = /^\s*(\d+)\s*(\*)?/.exec(value ?? "");
  return m ? { runs: Number(m[1]), notOut: m[2] === "*" } : null;
}

/** "5/23" (or "5-23") → { wickets: 5, runs: 23 }; unparseable → null. */
export function parseBestBowling(value: string | null | undefined): BowlingFigures | null {
  const m = /^\s*(\d+)\s*[/-]\s*(\d+)/.exec(value ?? "");
  return m ? { wickets: Number(m[1]), runs: Number(m[2]) } : null;
}

export function betterHighScore(a: HighScore | null, b: HighScore | null): HighScore | null {
  if (!a) return b;
  if (!b) return a;
  if (a.runs !== b.runs) return a.runs > b.runs ? a : b;
  return a.notOut ? a : b;
}

export function betterFigures(
  a: BowlingFigures | null,
  b: BowlingFigures | null,
): BowlingFigures | null {
  if (!a) return b;
  if (!b) return a;
  if (a.wickets !== b.wickets) return a.wickets > b.wickets ? a : b;
  return a.runs <= b.runs ? a : b;
}

export interface SeasonTotals {
  games: number;
  innings: number;
  notOuts: number;
  outs: number;
  runs: number;
  highScore: HighScore | null;
  fifties: number;
  hundreds: number;
  /** Balls faced over rows that record them (null when none do). */
  ballsFaced: number | null;
  wickets: number;
  runsConceded: number;
  ballsBowled: number | null;
  maidens: number | null;
  bestBowling: BowlingFigures | null;
  fiveWickets: number;
  catches: number;
  battingAverage: number | null;
  /** Runs per 100 balls over the rows that record balls faced only. */
  strikeRate: number | null;
  bowlingAverage: number | null;
  /** Runs per over over the rows that record balls bowled only. */
  economy: number | null;
  bowlingStrikeRate: number | null;
}

/**
 * Totals and rates over season rows. Ball-based rates only use rows that
 * record balls (baseline rows don't), so a pre-scorecard career never drags a
 * strike rate or economy towards a made-up figure.
 */
export function seasonTotals(rows: ReadonlyArray<PlayerSeasonStat>): SeasonTotals {
  let games = 0;
  let innings = 0;
  let notOuts = 0;
  let runs = 0;
  let fifties = 0;
  let hundreds = 0;
  let wickets = 0;
  let runsConceded = 0;
  let fiveWickets = 0;
  let catches = 0;
  let runsWithBalls = 0;
  let concededWithBalls = 0;
  let wicketsWithBalls = 0;
  let highScore: HighScore | null = null;
  let bestBowling: BowlingFigures | null = null;
  const balls: (number | null)[] = [];
  const bowled: (number | null)[] = [];
  const maidens: (number | null)[] = [];
  for (const r of rows) {
    games += r.games ?? 0;
    innings += r.innings ?? 0;
    notOuts += r.notOuts ?? 0;
    runs += r.runs ?? 0;
    fifties += r.fifties ?? 0;
    hundreds += r.hundreds ?? 0;
    wickets += r.wickets ?? 0;
    runsConceded += r.runsConceded ?? 0;
    fiveWickets += r.fiveWickets ?? 0;
    catches += r.catches ?? 0;
    highScore = betterHighScore(highScore, parseHighScore(r.highScore));
    bestBowling = betterFigures(bestBowling, parseBestBowling(r.bestBowling));
    // Imported seasons store 0 for "balls not recorded", so only a positive
    // count is a real one; the rest never reach the rates.
    const faced = r.ballsFaced != null && r.ballsFaced > 0 ? r.ballsFaced : null;
    const spells = r.ballsBowled != null && r.ballsBowled > 0 ? r.ballsBowled : null;
    balls.push(faced);
    if (faced != null) runsWithBalls += r.runs ?? 0;
    bowled.push(spells);
    if (spells != null) {
      concededWithBalls += r.runsConceded ?? 0;
      wicketsWithBalls += r.wickets ?? 0;
    }
    maidens.push(r.maidens);
  }
  const outs = Math.max(0, innings - notOuts);
  const ballsFaced = sumKnown(balls);
  const ballsBowled = sumKnown(bowled);
  return {
    games,
    innings,
    notOuts,
    outs,
    runs,
    highScore,
    fifties,
    hundreds,
    ballsFaced,
    wickets,
    runsConceded,
    ballsBowled,
    maidens: sumKnown(maidens),
    bestBowling,
    fiveWickets,
    catches,
    battingAverage: battingAverage(runs, outs),
    strikeRate: battingStrikeRate(runsWithBalls, ballsFaced),
    bowlingAverage: bowlingAverage(runsConceded, wickets),
    economy: economyRate(concededWithBalls, ballsBowled),
    bowlingStrikeRate: bowlingStrikeRate(ballsBowled, wicketsWithBalls),
  };
}

// ---------------------------------------------------------------------------
// Tale of the tape + verdict
// ---------------------------------------------------------------------------

export type TapeKey =
  | "games"
  | "runs"
  | "battingAverage"
  | "battingStrikeRate"
  | "highScore"
  | "hundreds"
  | "fifties"
  | "wickets"
  | "bowlingAverage"
  | "economy"
  | "bowlingStrikeRate"
  | "bestBowling"
  | "fiveWickets"
  | "maidens"
  | "catches";

interface TapeMetric {
  key: TapeKey;
  label: string;
  /** Direction (lower-is-better comes from the analytics module's one list). */
  direction: MetricKey;
  value: (t: SeasonTotals) => number | null;
  display: (t: SeasonTotals) => string;
}

const int = (n: number | null) => (n == null ? "–" : n.toLocaleString("en-AU"));
const dp = (n: number | null, places: number) => (n == null ? "–" : n.toFixed(places));

const TAPE_METRICS: Record<TapeKey, TapeMetric> = {
  games: {
    key: "games",
    label: "Matches",
    direction: "games",
    value: (t) => t.games,
    display: (t) => int(t.games),
  },
  runs: {
    key: "runs",
    label: "Runs",
    direction: "runs",
    value: (t) => t.runs,
    display: (t) => int(t.runs),
  },
  battingAverage: {
    key: "battingAverage",
    label: "Batting avg",
    direction: "battingAverage",
    value: (t) => t.battingAverage,
    display: (t) => dp(t.battingAverage, 1),
  },
  battingStrikeRate: {
    key: "battingStrikeRate",
    label: "Strike rate",
    direction: "battingStrikeRate",
    value: (t) => t.strikeRate,
    display: (t) => dp(t.strikeRate, 1),
  },
  highScore: {
    key: "highScore",
    label: "High score",
    direction: "highScore",
    // A not-out edges a dismissal on the same score.
    value: (t) => (t.highScore ? t.highScore.runs + (t.highScore.notOut ? 0.5 : 0) : null),
    display: (t) => (t.highScore ? `${t.highScore.runs}${t.highScore.notOut ? "*" : ""}` : "–"),
  },
  hundreds: {
    key: "hundreds",
    label: "100s",
    direction: "hundreds",
    value: (t) => t.hundreds,
    display: (t) => int(t.hundreds),
  },
  fifties: {
    key: "fifties",
    label: "50s",
    direction: "fifties",
    value: (t) => t.fifties,
    display: (t) => int(t.fifties),
  },
  wickets: {
    key: "wickets",
    label: "Wickets",
    direction: "wickets",
    value: (t) => t.wickets,
    display: (t) => int(t.wickets),
  },
  bowlingAverage: {
    key: "bowlingAverage",
    label: "Bowling avg",
    direction: "bowlingAverage",
    value: (t) => t.bowlingAverage,
    display: (t) => dp(t.bowlingAverage, 1),
  },
  economy: {
    key: "economy",
    label: "Economy",
    direction: "economy",
    value: (t) => t.economy,
    display: (t) => dp(t.economy, 2),
  },
  bowlingStrikeRate: {
    key: "bowlingStrikeRate",
    label: "Strike rate",
    direction: "bowlingStrikeRate",
    value: (t) => t.bowlingStrikeRate,
    display: (t) => dp(t.bowlingStrikeRate, 1),
  },
  bestBowling: {
    key: "bestBowling",
    label: "Best figures",
    direction: "wickets",
    // Most wickets, then fewest runs (runs never reach 1000 in one innings).
    value: (t) => (t.bestBowling ? t.bestBowling.wickets - t.bestBowling.runs / 1000 : null),
    display: (t) => (t.bestBowling ? `${t.bestBowling.wickets}/${t.bestBowling.runs}` : "–"),
  },
  fiveWickets: {
    key: "fiveWickets",
    label: "5-wkt hauls",
    direction: "fiveWickets",
    value: (t) => t.fiveWickets,
    display: (t) => int(t.fiveWickets),
  },
  maidens: {
    key: "maidens",
    label: "Maidens",
    direction: "maidens",
    value: (t) => t.maidens,
    display: (t) => int(t.maidens),
  },
  catches: {
    key: "catches",
    label: "Catches",
    direction: "catches",
    value: (t) => t.catches,
    display: (t) => int(t.catches),
  },
};

export const BATTING_TAPE: TapeKey[] = [
  "games",
  "runs",
  "battingAverage",
  "battingStrikeRate",
  "highScore",
  "hundreds",
  "fifties",
  "wickets",
  "bowlingAverage",
  "catches",
];

export const BOWLING_TAPE: TapeKey[] = [
  "games",
  "wickets",
  "bowlingAverage",
  "economy",
  "bowlingStrikeRate",
  "bestBowling",
  "fiveWickets",
  "maidens",
  "catches",
];

export interface TapeRow {
  key: TapeKey;
  label: string;
  lowerIsBetter: boolean;
  values: (number | null)[];
  displays: string[];
  /** Bar widths 0–1; lower-is-better rows use min ÷ value (best = longest). */
  widths: number[];
  /** Index of the sole leader; null on a tie or when nobody has a value. */
  leader: number | null;
  /** Every index holding the best value (ties included). */
  best: number[];
}

export function taleOfTheTape(totals: ReadonlyArray<SeasonTotals>, d: Discipline): TapeRow[] {
  return (d === "bowl" ? BOWLING_TAPE : BATTING_TAPE).map((key) => {
    const m = TAPE_METRICS[key];
    const values = totals.map((t) => {
      const v = m.value(t);
      return v != null && Number.isFinite(v) ? v : null;
    });
    const lower = isLowerBetter(m.direction);
    const best = bestIndices(m.direction, values);
    return {
      key,
      label: m.label,
      lowerIsBetter: lower,
      values,
      displays: totals.map((t) => m.display(t)),
      widths: hbarWidths(values, lower),
      leader: best.length === 1 ? best[0] : null,
      best,
    };
  });
}

export interface Verdict {
  /** Categories won outright, per player. */
  wins: number[];
  /** Categories where the best value is shared. */
  ties: number;
  /** Categories with at least one value (all-blank rows don't count). */
  total: number;
  /** The sole player with the most wins; null when level at the top. */
  leader: number | null;
  topWins: number;
}

export function verdict(rows: ReadonlyArray<TapeRow>, players: number): Verdict {
  const wins = Array.from({ length: players }, () => 0);
  let ties = 0;
  let total = 0;
  for (const r of rows) {
    if (r.best.length === 0) continue;
    total += 1;
    if (r.leader != null) wins[r.leader] += 1;
    else ties += 1;
  }
  const topWins = Math.max(0, ...wins);
  const leaders = wins.flatMap((w, i) => (w === topWins ? [i] : []));
  return { wins, ties, total, leader: leaders.length === 1 ? leaders[0] : null, topWins };
}

export function verdictText(v: Verdict, names: ReadonlyArray<string>): string {
  if (v.total === 0) return "Nothing to compare in this range";
  if (v.leader == null) return `Level at the top across ${v.total} categories`;
  return `${names[v.leader]} leads ${v.topWins} of ${v.total} categories`;
}

// ---------------------------------------------------------------------------
// Radar: % of club best
// ---------------------------------------------------------------------------

export const COMPARE_RADAR_BATTING: DistributionMetric[] = [
  "runs",
  "battingAverage",
  "battingStrikeRate",
  "hundreds",
  "wickets",
  "catches",
];

export const COMPARE_RADAR_BOWLING: DistributionMetric[] = [
  "wickets",
  "bowlingAverage",
  "economy",
  "bowlingStrikeRate",
  "fiveWickets",
  "maidens",
];

export const RADAR_LABELS: Record<DistributionMetric, string> = {
  games: "Games",
  catches: "Catches",
  runs: "Runs",
  battingAverage: "Average",
  highScore: "High score",
  fifties: "50s",
  hundreds: "100s",
  battingStrikeRate: "Strike rate",
  wickets: "Wickets",
  maidens: "Maidens",
  fiveWickets: "5-fors",
  bowlingAverage: "Average",
  economy: "Economy",
  bowlingStrikeRate: "Strike rate",
};

/** A player's figure for a distribution metric, from their season totals. */
export function totalsMetric(t: SeasonTotals, key: DistributionMetric): number | null {
  switch (key) {
    case "games":
      return t.games;
    case "catches":
      return t.catches;
    case "runs":
      return t.runs;
    case "battingAverage":
      return t.battingAverage;
    case "highScore":
      return t.highScore?.runs ?? null;
    case "fifties":
      return t.fifties;
    case "hundreds":
      return t.hundreds;
    case "battingStrikeRate":
      return t.strikeRate;
    case "wickets":
      return t.wickets;
    case "maidens":
      return t.maidens;
    case "fiveWickets":
      return t.fiveWickets;
    case "bowlingAverage":
      return t.bowlingAverage;
    case "economy":
      return t.economy;
    case "bowlingStrikeRate":
      return t.bowlingStrikeRate;
  }
}

/**
 * The grade the radar measures against: the senior grade the compared players
 * played most games in over the range (their games summed). Ties go to the
 * grade seen first in the players' rows.
 */
export function mostPlayedGrade(
  seasonLists: ReadonlyArray<ReadonlyArray<PlayerSeasonStat>>,
  range: StatsRange,
): string | null {
  const games = new Map<string, number>();
  for (const rows of seasonLists) {
    for (const r of filterSeasonRows(rows, range)) {
      if (!r.grade || r.grade === "CLUB TOTAL") continue;
      games.set(r.grade, (games.get(r.grade) ?? 0) + (r.games ?? 0));
    }
  }
  let best: string | null = null;
  let most = 0;
  for (const [grade, g] of games) {
    if (g > most) {
      best = grade;
      most = g;
    }
  }
  return best;
}

/** Each metric as % of the club best (0–100, null where either is missing). */
export function radarValues(
  t: SeasonTotals,
  best: GradeDistributionBest,
  metrics: ReadonlyArray<DistributionMetric>,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const key of metrics) {
    const b = best[key];
    // A club best of 0 (nobody has a hundred) gives no scale to measure against.
    out[key] =
      b == null || (b === 0 && !isLowerBetter(key))
        ? null
        : pctOfBest(totalsMetric(t, key), b, key);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Against the opposition
// ---------------------------------------------------------------------------

export type OppMetric = "outs" | "avg" | "runs" | "wk" | "bavg" | "econ";

export const OPP_METRICS: Record<Discipline, ReadonlyArray<{ value: OppMetric; label: string }>> = {
  bat: [
    { value: "outs", label: "Times dismissed" },
    { value: "avg", label: "Average" },
    { value: "runs", label: "Runs" },
  ],
  bowl: [
    { value: "wk", label: "Wickets" },
    { value: "bavg", label: "Average" },
    { value: "econ", label: "Economy" },
  ],
};

export const OPP_TITLES: Record<OppMetric, string> = {
  outs: "Who gets them out",
  avg: "Average by opponent",
  runs: "Runs by opponent",
  wk: "Wickets by opponent",
  bavg: "Bowling average by opponent",
  econ: "Economy by opponent",
};

export function defaultOppMetric(d: Discipline): OppMetric {
  return d === "bowl" ? "wk" : "outs";
}

/** The metric in force: a choice made under the other discipline resets. */
export function effectiveOppMetric(
  choice: { d: Discipline; metric: OppMetric } | null,
  d: Discipline,
): OppMetric {
  return choice && choice.d === d ? choice.metric : defaultOppMetric(d);
}

const OPP_DIRECTION: Record<OppMetric, MetricKey> = {
  outs: "outs",
  avg: "battingAverage",
  runs: "runs",
  wk: "wickets",
  bavg: "bowlingAverage",
  econ: "economy",
};

export function oppMetricIsLower(metric: OppMetric): boolean {
  return isLowerBetter(OPP_DIRECTION[metric]);
}

function oppValue(row: OppositionRow | undefined, metric: OppMetric): number | null {
  if (!row) return null;
  switch (metric) {
    case "outs":
      return row.innings > 0 ? row.outs : null;
    case "avg":
      return row.average;
    case "runs":
      return row.innings > 0 ? row.runs : null;
    case "wk":
      return row.bowlingMatches > 0 ? row.wickets : null;
    case "bavg":
      return row.bowlingAverage;
    case "econ":
      return row.economy;
  }
}

const OPP_SUB: Record<OppMetric, (r: OppositionRow) => string> = {
  outs: (r) => `in ${r.innings}`,
  avg: () => "avg",
  runs: () => "runs",
  wk: () => "wkts",
  bavg: () => "avg",
  econ: () => "rpo",
};

export interface MatrixCell {
  value: number | null;
  display: string;
  sub: string;
  width: number;
  shaded: boolean;
  tip: string;
}

export interface MatrixRow {
  key: string;
  opponent: string;
  cells: MatrixCell[];
}

function cellTip(name: string, opponent: string, row: OppositionRow | undefined, bowl: boolean) {
  if (!row) return `${name} v ${opponent}: no matches`;
  if (bowl) {
    if (row.bowlingMatches === 0) return `${name} v ${opponent}: did not bowl`;
    const avg = row.bowlingAverage != null ? ` at ${row.bowlingAverage.toFixed(1)}` : "";
    const econ = row.economy != null ? `, economy ${row.economy.toFixed(2)}` : "";
    return `${name} v ${opponent}: ${row.wickets} wickets${avg}${econ}`;
  }
  if (row.innings === 0) return `${name} v ${opponent}: did not bat`;
  const avg = row.average != null ? ` at ${row.average.toFixed(1)}` : "";
  return `${name} v ${opponent}: out ${row.outs} times in ${row.innings} innings · ${row.runs.toLocaleString("en-AU")} runs${avg}`;
}

/**
 * Clubs × compared players for one metric. Rows are the clubs the players
 * have met most (combined matches), unresolved opponents left out. Bar widths
 * share one scale across the matrix (lower-is-better inverted). Shading:
 * "times dismissed" marks, per player, the club that has dismissed them most;
 * every other metric marks the best return against each club.
 */
export function oppositionMatrix(
  tables: ReadonlyArray<ReadonlyArray<OppositionRow>>,
  names: ReadonlyArray<string>,
  metric: OppMetric,
  limit = 8,
): MatrixRow[] {
  const clubs = new Map<string, { opponent: string; matches: number }>();
  const byKey = tables.map((t) => new Map(t.map((r) => [r.key, r])));
  for (const t of tables) {
    for (const r of t) {
      if (r.key === UNKNOWN_OPPONENT_KEY) continue;
      const c = clubs.get(r.key);
      if (c) c.matches += r.matches;
      else clubs.set(r.key, { opponent: r.opponent, matches: r.matches });
    }
  }
  const keys = [...clubs.entries()]
    .sort((x, y) => y[1].matches - x[1].matches || x[1].opponent.localeCompare(y[1].opponent))
    .slice(0, limit)
    .map(([k]) => k);

  const lower = oppMetricIsLower(metric);
  const bowl = metric === "wk" || metric === "bavg" || metric === "econ";
  const grid = keys.map((k) => byKey.map((m) => oppValue(m.get(k), metric)));
  const widths = hbarWidths(grid.flat(), lower);

  // Shading.
  const shaded = grid.map((vals) => vals.map(() => false));
  if (metric === "outs") {
    tables.forEach((_, col) => {
      const colVals = grid.map((vals) => vals[col]);
      const top = Math.max(0, ...colVals.map((v) => v ?? 0));
      if (top <= 0) return;
      colVals.forEach((v, row) => {
        if (v === top) shaded[row][col] = true;
      });
    });
  } else {
    grid.forEach((vals, row) => {
      const best = bestIndices(OPP_DIRECTION[metric], vals);
      if (best.length === 1) shaded[row][best[0]] = true;
    });
  }

  return keys.map((k, ri) => {
    const opponent = clubs.get(k)!.opponent;
    return {
      key: k,
      opponent,
      cells: byKey.map((m, ci) => {
        const row = m.get(k);
        const v = grid[ri][ci];
        const display =
          v == null
            ? "–"
            : metric === "econ"
              ? v.toFixed(2)
              : metric === "avg" || metric === "bavg"
                ? v.toFixed(1)
                : v.toLocaleString("en-AU");
        return {
          value: v,
          display,
          sub: v == null || !row ? "" : OPP_SUB[metric](row),
          width: widths[ri * byKey.length + ci],
          shaded: shaded[ri][ci],
          tip: cellTip(names[ci], opponent, row, bowl),
        };
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Career race + season by season
// ---------------------------------------------------------------------------

export type RaceChartRow = { games: number } & Record<string, number | null>;

/** Race series as chart rows keyed by games played (`p0`, `p1`, `p2`). */
export function raceChartRows(race: Race): RaceChartRow[] {
  if (race.series.length === 0) return [];
  const lookups = race.series.map((s) => new Map(s.points.map((p) => [p.games, p.value])));
  const lo = Math.min(...race.series.map((s) => s.start.games));
  const hi = Math.max(...race.series.map((s) => s.final.games));
  const rows: RaceChartRow[] = [];
  for (let g = lo; g <= hi; g++) {
    const row: RaceChartRow = { games: g };
    lookups.forEach((m, i) => {
      row[`p${i}`] = m.get(g) ?? null;
    });
    rows.push(row);
  }
  return rows;
}

export type SeasonBarRow = { season: string; year: number } & Record<
  string,
  number | null | string
>;

/**
 * Runs or wickets per season for each player over the latest `limit` seasons
 * in range any of them played (oldest first). A season a player has no row for
 * is null (no bar), not 0.
 */
export function seasonBars(
  seasonLists: ReadonlyArray<ReadonlyArray<PlayerSeasonStat>>,
  d: Discipline,
  range: StatsRange,
  limit = 6,
): SeasonBarRow[] {
  const perPlayer = seasonLists.map((rows) => {
    const m = new Map<number, number>();
    for (const r of filterSeasonRows(rows, range)) {
      if (r.season == null) continue;
      const v = d === "bowl" ? (r.wickets ?? 0) : (r.runs ?? 0);
      m.set(r.season, (m.get(r.season) ?? 0) + v);
    }
    return m;
  });
  const years = [...new Set(perPlayer.flatMap((m) => [...m.keys()]))]
    .sort((a, b) => a - b)
    .slice(-limit);
  return years.map((year) => {
    const row: SeasonBarRow = { season: seasonLabel(year), year };
    perPlayer.forEach((m, i) => {
      row[`p${i}`] = m.get(year) ?? null;
    });
    return row;
  });
}

/**
 * The per-match coverage note (KTD3) for the compared players: who has
 * pre-scorecard seasons the per-match charts can't see.
 */
export function coverageNotes(
  names: ReadonlyArray<string>,
  seasonLists: ReadonlyArray<ReadonlyArray<PlayerSeasonStat>>,
  matchLists: ReadonlyArray<ReadonlyArray<PlayerMatchLine>>,
): string | null {
  const notes = names.flatMap((name, i) => {
    const c = scorecardCoverage(seasonLists[i] ?? [], matchLists[i] ?? []);
    return c.note ? [`${name}: ${c.note.replace(/^Scorecard era: /, "scorecards ")}`] : [];
  });
  return notes.length ? `Scorecard era · ${notes.join(" · ")}` : null;
}

// ---------------------------------------------------------------------------
// Selection helper
// ---------------------------------------------------------------------------

export interface UpcomingFixture {
  key: string;
  grade: string;
  round: string | null;
  startAt: string | null;
  venue: string | null;
  isHome: boolean | null;
  opponentName: string;
  /** App clubs register id (Fixture.opponentClubId). */
  opponentAppClubId: number | null;
  /** PlayHQ organisation GUID. */
  opponentOrgId: string | null;
  /** PlayHQ grade GUID, for the ladder. */
  gradeId: string | null;
}

function isCompleted(m: PlayhqFixture): boolean {
  return (
    m.outcome != null || m.resultText != null || m.clubScore != null || m.opponentScore != null
  );
}

function isUpcomingPlayhq(m: PlayhqFixture, now: Date): boolean {
  if (isCompleted(m)) return false;
  if (m.status.toUpperCase() === "UPCOMING") return true;
  return m.startAt != null && new Date(m.startAt).getTime() >= now.getTime();
}

const time = (s: string | null | undefined) => (s ? new Date(s).getTime() : Infinity);

/**
 * The next `limit` fixtures: the club's fixtures list first (manual and
 * PlayHQ-projected rows), topped up from the PlayHQ season page. A fixture
 * picks up its PlayHQ opponent org and grade id by match id where it has one.
 */
export function upcomingFixtures(
  fixtures: ReadonlyArray<Fixture> | undefined,
  page: FixturesResultsPage | undefined,
  now: Date,
  limit = 3,
): UpcomingFixture[] {
  const playhq = new Map((page?.matches ?? []).map((m) => [m.playhqMatchId, m]));
  const out: UpcomingFixture[] = [];
  const seen = new Set<string>();
  for (const f of fixtures ?? []) {
    if (time(f.startAt) < now.getTime()) continue;
    const ph = f.playhqMatchId ? playhq.get(f.playhqMatchId) : undefined;
    if (f.playhqMatchId) seen.add(f.playhqMatchId);
    out.push({
      key: `f${f.id}`,
      grade: f.grade,
      round: f.roundLabel ?? ph?.round ?? null,
      startAt: f.startAt,
      venue: f.venue ?? ph?.venue ?? null,
      isHome: f.isHome,
      opponentName: f.opponentName,
      opponentAppClubId: f.opponentClubId ?? null,
      opponentOrgId: ph?.opponent?.orgId ?? null,
      gradeId: ph?.gradeId ?? null,
    });
  }
  for (const m of page?.matches ?? []) {
    if (seen.has(m.playhqMatchId) || !isUpcomingPlayhq(m, now)) continue;
    out.push({
      key: `p${m.playhqMatchId}`,
      grade: m.grade,
      round: m.round ?? null,
      startAt: m.startAt ?? null,
      venue: m.venue ?? null,
      isHome: m.isHome,
      opponentName: m.opponent?.name ?? "Opponent TBC",
      opponentAppClubId: null,
      opponentOrgId: m.opponent?.orgId ?? null,
      gradeId: m.gradeId,
    });
  }
  return out.sort((x, y) => time(x.startAt) - time(y.startAt)).slice(0, limit);
}

/** The vs-club query for a fixture, or null when the opponent has no club link. */
export function vsClubParams(f: UpcomingFixture): GetPlayersVsClubParams | null {
  if (f.opponentAppClubId != null) return { opponentAppClubId: f.opponentAppClubId, minInnings: 3 };
  if (f.opponentOrgId) return { opponentOrgId: f.opponentOrgId, minInnings: 3 };
  return null;
}

const norm = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .replace(/cricket club|\bcc\b|\binc\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function sameOpponent(
  f: Pick<UpcomingFixture, "opponentOrgId" | "opponentName">,
  orgId: string | null | undefined,
  name: string | null | undefined,
): boolean {
  if (f.opponentOrgId && orgId) return f.opponentOrgId === orgId;
  const a = norm(f.opponentName);
  const b = norm(name);
  return a !== "" && b !== "" && (a === b || a.startsWith(b) || b.startsWith(a));
}

export interface LadderPosition {
  rank: number;
  of: number;
}

export function ladderPosition(
  ladder: PlayhqLadder | undefined,
  f: UpcomingFixture,
): LadderPosition | null {
  for (const table of ladder?.ladders ?? []) {
    const team = table.teams.find((t) => sameOpponent(f, t.orgId, t.teamName));
    if (team?.rank != null) return { rank: team.rank, of: table.teams.length };
  }
  return null;
}

/** The most recent completed meeting with the opponent (same grade preferred). */
export function lastResultVs(
  page: FixturesResultsPage | undefined,
  f: UpcomingFixture,
): PlayhqFixture | null {
  const meetings = (page?.matches ?? [])
    .filter((m) => isCompleted(m) && sameOpponent(f, m.opponent?.orgId, m.opponent?.name))
    .sort((x, y) => time(y.startAt) - time(x.startAt));
  return meetings.find((m) => m.grade === f.grade) ?? meetings[0] ?? null;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Top batters against the club: best average (never-out last), then runs. */
export function helperBatters(data: PlayersVsClub | undefined, limit = 6): VsClubBatter[] {
  return [...(data?.batting ?? [])]
    .sort(
      (x, y) =>
        (y.average ?? -1) - (x.average ?? -1) ||
        y.runs - x.runs ||
        x.surname.localeCompare(y.surname),
    )
    .slice(0, limit);
}

/** Top bowlers against the club: most wickets, then lowest average. */
export function helperBowlers(data: PlayersVsClub | undefined, limit = 6): VsClubBowler[] {
  return [...(data?.bowling ?? [])]
    .filter((b) => b.wickets > 0)
    .sort(
      (x, y) =>
        y.wickets - x.wickets ||
        (x.average ?? Infinity) - (y.average ?? Infinity) ||
        x.surname.localeCompare(y.surname),
    )
    .slice(0, limit);
}
