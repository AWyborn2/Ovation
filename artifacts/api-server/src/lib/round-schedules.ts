import type { RoundScheduleRow, RoundSchedulesRow } from "@workspace/db";

/**
 * When the round cards draft themselves (balanced card sets, plan
 * 2026-10-01-001 U5). Each club picks, per card:
 *
 *  - game day:     one card per match two days out ("perFixture", the default),
 *                  the whole round as one set at a chosen day and hour
 *                  ("perRound"), or off;
 *  - team lists:   one card per published XI ("perFixture", the default), the
 *                  round's published XIs as one set at a chosen day and hour,
 *                  or off;
 *  - match results ("weekendWrap"): each match's own result card ("perFixture", or "off",
 *                  the default), the round's results as one carousel at a chosen day and
 *                  hour, the cover then each match's result card ("perRound"; the
 *                  per-match cards stop), or "both".
 *
 * Times are club time. Tenants carry no timezone yet and every pilot club is
 * in Western Australia, so club time is Perth time, as for fixture times.
 */

export type RoundCard = "gameDay" | "teamLists" | "weekendWrap";
export const ROUND_CARDS: readonly RoundCard[] = ["gameDay", "teamLists", "weekendWrap"];

export type RoundSchedule = RoundScheduleRow;
export type RoundSchedules = Record<RoundCard, RoundSchedule>;

export const CLUB_TIME_ZONE = "Australia/Perth";

/**
 * Defaults keep a club that never saves a schedule exactly as it was: game
 * day and team lists per match, no weekend wrap. The day and hour are what a
 * club sees first when it switches a card to a round set.
 */
export const DEFAULT_ROUND_SCHEDULES: RoundSchedules = {
  // Thursday 6 pm: after selection night, before the weekend.
  gameDay: { mode: "perFixture", day: 4, hour: 18 },
  // Friday 12 pm: once the XIs are in.
  teamLists: { mode: "perFixture", day: 5, hour: 12 },
  // Sunday 7 pm: after the last results of the weekend.
  weekendWrap: { mode: "off", day: 0, hour: 19 },
};

/** The club's effective schedules: saved values over the defaults. */
export function resolveRoundSchedules(saved: RoundSchedulesRow | null | undefined): RoundSchedules {
  const out = { ...DEFAULT_ROUND_SCHEDULES };
  for (const card of ROUND_CARDS) {
    const s = saved?.[card];
    if (s) out[card] = { mode: s.mode, day: s.day, hour: s.hour };
  }
  return out;
}

/** Why a submitted schedule can't be saved, or null when it's fine. */
export function invalidRoundSchedule(card: RoundCard, s: RoundSchedule): string | null {
  if (card !== "weekendWrap" && s.mode === "both") {
    return "Only match results can draft both per match and per round.";
  }
  return null;
}

/** Match results: the round carousel is drafted ("perRound" or "both"). */
export function roundResultsCarouselOn(mode: RoundSchedule["mode"]): boolean {
  return mode === "perRound" || mode === "both";
}

/** Match results: each match gets its own result card (everything but carousel-only). */
export function matchResultCardsOn(mode: RoundSchedule["mode"]): boolean {
  return mode !== "perRound";
}

/** Saved schedules with `patch` merged in per card (the others keep theirs). */
export function mergeRoundSchedules(
  saved: RoundSchedulesRow | null | undefined,
  patch: RoundSchedulesRow,
): RoundSchedulesRow {
  return { ...(saved ?? {}), ...patch };
}

/** Minutes the club's time zone is ahead of UTC at `at`. */
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
  return Math.round((asUtc - Math.floor(at.getTime() / 60000) * 60000) / 60000);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A club-local wall-clock time ("YYYY-MM-DDTHH:mm") as a UTC instant, or null
 * when it isn't one. Used for officer-set publishing times.
 */
export function clubTimeToUtc(local: string, timeZone: string = CLUB_TIME_ZONE): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  if (new Date(asUtc).getUTCDate() !== d) return null;
  // Two passes settle the offset across a daylight-saving change.
  let at = asUtc - zoneOffsetMinutes(new Date(asUtc), timeZone) * 60000;
  at = asUtc - zoneOffsetMinutes(new Date(at), timeZone) * 60000;
  return new Date(at);
}

/**
 * The most recent moment at or before `now` that falls on `day` at `hour`
 * (club time): the moment this week's round set was due.
 */
export function lastScheduledAt(
  now: Date,
  s: Pick<RoundSchedule, "day" | "hour">,
  timeZone: string = CLUB_TIME_ZONE,
): Date {
  const offsetMs = zoneOffsetMinutes(now, timeZone) * 60000;
  // Shift into "club time as if it were UTC", step back, shift back.
  const local = new Date(now.getTime() + offsetMs);
  const candidate = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    s.hour,
  );
  const daysBack = (local.getUTCDay() - s.day + 7) % 7;
  let at = candidate - daysBack * DAY_MS;
  if (at > local.getTime()) at -= 7 * DAY_MS;
  return new Date(at - offsetMs);
}

/** A round set's drafting week: from its scheduled moment to the next one. */
export const ROUND_WINDOW_MS = 7 * DAY_MS;
