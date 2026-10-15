/**
 * Club-time arithmetic for the posting calendar (plan 2026-10-07-003, U7).
 *
 * The calendar's days are the club's days, never the browser's: a card at
 * 00:30 Sunday in Perth sits in Sunday's column for a viewer anywhere. Club
 * time is Perth time for every current tenant (the server sends the zone).
 * Pure helpers, so the grid and list stay thin and these are unit-tested.
 */

export const CLUB_TIME_ZONE = "Australia/Perth";
export const STEP_MINUTES = 15;
const MINUTE = 60_000;
const DAY_MS = 24 * 60 * MINUTE;

const pad = (n: number) => String(n).padStart(2, "0");

/** Minutes the zone is ahead of UTC at `at`. */
function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(at.getTime() / MINUTE) * MINUTE) / MINUTE);
}

/** The club-local day ("YYYY-MM-DD") and minutes after midnight at `at`. */
export function clubParts(
  at: Date,
  timeZone: string = CLUB_TIME_ZONE,
): { day: string; minutes: number } {
  const shifted = new Date(at.getTime() + zoneOffsetMinutes(at, timeZone) * MINUTE);
  return {
    day: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

export const clubDay = (at: Date, timeZone?: string) => clubParts(at, timeZone).day;

/** A club-local day and minute as a UTC instant. */
export function clubInstant(day: string, minutes: number, timeZone: string = CLUB_TIME_ZONE): Date {
  const [y, m, d] = day.split("-").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  // Two passes settle the offset across a daylight-saving change.
  let at = asUtc - zoneOffsetMinutes(new Date(asUtc), timeZone) * MINUTE;
  at = asUtc - zoneOffsetMinutes(new Date(at), timeZone) * MINUTE;
  return new Date(at);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 0 = Sunday. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Monday on or before `day` (weeks run Monday to Sunday). */
export function mondayOf(day: string): string {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}

/** The seven days of the week starting `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Round to the nearest 15 minutes, kept inside the day. */
export function snapMinutes(minutes: number): number {
  const snapped = Math.round(minutes / STEP_MINUTES) * STEP_MINUTES;
  return Math.min(Math.max(snapped, 0), 24 * 60 - STEP_MINUTES);
}

/**
 * The hours the week grid shows: 6am to 10pm, widened to fit any card or
 * placeholder outside that (a 00:30 post must never be hidden).
 */
export function gridHours(
  times: Date[],
  timeZone: string = CLUB_TIME_ZONE,
): { startMinutes: number; endMinutes: number } {
  let start = 6 * 60;
  let end = 22 * 60;
  for (const t of times) {
    const { minutes } = clubParts(t, timeZone);
    start = Math.min(start, Math.floor(minutes / 60) * 60);
    end = Math.max(end, Math.min(24 * 60, Math.floor(minutes / 60) * 60 + 60));
  }
  return { startMinutes: start, endMinutes: end };
}

/** The club time under a pointer in a day column. */
export function minutesAtY(
  y: number,
  columnTop: number,
  pxPerMinute: number,
  startMinutes: number,
): number {
  return snapMinutes(startMinutes + (y - columnTop) / pxPerMinute);
}

export function formatClubTime(at: Date, timeZone: string = CLUB_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  })
    .format(at)
    .replace(/\s/g, " ")
    .toLowerCase();
}

/** "Sun 18 Oct" */
export function formatDayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "6:00 pm" for a minute of the day (labels on the grid's time rail). */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${h < 12 ? "am" : "pm"}`;
}

/** Whether a club-local day and minute is already in the past. */
export function isPast(day: string, minutes: number, now: Date = new Date()): boolean {
  return clubInstant(day, minutes).getTime() < now.getTime() - STEP_MINUTES * MINUTE;
}

export const DAY_IN_MS = DAY_MS;
