/**
 * Australian cricket seasons run July to June and are named by their start
 * year, matching `matches.season` (2026 = the 2026/27 season).
 *
 * Dates are read in Perth time (UTC+8, no daylight saving) so a fixture that
 * starts just after midnight on 1 July local time lands in the new season even
 * though it is still 30 June in UTC.
 */

const PERTH_OFFSET_MS = 8 * 60 * 60 * 1000;
/** Month index (0-based) on which a new season starts: July. */
const SEASON_START_MONTH = 6;

/** The season start year for a date (fixtures, lineups, the admin default season). */
export function seasonStartYearFor(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = d.getTime();
  if (Number.isNaN(ms)) throw new Error(`seasonStartYearFor: invalid date ${String(date)}`);
  const perth = new Date(ms + PERTH_OFFSET_MS);
  const year = perth.getUTCFullYear();
  return perth.getUTCMonth() >= SEASON_START_MONTH ? year : year - 1;
}
