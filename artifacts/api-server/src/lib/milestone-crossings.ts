import { parseMatchDate } from "./match-date";

/**
 * The milestone board's career tier ladders and the native tier-crossing walk.
 *
 * Extracted from routes/milestones.ts so the Halls Head cut-over preview
 * (scripts/src/hh-cutover-preview.ts, hybrid stats plan U13) walks native
 * careers with the board's own code and reads the tiers the way each read path
 * does. Pure — no database, no request.
 */

export const DEFAULT_GAMES_TIERS = [100, 150, 200, 250, 300];
export const DEFAULT_RUNS_TIERS = [1000, 2000, 3000, 5000, 7500, 10000];
export const DEFAULT_WICKETS_TIERS = [100, 150, 200, 300];

/** The tier columns of a tenant's `milestone_board_settings` row. */
export interface MilestoneTierSettings {
  gamesTiers?: number[] | null;
  runsTiers?: number[] | null;
  wicketsTiers?: number[] | null;
}

export interface CareerTiers {
  games: number[];
  runs: number[];
  wickets: number[];
}

/** The native board's ladders: the club's tiers sorted ascending, defaults when unset or empty. */
export function nativeMilestoneTiers(
  settings: MilestoneTierSettings | null | undefined,
): CareerTiers {
  const sorted = (tiers: number[] | null | undefined, fallback: number[]): number[] =>
    (tiers?.length ? tiers : fallback).slice().sort((a, b) => a - b);
  return {
    games: sorted(settings?.gamesTiers, DEFAULT_GAMES_TIERS),
    runs: sorted(settings?.runsTiers, DEFAULT_RUNS_TIERS),
    wickets: sorted(settings?.wicketsTiers, DEFAULT_WICKETS_TIERS),
  };
}

/** The central board's ladders: the club's tiers as stored, defaults only when unset. */
export function centralMilestoneTiers(
  settings: MilestoneTierSettings | null | undefined,
): CareerTiers {
  return {
    games: settings?.gamesTiers ?? DEFAULT_GAMES_TIERS,
    runs: settings?.runsTiers ?? DEFAULT_RUNS_TIERS,
    wickets: settings?.wicketsTiers ?? DEFAULT_WICKETS_TIERS,
  };
}

/** A native scorecard line, as the crossing walk reads it. */
export interface CrossingLine {
  matchId: number;
  playerId: number;
  runs: number | null;
  wickets: number | null;
}

/** One career tier crossed at one match. */
export interface NativeCareerCrossing {
  playerId: number;
  boardKey: "games" | "runs" | "wickets";
  tierIndex: number;
  tier: number;
  /** The running career total after the match. */
  value: number;
  matchId: number;
}

/**
 * Walk each player's dated scorecard lines in match-date order and emit the
 * match where the running career total first reaches each tier. The totals
 * from before the scorecards (career minus the lines) are the starting point,
 * so a tier already passed in the pre-scorecard era never fires. Lines whose
 * match has no parseable date are left out, as are players with no career row.
 */
export function nativeCareerCrossings(ctx: {
  lines: readonly CrossingLine[];
  matchById: ReadonlyMap<number, { matchDate: string | null }>;
  careerById: ReadonlyMap<number, { games: number; runs: number; wickets: number }>;
  gamesTiers: readonly number[];
  runsTiers: readonly number[];
  wicketsTiers: readonly number[];
}): NativeCareerCrossing[] {
  const { lines, matchById, careerById, gamesTiers, runsTiers, wicketsTiers } = ctx;

  type WindowLine = {
    matchId: number;
    matchDate: string;
    games: number;
    runs: number;
    wickets: number;
  };
  const byPlayer = new Map<number, WindowLine[]>();
  for (const l of lines) {
    const m = matchById.get(l.matchId);
    const iso = m ? parseMatchDate(m.matchDate) : null;
    if (!m || !iso) continue;
    const arr = byPlayer.get(l.playerId) ?? [];
    arr.push({
      matchId: l.matchId,
      matchDate: iso,
      games: 1,
      runs: l.runs ?? 0,
      wickets: l.wickets ?? 0,
    });
    byPlayer.set(l.playerId, arr);
  }

  const stats = [
    { key: "games" as const, tiers: gamesTiers },
    { key: "runs" as const, tiers: runsTiers },
    { key: "wickets" as const, tiers: wicketsTiers },
  ];

  const out: NativeCareerCrossing[] = [];
  for (const [playerId, windowLines] of byPlayer) {
    const career = careerById.get(playerId);
    if (!career) continue;
    windowLines.sort((a, b) =>
      a.matchDate === b.matchDate ? a.matchId - b.matchId : a.matchDate < b.matchDate ? -1 : 1,
    );

    for (const stat of stats) {
      const windowTotal = windowLines.reduce((sum, w) => sum + w[stat.key], 0);
      const before = career[stat.key] - windowTotal;
      let running = before;
      for (const w of windowLines) {
        const prev = running;
        running += w[stat.key];
        for (let i = 0; i < stat.tiers.length; i++) {
          const tier = stat.tiers[i]!;
          if (prev < tier && running >= tier) {
            out.push({
              playerId,
              boardKey: stat.key,
              tierIndex: i,
              tier,
              value: running,
              matchId: w.matchId,
            });
          }
        }
      }
    }
  }
  return out;
}
