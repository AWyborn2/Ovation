import type { PlayerInnings, PlayerMatchLine, PlayerSeasonStat } from "@workspace/api-client-react";
import { oversToBalls } from "@workspace/scorecard";
import { inStatsRange, seasonLabel } from "../use-stats-view";
import { knownBalls, sumKnown } from "./shared";

/**
 * Range filtering, chronological ordering, per-innings flattening and the
 * per-match totals that every per-match chart must sum back to (R5).
 *
 * Coverage (KTD3): season rows include a pre-scorecard baseline row
 * (`season === null`) with no per-match rows behind it. Season-level views
 * read `PlayerSeasonStat`; per-match views read `PlayerMatchLine` and carry the
 * "Scorecard era" note from `scorecardCoverage` when the two differ.
 */

/** A season range by start year, inclusive; null ends are open (Career). */
export interface StatsRange {
  from: number | null;
  to: number | null;
}

export const CAREER: StatsRange = { from: null, to: null };

export function isCareer(range: StatsRange): boolean {
  return range.from == null && range.to == null;
}

/**
 * Season rows in range. Career keeps every row, the baseline included (its
 * totals are part of the career); a bounded range keeps only dated seasons
 * from–to inclusive.
 */
export function filterSeasonRows<T extends Pick<PlayerSeasonStat, "season">>(
  rows: ReadonlyArray<T>,
  range: StatsRange,
): T[] {
  if (isCareer(range)) return [...rows];
  return rows.filter((r) => r.season != null && inStatsRange(r.season, { ...range, d: "bat" }));
}

/** Match rows in range (Career keeps all; a bounded range drops undated rows). */
export function filterMatches<T extends Pick<PlayerMatchLine, "season">>(
  rows: ReadonlyArray<T>,
  range: StatsRange,
): T[] {
  if (isCareer(range)) return [...rows];
  return rows.filter((r) => r.season != null && inStatsRange(r.season, { ...range, d: "bat" }));
}

/**
 * Oldest first: season, then regular rounds before finals, then round, then
 * match id (ids are allocated in load order, the best tiebreak both paths
 * share). The API returns newest first; every derivation re-sorts here.
 */
export function sortMatchesChronological<T extends PlayerMatchLine>(rows: ReadonlyArray<T>): T[] {
  const key = (r: PlayerMatchLine) => [
    r.season ?? -Infinity,
    r.stage != null ? 1 : 0,
    r.round ?? Infinity,
    r.matchId,
  ];
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    }
    return 0;
  });
}

/** One played innings with its match context. */
export interface InningsEntry extends PlayerInnings {
  matchId: number;
  season: number | null;
  grade: string;
  opponent: string | null;
  opponentClubId: number | null;
  isHome: boolean | null;
  battedFirst: boolean | null;
  /** 1-based innings number within the match (2 = the second innings). */
  inningsNo: number;
}

/** Every played innings, oldest first (a match's innings in innings order). */
export function inningsOf(rows: ReadonlyArray<PlayerMatchLine>): InningsEntry[] {
  const out: InningsEntry[] = [];
  for (const m of sortMatchesChronological(rows)) {
    (m.innings ?? []).forEach((inn, i) => {
      out.push({
        ...inn,
        matchId: m.matchId,
        season: m.season ?? null,
        grade: m.grade,
        opponent: m.opponent ?? null,
        opponentClubId: m.opponentClubId ?? null,
        isHome: m.isHome ?? null,
        battedFirst: m.battedFirst ?? null,
        inningsNo: i + 1,
      });
    });
  }
  return out;
}

/** An innings counts as a dismissal exactly when it isn't not-out. */
export function isOut(inn: Pick<PlayerInnings, "notOut">): boolean {
  return !inn.notOut;
}

/** Balls bowled in a match row (ball-notation overs), null when unrecorded. */
export function matchBallsBowled(m: Pick<PlayerMatchLine, "bowled" | "overs">): number | null {
  return m.bowled ? oversToBalls(m.overs ?? null) : null;
}

/**
 * The per-match totals over a set of match rows — the figure every per-match
 * chart's per-opponent / per-split rows must sum back to (R5). Batting comes
 * from `innings[]` (so a two-innings match counts both), bowling and fielding
 * from the row.
 */
export interface MatchTotals {
  matches: number;
  innings: number;
  notOuts: number;
  outs: number;
  runs: number;
  /** Null when no innings recorded a ball count. */
  ballsFaced: number | null;
  bowlingMatches: number;
  wickets: number;
  runsConceded: number;
  ballsBowled: number | null;
  maidens: number | null;
  catches: number;
}

