import type { PostingKindRow, PostingScheduleRow, PostingSlotRow } from "@workspace/db";
import { CLUB_TIME_ZONE, clubTimeToUtc, type RoundSchedules } from "./round-schedules";

/**
 * The club's posting calendar settings (plan 2026-10-07-003, U2).
 *
 * Every card kind maps to a slot kind. Each slot kind has weekly day-and-time
 * slots and a collision rule for several cards in one slot ("space" them out
 * by the club's minimum gap, or "roll" extras to later slots). The club sets
 * one daily cap, one minimum gap and one age limit. Off until `enabled`; a
 * club that never turns it on keeps today's behaviour (R17).
 *
 * Times are club time. Tenants carry no timezone yet and every pilot club is
 * in Western Australia, so club time is Perth time, as for round schedules.
 */

export const SLOT_KINDS = [
  "results",
  "roundResults",
  "teamLists",
  "gameDay",
  "milestones",
  "debuts",
  "achievements",
  "roundUp",
  "other",
] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

export const SLOT_KIND_LABELS: Record<SlotKind, string> = {
  results: "Match results",
  roundResults: "Round results carousel",
  teamLists: "Team lists",
  gameDay: "Game day",
  milestones: "Milestones",
  debuts: "Debuts",
  achievements: "Centuries, five-fors and records",
  roundUp: "Round-ups, ladders and leaderboards",
  other: "Everything else",
};

/** Slot kinds whose cards are expected every round (shown as placeholders). */
export const ROUND_SLOT_KINDS: readonly SlotKind[] = ["roundResults", "teamLists", "gameDay"];

const CARD_KIND_SLOT: Record<string, SlotKind> = {
  matchSummary: "results",
  bigMoment: "results",
  premiership: "results",
  resultsSummary: "results",
  weekendWrap: "roundResults",
  teamList: "teamLists",
  teamListRound: "teamLists",
  matchDay: "gameDay",
  roundFixtures: "gameDay",
  countdown: "gameDay",
  milestone: "milestones",
  debut: "debuts",
  century: "achievements",
  fiveFor: "achievements",
  record: "achievements",
  player: "achievements",
  tradingCard: "achievements",
  gradeLeader: "roundUp",
  ladder: "roundUp",
  clubLeaderboard: "roundUp",
  juniorHighlights: "roundUp",
  teamOfWeek: "roundUp",
};

/** The slot kind a card kind posts in; unknown kinds use "other". */
export function slotKindOf(cardKind: unknown): SlotKind {
  return (typeof cardKind === "string" && CARD_KIND_SLOT[cardKind]) || "other";
}

export type PostingSlot = PostingSlotRow;
export type PostingKind = PostingKindRow;
export type PostingSchedule = {
  enabled: boolean;
  dailyCap: number;
  minGapMinutes: number;
  ageLimitDays: number;
  kinds: Record<SlotKind, PostingKind>;
};

export const CAP_RANGE = { min: 1, max: 20 } as const;
export const GAP_RANGE = { min: 0, max: 240, step: 15 } as const;
export const AGE_RANGE = { min: 1, max: 30 } as const;
export const MAX_SLOTS_PER_KIND = 14;

const sunday6pm: PostingKind = { slots: [{ day: 0, time: "18:00" }], collision: "space" };

