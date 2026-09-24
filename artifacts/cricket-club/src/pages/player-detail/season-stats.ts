import type { PlayerMatchLine, PlayerSeasonStat } from "@workspace/api-client-react";
import { sortGradesBySeniority } from "@/components/grade-badge";
import {
  battingAverage,
  bowlingAverage,
  economyRate,
  filterSeasonRows,
  sumKnown,
  type StatsRange,
} from "@/lib/stats-analytics";

/**
 * Season-level figures for the Player profile (hero strip, career arc, ranks
 * grade). These read `GET /players/{id}/seasons` rows (KTD3), never the
 * per-match series, so the hero agrees with the season table and the career
 * totals. Pure: no React, no fetch.
 */

/** Season rows that belong to a real grade (the synthetic club total is dropped). */
export function gradeRows(rows: ReadonlyArray<PlayerSeasonStat>): PlayerSeasonStat[] {
  return rows.filter((r) => r.grade !== "CLUB TOTAL");
}

export interface HighScore {
  runs: number;
  notOut: boolean;
}

/** "112*" → { runs: 112, notOut: true }; unparseable → null. */
export function parseHighScore(value: string | null | undefined): HighScore | null {
  const m = /^\s*(\d+)\s*(\*)?/.exec(value ?? "");
  return m ? { runs: Number(m[1]), notOut: !!m[2] } : null;
}

export interface BowlingFigures {
  wickets: number;
  runs: number;
}

/** "5/22" → { wickets: 5, runs: 22 }; unparseable → null. */
export function parseBestBowling(value: string | null | undefined): BowlingFigures | null {
  const m = /^\s*(\d+)\s*[/-]\s*(\d+)/.exec(value ?? "");
  return m ? { wickets: Number(m[1]), runs: Number(m[2]) } : null;
}

const betterHighScore = (a: HighScore, b: HighScore | null) =>
  !b || a.runs > b.runs || (a.runs === b.runs && a.notOut && !b.notOut);
const betterFigures = (a: BowlingFigures, b: BowlingFigures | null) =>
  !b || a.wickets > b.wickets || (a.wickets === b.wickets && a.runs < b.runs);

export const formatHighScore = (h: HighScore | null) =>
  h ? `${h.runs}${h.notOut ? "*" : ""}` : null;
export const formatFigures = (f: BowlingFigures | null) => (f ? `${f.wickets}/${f.runs}` : null);

/** Totals over a set of season rows (the hero strip). */
export interface SeasonTotals {
  games: number;
  innings: number;
  notOuts: number;
  runs: number;
  fifties: number;
  hundreds: number;
  highScore: HighScore | null;
  wickets: number;
  runsConceded: number;
  bestBowling: BowlingFigures | null;
  fiveWickets: number;
  catches: number;
  battingAverage: number | null;
  bowlingAverage: number | null;
  /**
   * Economy over the rows whose balls bowled are recorded (runs from those
   * rows only, so baseline runs never inflate it). Null when none are.
   */
  economy: number | null;
  /** Null when no row records maidens (unknown, not zero). */
  maidens: number | null;
}

export function seasonTotals(rows: ReadonlyArray<PlayerSeasonStat>): SeasonTotals {
  const t: SeasonTotals = {
    games: 0,
    innings: 0,
    notOuts: 0,
    runs: 0,
    fifties: 0,
    hundreds: 0,
    highScore: null,
    wickets: 0,
    runsConceded: 0,
    bestBowling: null,
    fiveWickets: 0,
    catches: 0,
    battingAverage: null,
    bowlingAverage: null,
    economy: null,
    maidens: null,
  };
  let econRuns = 0;
  let econBalls = 0;
  for (const r of gradeRows(rows)) {
    t.games += r.games ?? 0;
    t.innings += r.innings ?? 0;
    t.notOuts += r.notOuts ?? 0;
    t.runs += r.runs ?? 0;
    t.fifties += r.fifties ?? 0;
    t.hundreds += r.hundreds ?? 0;
    t.wickets += r.wickets ?? 0;
    t.runsConceded += r.runsConceded ?? 0;
    t.fiveWickets += r.fiveWickets ?? 0;
    t.catches += r.catches ?? 0;
    const hs = parseHighScore(r.highScore);
    if (hs && betterHighScore(hs, t.highScore)) t.highScore = hs;
    const bb = parseBestBowling(r.bestBowling);
    if (bb && betterFigures(bb, t.bestBowling)) t.bestBowling = bb;
    if (r.ballsBowled != null && r.ballsBowled > 0) {
      econBalls += r.ballsBowled;
      econRuns += r.runsConceded ?? 0;
    }
  }
  t.maidens = sumKnown(gradeRows(rows).map((r) => r.maidens));
  t.battingAverage = battingAverage(t.runs, t.innings - t.notOuts);
  t.bowlingAverage = bowlingAverage(t.runsConceded, t.wickets);
  t.economy = econBalls > 0 ? economyRate(econRuns, econBalls) : null;
  return t;
}

