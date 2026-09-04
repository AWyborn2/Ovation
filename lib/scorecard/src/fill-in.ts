/**
 * Fill-in players (borrowed players, not club members) carry synthetic ids at
 * or above this floor. They show on scorecards but never link, aggregate,
 * earn caps or award points, and are excluded from EVERY stats derivation
 * (replit.md Gotcha). This is the single source of that rule for web, mobile
 * and the API server — do not re-declare the literal elsewhere.
 */
export const FILL_IN_THRESHOLD = 90000;

/** True when a register id denotes a fill-in rather than a real player. */
export function isFillInPlayerId(playerId: number): boolean {
  return playerId >= FILL_IN_THRESHOLD;
}
