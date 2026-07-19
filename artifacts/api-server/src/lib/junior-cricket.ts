/**
 * Junior cricket numeric helpers shared by the juniors read routes and the
 * juniors admin (stat-correction) routes.
 *
 * Junior overs are stored in cricket ball notation (e.g. 4.5 = 4 overs 5
 * balls, 6 balls per over), NOT decimal — so they must be converted to balls
 * before summing, then back. Summing the raw reals would corrupt totals and
 * economy.
 */
export const BALLS_PER_OVER = 6;

export function oversToBalls(overs: number | null): number {
  if (!overs) return 0;
  const whole = Math.floor(overs);
  const balls = Math.round((overs - whole) * 10);
  return whole * BALLS_PER_OVER + balls;
}

export function ballsToOvers(balls: number): number {
  return Math.floor(balls / BALLS_PER_OVER) + (balls % BALLS_PER_OVER) / 10;
}

/** True when a real is well-formed ball notation: fractional digit 0-5. */
export function isValidOversNotation(overs: number): boolean {
  if (overs < 0) return false;
  const whole = Math.floor(overs);
  const frac = Math.round((overs - whole) * 10);
  // Reject more than one fractional digit (e.g. 3.45) as well as .6-.9.
  if (Math.abs(overs - (whole + frac / 10)) > 1e-9) return false;
  return frac >= 0 && frac < BALLS_PER_OVER;
}

/** Strike rate from runs/balls, rounded to 2dp; null when balls is 0/null. */
export function strikeRateOf(
  runs: number | null,
  balls: number | null,
): number | null {
  if (!balls || balls <= 0) return null;
  return Math.round(((runs ?? 0) / balls) * 100 * 100) / 100;
}

/** Economy from runs conceded + overs (ball notation); null when no balls. */
export function economyOf(
  runs: number | null,
  overs: number | null,
): number | null {
  const balls = oversToBalls(overs);
  if (balls <= 0) return null;
  return Math.round(((runs ?? 0) / (balls / BALLS_PER_OVER)) * 100) / 100;
}
