import type { PlayerMatchLine } from "@workspace/api-client-react";
import { type InningsEntry, inningsOf, isOut, matchBallsBowled } from "./range";
import {
  type Analytic,
  battingAverage,
  bowlingAverage,
  economyRate,
  insufficient,
  ready,
  knownBalls,
  strikeRateOverKnownBalls,
  sumKnown,
} from "./shared";
import { NOT_RECORDED_REASON } from "./dismissals";

/**
 * Favourite opponents (Profile heat table), Compare's opposition matrix and
 * nemesis cards — all from the same per-innings rows, so every opponent row
 * sums back to the range's per-match totals (R5). Matches with no resolved
 * opponent get their own "Unknown opponent" row rather than being dropped.
 *
 * Opponents key on `opponentClubId` (the read path's own id space) when set,
 * else on the normalised opponent name.
 */

export interface OppositionRow {
  key: string;
  opponentClubId: number | null;
  /** Display name (the most recent spelling seen). */
  opponent: string;
  matches: number;
  innings: number;
  outs: number;
  notOuts: number;
  runs: number;
  ballsFaced: number | null;
  average: number | null;
  strikeRate: number | null;
  highScore: { runs: number; notOut: boolean } | null;
  bowlingMatches: number;
  wickets: number;
  runsConceded: number;
  ballsBowled: number | null;
  bowlingAverage: number | null;
  economy: number | null;
  /** Best figures (most wickets, then fewest runs). */
  bestBowling: { wickets: number; runsConceded: number } | null;
}

export const UNKNOWN_OPPONENT_KEY = "unknown";
const UNKNOWN_OPPONENT_LABEL = "Unknown opponent";

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function opponentKey(m: Pick<PlayerMatchLine, "opponentClubId" | "opponent">): string {
  if (m.opponentClubId != null) return `club:${m.opponentClubId}`;
  const name = m.opponent?.trim();
  return name ? `name:${normName(name)}` : UNKNOWN_OPPONENT_KEY;
}

/** Per-opponent aggregates over the given matches, most-played first. */
export function oppositionTable(matches: ReadonlyArray<PlayerMatchLine>): OppositionRow[] {
  type Acc = {
    row: OppositionRow;
    balls: (number | null)[];
    /** Each innings' runs and balls, for a strike rate over recorded balls only. */
    bat: { runs: number; balls: number | null }[];
    bowledBalls: (number | null)[];
    latest: number;
  };
  const byKey = new Map<string, Acc>();
  const inningsByMatch = new Map<number, InningsEntry[]>();
  for (const inn of inningsOf(matches)) {
    const list = inningsByMatch.get(inn.matchId) ?? [];
    list.push(inn);
    inningsByMatch.set(inn.matchId, list);
  }

  matches.forEach((m, order) => {
    const key = opponentKey(m);
    let acc = byKey.get(key);
    if (!acc) {
      acc = {
        row: {
          key,
          opponentClubId: m.opponentClubId ?? null,
          opponent: m.opponent?.trim() || UNKNOWN_OPPONENT_LABEL,
          matches: 0,
          innings: 0,
          outs: 0,
          notOuts: 0,
          runs: 0,
          ballsFaced: null,
          average: null,
          strikeRate: null,
          highScore: null,
          bowlingMatches: 0,
          wickets: 0,
          runsConceded: 0,
          ballsBowled: null,
          bowlingAverage: null,
          economy: null,
          bestBowling: null,
        },
        balls: [],
        bat: [],
        bowledBalls: [],
        latest: -Infinity,
      };
      byKey.set(key, acc);
    }
    const r = acc.row;
    // Rows arrive newest first from the API; keep the newest spelling by season.
    const recency = (m.season ?? -Infinity) * 1e6 - order;
    if (m.opponent?.trim() && recency > acc.latest) {
      acc.latest = recency;
      r.opponent = m.opponent.trim();
    }
    r.matches += 1;
    for (const inn of inningsByMatch.get(m.matchId) ?? []) {
      const runs = inn.runs ?? 0;
      r.innings += 1;
      r.runs += runs;
      if (isOut(inn)) r.outs += 1;
      else r.notOuts += 1;
      acc.balls.push(knownBalls(inn.balls));
      acc.bat.push({ runs, balls: inn.balls });
      if (
        !r.highScore ||
        runs > r.highScore.runs ||
        (runs === r.highScore.runs && inn.notOut && !r.highScore.notOut)
      ) {
        r.highScore = { runs, notOut: inn.notOut };
      }
    }
    if (m.bowled) {
      const w = m.wickets ?? 0;
      const rc = m.runsConceded ?? 0;
      r.bowlingMatches += 1;
      r.wickets += w;
      r.runsConceded += rc;
      acc.bowledBalls.push(matchBallsBowled(m));
      const b = r.bestBowling;
      if (!b || w > b.wickets || (w === b.wickets && rc < b.runsConceded)) {
        r.bestBowling = { wickets: w, runsConceded: rc };
      }
    }
  });

  const rows = [...byKey.values()].map(({ row, balls, bat, bowledBalls }) => {
    row.ballsFaced = sumKnown(balls);
    row.ballsBowled = sumKnown(bowledBalls);
    row.average = battingAverage(row.runs, row.outs);
    row.strikeRate = strikeRateOverKnownBalls(bat);
    row.bowlingAverage = bowlingAverage(row.runsConceded, row.wickets);
    row.economy = economyRate(row.runsConceded, row.ballsBowled);
    return row;
  });
  return rows.sort(
    (a, b) =>
      Number(a.key === UNKNOWN_OPPONENT_KEY) - Number(b.key === UNKNOWN_OPPONENT_KEY) ||
      b.matches - a.matches ||
      a.opponent.localeCompare(b.opponent),
  );
}

