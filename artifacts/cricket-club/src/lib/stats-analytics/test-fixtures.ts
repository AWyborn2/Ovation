/**
 * Test-only builders for the enriched API rows. Not exported from the module
 * index; imported by the `*.test.ts` files beside it.
 */
import type { PlayerInnings, PlayerMatchLine, PlayerSeasonStat } from "@workspace/api-client-react";

let nextId = 1;

export function inn(p: Partial<PlayerInnings> & { runs: number }): PlayerInnings {
  const notOut = p.notOut ?? false;
  return {
    balls: null,
    battingPos: null,
    dismissedBy: null,
    dismissalType: notOut ? "notOut" : "other",
    ...p,
    notOut,
  };
}

export function match(p: Partial<PlayerMatchLine> = {}): PlayerMatchLine {
  const innings = p.innings ?? [];
  const runs = innings.length ? innings.reduce((s, i) => s + (i.runs ?? 0), 0) : null;
  return {
    matchId: nextId++,
    grade: "A Grade",
    season: 2024,
    round: 1,
    opponent: "Rivals",
    batted: innings.length > 0,
    runs,
    bowled: false,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    isHome: null,
    battedFirst: null,
    opponentClubId: null,
    ...p,
    innings,
  };
}

export function bowl(wickets: number, runsConceded: number, overs = "8"): Partial<PlayerMatchLine> {
  return { bowled: true, wickets, runsConceded, overs };
}

export function season(p: Partial<PlayerSeasonStat> & { season: number | null }): PlayerSeasonStat {
  return {
    grade: "A Grade",
    ballsFaced: null,
    ballsBowled: null,
    maidens: null,
    ...p,
  };
}