/** Defaults a club sees before it saves anything (calendar off). */
export const DEFAULT_POSTING_SCHEDULE: PostingSchedule = {
  enabled: false,
  dailyCap: 4,
  minGapMinutes: 45,
  ageLimitDays: 7,
  kinds: {
    results: {
      slots: [
        { day: 6, time: "19:00" },
        { day: 0, time: "19:00" },
      ],
      collision: "space",
    },
    roundResults: { slots: [{ day: 0, time: "19:00" }], collision: "roll" },
    teamLists: { slots: [{ day: 5, time: "12:00" }], collision: "space" },
    gameDay: { slots: [{ day: 4, time: "18:00" }], collision: "space" },
    milestones: sunday6pm,
    debuts: sunday6pm,
    achievements: { slots: [{ day: 1, time: "18:00" }], collision: "space" },
    roundUp: { slots: [{ day: 2, time: "18:00" }], collision: "space" },
    other: { slots: [{ day: 3, time: "18:00" }], collision: "space" },
  },
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The defaults for a club turning the calendar on for the first time: the
 * round cards keep the day and hour the club already drafts them at (KTD4).
 */
export function seedPostingSchedule(round: RoundSchedules): PostingSchedule {
  const at = (s: { day: number; hour: number }): PostingSlot => ({
    day: s.day,
    time: `${pad(s.hour)}:00`,
  });
  return {
    ...DEFAULT_POSTING_SCHEDULE,
    kinds: {
      ...DEFAULT_POSTING_SCHEDULE.kinds,
      roundResults: { slots: [at(round.weekendWrap)], collision: "roll" },
      teamLists: { slots: [at(round.teamLists)], collision: "space" },
      gameDay: { slots: [at(round.gameDay)], collision: "space" },
    },
  };
}

/** The club's effective schedule: saved values over the defaults. */
export function resolvePostingSchedule(
  saved: PostingScheduleRow | null | undefined,
): PostingSchedule {
  const d = DEFAULT_POSTING_SCHEDULE;
  const kinds = { ...d.kinds };
  for (const k of SLOT_KINDS) {
    const s = saved?.kinds?.[k];
    if (s) kinds[k] = { slots: s.slots.map((x) => ({ ...x })), collision: s.collision };
  }
  return {
    enabled: saved?.enabled ?? d.enabled,
    dailyCap: saved?.dailyCap ?? d.dailyCap,
    minGapMinutes: saved?.minGapMinutes ?? d.minGapMinutes,
    ageLimitDays: saved?.ageLimitDays ?? d.ageLimitDays,
    kinds,
  };
}

/** Saved schedule with `patch` merged in; kinds merge per kind. */
export function mergePostingSchedule(
  saved: PostingScheduleRow | null | undefined,
  patch: PostingScheduleRow,
): PostingScheduleRow {
  return {
    ...(saved ?? {}),
    ...patch,
    kinds: { ...(saved?.kinds ?? {}), ...(patch.kinds ?? {}) },
  };
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes after midnight for "HH:mm", or null. */
export function slotMinutes(time: string): number | null {
  const m = TIME_RE.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Why a submitted schedule can't be saved, or null when it's fine. */
export function invalidPostingSchedule(patch: PostingScheduleRow): string | null {
  const inRange = (v: number, r: { min: number; max: number }) =>
    Number.isInteger(v) && v >= r.min && v <= r.max;
  if (patch.dailyCap !== undefined && !inRange(patch.dailyCap, CAP_RANGE)) {
    return `The daily cap must be between ${CAP_RANGE.min} and ${CAP_RANGE.max} posts.`;
  }
  if (
    patch.minGapMinutes !== undefined &&
    (!inRange(patch.minGapMinutes, GAP_RANGE) || patch.minGapMinutes % GAP_RANGE.step !== 0)
  ) {
    return "The gap between posts must be 0 to 240 minutes, in 15-minute steps.";
  }
  if (patch.ageLimitDays !== undefined && !inRange(patch.ageLimitDays, AGE_RANGE)) {
    return `The age limit must be between ${AGE_RANGE.min} and ${AGE_RANGE.max} days.`;
  }
  for (const [kind, k] of Object.entries(patch.kinds ?? {})) {
    if (!(SLOT_KINDS as readonly string[]).includes(kind)) return `Unknown card kind "${kind}".`;
    if (!k) continue;
    if (k.collision !== "space" && k.collision !== "roll") return "Unknown collision rule.";
    if (!Array.isArray(k.slots) || k.slots.length > MAX_SLOTS_PER_KIND) {
      return `A card kind can have at most ${MAX_SLOTS_PER_KIND} posting times.`;
    }
    for (const s of k.slots) {
      const minutes = slotMinutes(s.time);
      if (!Number.isInteger(s.day) || s.day < 0 || s.day > 6 || minutes === null) {
        return "Each posting time needs a day and a time.";
      }
      if (minutes % 15 !== 0) return "Posting times are in 15-minute steps.";
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Club time helpers
// ---------------------------------------------------------------------------

/** The club-local calendar date and weekday at `at`. */
export function clubDate(
  at: Date,
  timeZone: string = CLUB_TIME_ZONE,
): { key: string; weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const key = `${get("year")}-${get("month")}-${get("day")}`;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { key, weekday, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** "YYYY-MM-DD" shifted by `days` (pure calendar arithmetic). */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** The weekday (0 = Sunday) of a "YYYY-MM-DD" date. */
export function weekdayOfKey(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Midnight at the start of a club-local day, as a UTC instant. */
export function clubDayStart(key: string, timeZone: string = CLUB_TIME_ZONE): Date {
  return clubTimeToUtc(`${key}T00:00`, timeZone) as Date;
}

/** A slot on a club-local date as a UTC instant. */
export function slotInstant(key: string, time: string, timeZone: string = CLUB_TIME_ZONE): Date {
  return clubTimeToUtc(`${key}T${time}`, timeZone) as Date;
}
