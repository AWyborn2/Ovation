/**
 * Overs are stored in cricket ball-notation ("O.B", e.g. "10.3" = 10 overs and
 * 3 balls). These helpers convert to/from a plain ball count so innings totals
 * and economy rates compute correctly.
 */

/** "10.3" -> 63 balls. Bare integers ("10") -> 60. Invalid -> null. */
export function oversToBalls(overs: string | null | undefined): number | null {
  if (overs == null) return null;
  const s = String(overs).trim();
  if (!s) return null;
  const m = /^(\d+)(?:\.(\d))?$/.exec(s);
  if (!m) return null;
  const whole = parseInt(m[1], 10);
  const balls = m[2] ? parseInt(m[2], 10) : 0;
  if (balls > 5) return null;
  return whole * 6 + balls;
}

/** 63 balls -> "10.3". */
export function ballsToOvers(balls: number): string {
  const whole = Math.floor(balls / 6);
  const rem = balls % 6;
  return rem === 0 ? String(whole) : `${whole}.${rem}`;
}

/** Sum a set of bowler overs (ball-notation) into a single innings total. */
export function sumOvers(oversList: (string | null | undefined)[]): string | null {
  let totalBalls = 0;
  let any = false;
  for (const o of oversList) {
    const b = oversToBalls(o);
    if (b != null) {
      totalBalls += b;
      any = true;
    }
  }
  return any ? ballsToOvers(totalBalls) : null;
}

/** Economy = runs conceded per six balls bowled. Null when overs unknown/zero. */
export function economy(
  runsConceded: number | null | undefined,
  overs: string | null | undefined,
): number | null {
  const balls = oversToBalls(overs);
  if (balls == null || balls === 0 || runsConceded == null) return null;
  return (runsConceded / balls) * 6;
}
