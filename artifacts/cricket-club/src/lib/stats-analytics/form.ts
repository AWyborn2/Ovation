import type { PlayerMatchLine } from "@workspace/api-client-react";
import { inningsOf, isOut, sortMatchesChronological } from "./range";
import {
  type Analytic,
  battingAverage,
  bowlingAverage,
  insufficient,
  MIN_POINTS,
  NO_BOWLING_REASON,
  ready,
} from "./shared";

/**
 * Form guide (R2): the last 10 innings, newest first. Batting counts INNINGS
 * (a two-innings match gives two bars, the second newer); bowling counts the
 * matches the player bowled in, since bowling figures are per match.
 */

export const FORM_LENGTH = 10;
/** A batting bar is highlighted at 50 or more (not-out 50s included). */
export const FORM_BAT_HIGHLIGHT = 50;
/** A bowling bar is highlighted at 3 wickets or more. */
export const FORM_BOWL_HIGHLIGHT = 3;

export interface BattingFormEntry {
  matchId: number;
  season: number | null;
  inningsNo: number;
  opponent: string | null;
  runs: number;
  balls: number | null;
  notOut: boolean;
  /** "52*" style label. */
  label: string;
  highlight: boolean;
}

export interface BattingForm {
  entries: BattingFormEntry[];
  /** Average over the form window (null when never dismissed in it). */
  recentAverage: number | null;
  /** Average over everything passed in (the range), for the delta. */
  rangeAverage: number | null;
  /** recent − range; positive is better. Null if either side is unknown. */
  delta: number | null;
}

export function battingForm(
  matches: ReadonlyArray<PlayerMatchLine>,
  length = FORM_LENGTH,
): Analytic<BattingForm> {
  const all = inningsOf(matches);
  if (all.length < MIN_POINTS) return insufficient("Fewer than 3 innings in this range");
  const recent = all.slice(-length).reverse();
  const entries = recent.map((inn) => {
    const runs = inn.runs ?? 0;
    return {
      matchId: inn.matchId,
      season: inn.season,
      inningsNo: inn.inningsNo,
      opponent: inn.opponent,
      runs,
      balls: inn.balls,
      notOut: inn.notOut,
      label: `${runs}${inn.notOut ? "*" : ""}`,
      highlight: runs >= FORM_BAT_HIGHLIGHT,
    };
  });
  const avg = (list: typeof all) =>
    battingAverage(
      list.reduce((s, i) => s + (i.runs ?? 0), 0),
      list.filter(isOut).length,
    );
  const recentAverage = avg(recent);
  const rangeAverage = avg(all);
  return ready({
    entries,
    recentAverage,
    rangeAverage,
    delta: recentAverage != null && rangeAverage != null ? recentAverage - rangeAverage : null,
  });
}

export interface BowlingFormEntry {
  matchId: number;
  season: number | null;
  opponent: string | null;
  wickets: number;
  runsConceded: number;
  overs: string | null;
  /** "3/24" figures for the tooltip. */
  figures: string;
  highlight: boolean;
}

export interface BowlingForm {
  entries: BowlingFormEntry[];
  recentAverage: number | null;
  rangeAverage: number | null;
  /** range − recent: positive means the recent average is better (lower). */
  delta: number | null;
}

export function bowlingForm(
  matches: ReadonlyArray<PlayerMatchLine>,
  length = FORM_LENGTH,
): Analytic<BowlingForm> {
  const bowled = sortMatchesChronological(matches).filter((m) => m.bowled);
  if (bowled.length === 0) return insufficient(NO_BOWLING_REASON);
  if (bowled.length < MIN_POINTS) return insufficient("Fewer than 3 bowling innings in this range");
  const recent = bowled.slice(-length).reverse();
  const entries = recent.map((m) => {
    const wickets = m.wickets ?? 0;
    const runsConceded = m.runsConceded ?? 0;
    return {
      matchId: m.matchId,
      season: m.season ?? null,
      opponent: m.opponent ?? null,
      wickets,
      runsConceded,
      overs: m.overs ?? null,
      figures: `${wickets}/${runsConceded}`,
      highlight: wickets >= FORM_BOWL_HIGHLIGHT,
    };
  });
  const avg = (list: ReadonlyArray<PlayerMatchLine>) =>
    bowlingAverage(
      list.reduce((s, m) => s + (m.runsConceded ?? 0), 0),
      list.reduce((s, m) => s + (m.wickets ?? 0), 0),
    );
  const recentAverage = avg(recent);
  const rangeAverage = avg(bowled);
  return ready({
    entries,
    recentAverage,
    rangeAverage,
    delta: recentAverage != null && rangeAverage != null ? rangeAverage - recentAverage : null,
  });
}
