import { vi } from "vitest";

/**
 * Noon (Perth) on the next Wednesday after today. Suites that build "this weekend's"
 * fixtures from the current round (Selection Hub, availability) pin the clock here so their
 * matches are always still to come. Run on a Saturday afternoon or a Sunday, the real
 * round's matches have already started and finalise / withdraw are rightly refused.
 */
export function nextWednesdayNoonPerth(from = new Date()): Date {
  const PERTH = 8 * 3_600_000;
  const local = new Date(from.getTime() + PERTH);
  const daysAhead = (3 - local.getUTCDay() + 7) % 7 || 7;
  const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + daysAhead);
  return new Date(day + 12 * 3_600_000 - PERTH);
}

/** Fake only `Date` (timers stay real), set to {@link nextWednesdayNoonPerth}. */
export function pinClockMidWeek(): void {
  vi.useFakeTimers({ toFake: ["Date"], now: nextWednesdayNoonPerth() });
}
