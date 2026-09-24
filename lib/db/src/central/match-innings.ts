// Pure helpers behind the enriched central match log / season rows (plan
// 2026-09-24-002 U3, KTD2). Kept free of the central pool so they unit-test
// without a database.
import { classifyInnings } from "./scoring";

/**
 * One played innings of a player in a match, as read from central
 * `match_batting`. `dismissal` / `dismissalType` are the raw central text and
 * type — the API route classifies them into its enum (it owns the parser), and
 * never returns these raw fields.
 */
export interface CentralInningsLine {
  /** Match-level innings number (1–4). */
  innings: number | null;
  runs: number | null;
  balls: number | null;
  notOut: boolean;
  battingPos: number | null;
  dismissal: string | null;
  dismissalType: string | null;
}

/**
 * A player's batting lines for ONE match → their played innings, in innings
 * order. "Did not bat" lines are not innings (same rule as every total), so a
 * two-innings match where the player batted once yields one entry.
 */
export function buildInningsLines(
  lines: {
    innings: number | null;
    batOrder: number | null;
    runs: number | null;
    balls: number | null;
    dismissal: string | null;
    dismissalType: string | null;
  }[],
): CentralInningsLine[] {
  return [...lines]
    .sort((a, b) => (a.innings ?? 0) - (b.innings ?? 0))
    .map((b) => ({ b, kind: classifyInnings(b.dismissalType, b.dismissal) }))
    .filter(({ kind }) => kind !== "dnb")
    .map(({ b, kind }) => ({
      innings: b.innings,
      runs: b.runs,
      balls: b.balls,
      notOut: kind === "notout",
      battingPos: b.batOrder,
      dismissal: b.dismissal,
      dismissalType: b.dismissalType,
    }));
}

/**
 * Did the club bat first? Central `match_batting.innings` is the MATCH-level
 * innings number (1–4): the two sides alternate (e.g. 1,3 vs 2,4) and no match
 * has both clubs on the same number — verified across the PCA and WA data
 * (Sep 2026). So the side with the lower minimum innings batted first.
 * When only one side has lines (a washed-out second innings), innings 1 still
 * tells us; with no lines at all the answer is unknown (null).
 */
export function battedFirstFrom(
  clubMinInnings: number | null | undefined,
  oppMinInnings: number | null | undefined,
): boolean | null {
  const club = clubMinInnings ?? null;
  const opp = oppMinInnings ?? null;
  if (club !== null && opp !== null) {
    if (club === opp) return null;
    return club < opp;
  }
  if (club !== null) return club === 1 ? true : null;
  if (opp !== null) return opp === 1 ? false : null;
  return null;
}

/**
 * Central `match_bowling.overs` is cricket ball-notation stored as a double
 * (4.3 = 4 overs 3 balls). → balls; null for NULL or impossible values (a ball
 * digit above 5, a handful of bad source rows), which are left out of sums
 * rather than guessed.
 */
export function centralOversToBalls(overs: number | null | undefined): number | null {
  if (overs == null || !Number.isFinite(overs) || overs < 0) return null;
  const whole = Math.floor(overs);
  const ballDigit = Math.round((overs - whole) * 10);
  if (ballDigit > 5) return null;
  return whole * 6 + ballDigit;
}

/** Sum of the non-null values; null when every value is null (unknown ≠ 0). */
export function sumKnown(values: (number | null | undefined)[]): number | null {
  let any = false;
  let total = 0;
  for (const v of values) {
    if (v == null) continue;
    any = true;
    total += v;
  }
  return any ? total : null;
}