export function matchTotals(rows: ReadonlyArray<PlayerMatchLine>): MatchTotals {
  const t: MatchTotals = {
    matches: rows.length,
    innings: 0,
    notOuts: 0,
    outs: 0,
    runs: 0,
    ballsFaced: null,
    bowlingMatches: 0,
    wickets: 0,
    runsConceded: 0,
    ballsBowled: null,
    maidens: null,
    catches: 0,
  };
  const balls: (number | null)[] = [];
  const bowledBalls: (number | null)[] = [];
  const maidens: (number | null)[] = [];
  for (const m of rows) {
    for (const inn of m.innings ?? []) {
      t.innings += 1;
      t.runs += inn.runs ?? 0;
      if (isOut(inn)) t.outs += 1;
      else t.notOuts += 1;
      balls.push(knownBalls(inn.balls));
    }
    if (m.bowled) {
      t.bowlingMatches += 1;
      t.wickets += m.wickets ?? 0;
      t.runsConceded += m.runsConceded ?? 0;
      bowledBalls.push(matchBallsBowled(m));
      maidens.push(m.maidens ?? null);
    }
    t.catches += m.catches ?? 0;
  }
  t.ballsFaced = sumKnown(balls);
  t.ballsBowled = sumKnown(bowledBalls);
  t.maidens = sumKnown(maidens);
  return t;
}

/** Pre-scorecard career totals (the `season === null` rows, summed over grades). */
export interface BaselineTotals {
  games: number;
  innings: number;
  notOuts: number;
  runs: number;
  fifties: number;
  hundreds: number;
  wickets: number;
  runsConceded: number;
  fiveWickets: number;
  catches: number;
}

export const EMPTY_BASELINE: BaselineTotals = {
  games: 0,
  innings: 0,
  notOuts: 0,
  runs: 0,
  fifties: 0,
  hundreds: 0,
  wickets: 0,
  runsConceded: 0,
  fiveWickets: 0,
  catches: 0,
};

export function baselineTotals(seasons: ReadonlyArray<PlayerSeasonStat>): BaselineTotals {
  const t = { ...EMPTY_BASELINE };
  for (const s of seasons) {
    if (s.season != null) continue;
    t.games += s.games ?? 0;
    t.innings += s.innings ?? 0;
    t.notOuts += s.notOuts ?? 0;
    t.runs += s.runs ?? 0;
    t.fifties += s.fifties ?? 0;
    t.hundreds += s.hundreds ?? 0;
    t.wickets += s.wickets ?? 0;
    t.runsConceded += s.runsConceded ?? 0;
    t.fiveWickets += s.fiveWickets ?? 0;
    t.catches += s.catches ?? 0;
  }
  return t;
}

export interface ScorecardCoverage {
  /** Earliest dated season in the season rows (null when only a baseline). */
  debutSeason: number | null;
  /** Earliest season with per-match rows (null when there are none). */
  scorecardFrom: number | null;
  /** The season rows carry pre-scorecard baseline totals. */
  hasBaseline: boolean;
  /** Per-match charts cover less of the career than season-level ones. */
  partial: boolean;
  /** "Scorecard era: from 2019/20" when partial and scorecards exist, else null. */
  note: string | null;
}

export function scorecardCoverage(
  seasons: ReadonlyArray<PlayerSeasonStat>,
  matches: ReadonlyArray<PlayerMatchLine>,
): ScorecardCoverage {
  const dated = seasons.map((s) => s.season).filter((s): s is number => s != null);
  const matchSeasons = matches.map((m) => m.season).filter((s): s is number => s != null);
  const debutSeason = dated.length ? Math.min(...dated) : null;
  const scorecardFrom = matchSeasons.length ? Math.min(...matchSeasons) : null;
  const hasBaseline = seasons.some(
    (s) => s.season == null && ((s.games ?? 0) > 0 || (s.runs ?? 0) > 0 || (s.wickets ?? 0) > 0),
  );
  const partial =
    hasBaseline || (debutSeason != null && (scorecardFrom == null || debutSeason < scorecardFrom));
  return {
    debutSeason,
    scorecardFrom,
    hasBaseline,
    partial,
    note:
      partial && scorecardFrom != null ? `Scorecard era: from ${seasonLabel(scorecardFrom)}` : null,
  };
}
