import {
  addDaysToKey,
  clubDate,
  clubDayStart,
  slotInstant,
  weekdayOfKey,
  type PostingKind,
} from "./posting-schedule";
import { CLUB_TIME_ZONE } from "./round-schedules";

/**
 * Where a card goes on the posting calendar (plan 2026-10-07-003, U2, KTD6).
 * Pure: everything it needs is passed in, so it is tested without a database
 * or a clock.
 *
 * The card's kind has weekly slots. Walking them from now:
 *
 *  - "space": the card takes the slot time, or the first 15-minute step after
 *    it that keeps the club's minimum gap from every planned post, before the
 *    kind's next slot and before club midnight;
 *  - "roll": one card of the kind per slot; a taken slot sends the card to the
 *    next one (a later step inside the slot is used only to keep the gap).
 *
 * Either way the day must be under the club's daily cap. A slot that passed
 * within the last `graceMinutes` still counts — the card goes at the next
 * 15-minute mark — because round cards are drafted at the very time the club
 * posts them. Nothing is placed past `horizonEnd` (the earlier of 14 days and
 * the card's expiry): the card then waits in the Unscheduled tray (R15).
 */

export const STEP_MINUTES = 15;
export const HORIZON_DAYS = 14;
export const GRACE_MINUTES = 60;

const MINUTE = 60_000;

export type PlacementInput = {
  kind: PostingKind;
  dailyCap: number;
  minGapMinutes: number;
  /** Planned times of every other card that still counts (all kinds). */
  taken: Date[];
  /** Planned times of the other cards of this card's slot kind. */
  sameKindTaken: Date[];
  now: Date;
  /** Nothing is placed after this (the earlier of 14 days and the card's expiry). */
  horizonEnd: Date;
  graceMinutes?: number;
  timeZone?: string;
};

/** The next 15-minute mark at or after `t`. */
export function ceilToStep(t: Date): Date {
  const step = STEP_MINUTES * MINUTE;
  return new Date(Math.ceil(t.getTime() / step) * step);
}

/** Every slot occurrence of `kind` from `from` to `to`, in time order. */
export function slotOccurrences(
  kind: PostingKind,
  from: Date,
  to: Date,
  timeZone: string = CLUB_TIME_ZONE,
): Date[] {
  const out: Date[] = [];
  if (kind.slots.length === 0) return out;
  // Start a day early so a slot just before `from` in club time is seen.
  let key = addDaysToKey(clubDate(from, timeZone).key, -1);
  const lastKey = addDaysToKey(clubDate(to, timeZone).key, 1);
  while (key <= lastKey) {
    const weekday = weekdayOfKey(key);
    for (const s of kind.slots) {
      if (s.day !== weekday) continue;
      const at = slotInstant(key, s.time, timeZone);
      if (at.getTime() >= from.getTime() && at.getTime() <= to.getTime()) out.push(at);
    }
    key = addDaysToKey(key, 1);
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

/** Planned posts on the club-local day of `at`. */
export function dayCount(at: Date, taken: Date[], timeZone: string = CLUB_TIME_ZONE): number {
  const key = clubDate(at, timeZone).key;
  return taken.filter((t) => clubDate(t, timeZone).key === key).length;
}

/** Whether `at` keeps at least `gapMinutes` from every planned post. */
export function gapOk(at: Date, taken: Date[], gapMinutes: number): boolean {
  const gap = gapMinutes * MINUTE;
  return taken.every((t) =>
    gap === 0 ? true : Math.abs(t.getTime() - at.getTime()) >= gap,
  );
}

export function placeCard(input: PlacementInput): Date | null {
  const tz = input.timeZone ?? CLUB_TIME_ZONE;
  const grace = (input.graceMinutes ?? GRACE_MINUTES) * MINUTE;
  const from = new Date(input.now.getTime() - grace);
  if (input.horizonEnd.getTime() < input.now.getTime()) return null;
  // One week past the horizon, so the last slot's window end is known.
  const occurrences = slotOccurrences(
    input.kind,
    from,
    new Date(input.horizonEnd.getTime() + 7 * 24 * 60 * MINUTE),
    tz,
  );
  const earliest = ceilToStep(input.now);

  for (let i = 0; i < occurrences.length; i++) {
    const slot = occurrences[i];
    if (slot.getTime() > input.horizonEnd.getTime()) break;
    const next = occurrences[i + 1];
    const midnight = clubDayStart(addDaysToKey(clubDate(slot, tz).key, 1), tz);
    const windowEnd = Math.min(next ? next.getTime() : Infinity, midnight.getTime());

    if (input.kind.collision === "roll") {
      const occupied = input.sameKindTaken.some(
        (t) => t.getTime() >= slot.getTime() && t.getTime() < windowEnd,
      );
      if (occupied) continue;
    }

    let at = slot.getTime() < earliest.getTime() ? earliest : slot;
    while (
      at.getTime() < windowEnd &&
      at.getTime() <= input.horizonEnd.getTime()
    ) {
      if (
        dayCount(at, input.taken, tz) < input.dailyCap &&
        gapOk(at, input.taken, input.minGapMinutes)
      ) {
        return at;
      }
      // A full day can't take any time on it: try the next slot.
      if (dayCount(at, input.taken, tz) >= input.dailyCap) break;
      at = new Date(at.getTime() + STEP_MINUTES * MINUTE);
    }
  }
  return null;
}