// ---------------------------------------------------------------------------
// Nemesis
// ---------------------------------------------------------------------------

/**
 * Normalise a bowler name to a surname key. The API already sends a
 * normalised surname; this is defensive so "J Nguyen", "J. Nguyen" and
 * "nguyen" always group together. Leading initials are dropped while a
 * surname token remains.
 */
export function normaliseBowler(name: string | null | undefined): string | null {
  if (!name) return null;
  const tokens = name
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .replace(/\./g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && tokens[0].length === 1) tokens.shift();
  const key = tokens.join(" ");
  return key && !/^\*+$/.test(key) ? key : null;
}

function titleCase(s: string): string {
  return s.replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
}

export interface NemesisEntry {
  /** Surname key, normalised. */
  bowlerKey: string;
  /** Surname for display ("Nguyen"). */
  bowler: string;
  opponentKey: string;
  opponentClubId: number | null;
  opponent: string;
  dismissals: number;
  /** The player's innings against that opponent. */
  inningsVsOpponent: number;
}

export interface Nemesis {
  top: NemesisEntry;
  /** Everyone at or above the threshold, ranked. */
  candidates: NemesisEntry[];
}

/** A nemesis only shows once a bowler has taken the player this many times. */
export const NEMESIS_MIN_DISMISSALS = 3;

export function nemesis(
  matches: ReadonlyArray<PlayerMatchLine>,
  minDismissals = NEMESIS_MIN_DISMISSALS,
): Analytic<Nemesis> {
  const innings = inningsOf(matches);
  const outs = innings.filter(isOut);
  if (outs.length === 0) return insufficient("No dismissals in this range");

  const table = new Map(oppositionTable(matches).map((r) => [r.key, r]));
  const counts = new Map<string, NemesisEntry>();
  let named = 0;
  for (const inn of outs) {
    const bowlerKey = normaliseBowler(inn.dismissedBy);
    if (!bowlerKey) continue;
    named += 1;
    const oKey = opponentKey(inn);
    const k = `${oKey}|${bowlerKey}`;
    const e = counts.get(k);
    if (e) {
      e.dismissals += 1;
      continue;
    }
    const opp = table.get(oKey);
    counts.set(k, {
      bowlerKey,
      bowler: titleCase(bowlerKey),
      opponentKey: oKey,
      opponentClubId: inn.opponentClubId,
      opponent: opp?.opponent ?? UNKNOWN_OPPONENT_LABEL,
      dismissals: 1,
      inningsVsOpponent: opp?.innings ?? 0,
    });
  }
  if (named === 0) return insufficient(NOT_RECORDED_REASON);

  const candidates = [...counts.values()]
    .filter((e) => e.dismissals >= minDismissals)
    .sort(
      (a, b) =>
        b.dismissals - a.dismissals ||
        a.inningsVsOpponent - b.inningsVsOpponent ||
        a.bowler.localeCompare(b.bowler),
    );
  if (candidates.length === 0) {
    return insufficient(`No bowler has taken this wicket ${minDismissals} times`);
  }
  return ready({ top: candidates[0], candidates });
}