/** One season of the career arc (all grades summed). */
export type ArcSeason = {
  season: number;
  label: string;
  runs: number;
  wickets: number;
  battingAverage: number | null;
  bowlingAverage: number | null;
};

/** Dated seasons, oldest first, grades summed (the baseline row has no season). */
export function arcSeasons(
  rows: ReadonlyArray<PlayerSeasonStat>,
  label: (season: number) => string,
): ArcSeason[] {
  const by = new Map<number, PlayerSeasonStat[]>();
  for (const r of gradeRows(rows)) {
    if (r.season == null) continue;
    const list = by.get(r.season) ?? [];
    list.push(r);
    by.set(r.season, list);
  }
  return [...by.entries()]
    .sort(([a], [b]) => a - b)
    .map(([season, list]) => {
      const t = seasonTotals(list);
      return {
        season,
        label: label(season),
        runs: t.runs,
        wickets: t.wickets,
        battingAverage: t.battingAverage,
        bowlingAverage: t.bowlingAverage,
      };
    });
}

/**
 * The grade the player has played most in range (by games), for the ranks
 * comparison (KTD4). Ties go to the more senior grade. Null with no games.
 */
export function mostPlayedGrade(
  rows: ReadonlyArray<PlayerSeasonStat>,
  range: StatsRange,
): string | null {
  const games = new Map<string, number>();
  for (const r of gradeRows(filterSeasonRows(rows, range))) {
    games.set(r.grade, (games.get(r.grade) ?? 0) + (r.games ?? 0));
  }
  const played = [...games.entries()].filter(([, g]) => g > 0);
  if (played.length === 0) return null;
  const order = sortGradesBySeniority(played.map(([g]) => g));
  return played.sort(([ga, a], [gb, b]) => b - a || order.indexOf(ga) - order.indexOf(gb))[0][0];
}

/** Ranks span: the range when bounded, else the player's last five seasons. */
export const RANK_SEASONS = 5;

export function rankSpan(
  rows: ReadonlyArray<PlayerSeasonStat>,
  range: StatsRange,
): { from: number; to: number } | null {
  if (range.from != null && range.to != null) return { from: range.from, to: range.to };
  const dated = rows.map((r) => r.season).filter((s): s is number => s != null);
  if (dated.length === 0) return null;
  const latest = range.to ?? Math.max(...dated);
  const from = range.from ?? latest - (RANK_SEASONS - 1);
  return { from, to: latest };
}

/**
 * Matches that set "the current rate" for Next up ETAs: the range when
 * bounded, otherwise the player's last three seasons of scorecards.
 */
export function rateWindow(
  matches: ReadonlyArray<PlayerMatchLine>,
  range: StatsRange,
): PlayerMatchLine[] {
  if (range.from != null || range.to != null) {
    return matches.filter(
      (m) =>
        m.season != null &&
        (range.from == null || m.season >= range.from) &&
        (range.to == null || m.season <= range.to),
    );
  }
  const seasons = [...new Set(matches.map((m) => m.season).filter((s) => s != null))]
    .sort((a, b) => (b as number) - (a as number))
    .slice(0, 3);
  return matches.filter((m) => m.season != null && seasons.includes(m.season));
}

/** "Mandurah" → "MAN" for the form-guide axis. */
export function opponentAbbrev(name: string | null | undefined): string {
  const clean = (name ?? "").replace(/[^A-Za-z ]/g, "").trim();
  if (!clean) return "—";
  return clean.slice(0, 3).toUpperCase();
}

export const fmt1 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? null : n.toFixed(1);
export const fmt2 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? null : n.toFixed(2);
