import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import {
  db,
  availabilityAwayTable,
  availabilityRequestsTable,
  availabilityResponsesTable,
  availabilityRoundsTable,
  availabilitySettingsTable,
  fixturesTable,
  squadMembersTable,
  teamListsTable,
  type AvailabilityRequestRow,
  type AvailabilityRoundRow,
  type AvailabilitySettingsRow,
  type RecipientSlot,
  type SquadMemberRow,
  type SquadSection,
} from "@workspace/db";
import {
  addDays,
  fixtureSection,
  memberGrades,
  perthDate,
  perthDayStart,
  perthDow,
  roundWindow,
  type MemberIdentity,
} from "./availability-grades";
import {
  messageMember,
  notifyStaff,
  recipientsFor,
  type MessageBatch,
  type MessageKind,
} from "./availability-messaging";
import { buildRoundDrafts } from "./selection-drafts";
import { logger as defaultLogger } from "./logger";

/**
 * The weekly availability round.
 *
 * Each club sets a send, reminder, cut-off and finalise-by day and time in
 * Perth. A round belongs to a weekend (its Saturday): the first Saturday on or
 * after the send day of the current send week. `dueSteps` is the pure calendar
 * — a step is due when its slot has passed and it hasn't been claimed — and
 * mirrors `duePlans` in `lib/db/src/playhq-ingest/cadence.ts`: a missed hour
 * heals on the next tick and a slot never runs twice.
 *
 * `runAvailabilitySchedule` runs inside the hourly scheduled sweep. A step is
 * claimed atomically before any message goes out (a conditional update that
 * sets its `*_started_at` only while NULL), so an overlapping "Run now" or a
 * second worker never runs it twice. A step that throws releases its claim,
 * and a claim left unfinished for {@link STALE_CLAIM_MS} (a process that died
 * mid-step) can be claimed again; both resume safely, because the send skips
 * recipients it already reached, the reminder skips recipients messaged since
 * its slot and the cut-off only creates missing sides. Every tick before
 * cut-off also re-attempts, up to {@link MAX_DELIVERY_RETRIES} times,
 * recipients whose last delivery failed and who haven't answered; once
 * delivered they are left alone. Clubs with the switch off are skipped
 * entirely: no round, no messages.
 *
 * Logs carry tenant, round and member ids and counts only — never a contact.
 */

type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

export type ScheduleStep = "send" | "reminder" | "cutoff";

/** The schedule fields of `availability_settings` (days 0–6 = Sunday–Saturday, times "HH:MM"). */
export type ScheduleSettings = Pick<
  AvailabilitySettingsRow,
  | "sendDow"
  | "sendTime"
  | "reminderDow"
  | "reminderTime"
  | "cutoffDow"
  | "cutoffTime"
  | "finaliseDow"
  | "finaliseTime"
>;

/** The schema defaults: Mon 18:00 send, Wed 18:00 reminder, Thu 18:00 cut-off, Fri 20:00 finalise-by. */
export const DEFAULT_SCHEDULE: ScheduleSettings = {
  sendDow: 1,
  sendTime: "18:00",
  reminderDow: 3,
  reminderTime: "18:00",
  cutoffDow: 4,
  cutoffTime: "18:00",
  finaliseDow: 5,
  finaliseTime: "20:00",
};

/** A round's step claims, as `dueSteps` reads them; null = no round yet. */
export type RoundProgress = Pick<
  AvailabilityRoundRow,
  | "sendStartedAt"
  | "sendCompletedAt"
  | "reminderStartedAt"
  | "reminderCompletedAt"
  | "cutoffStartedAt"
  | "cutoffCompletedAt"
>;

/**
 * A claim unfinished after this long belongs to a step that died (a restart
 * mid-send); the next tick or "Run now" may claim it again. Far above a send's
 * real length (a few minutes for a big club).
 */
export const STALE_CLAIM_MS = 30 * 60 * 1000;

/** Failed deliveries are re-attempted at most this many times per recipient. */
export const MAX_DELIVERY_RETRIES = 3;

/** True while a step's claim stands: finished, or started under 30 minutes ago. */
function claimHeld(started: Date | null, completed: Date | null, now: Date): boolean {
  if (started == null) return false;
  return completed != null || now.getTime() - started.getTime() < STALE_CLAIM_MS;
}

const SATURDAY = 6;
const MINUTE_MS = 60_000;
const DAY_MINUTES = 1440;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes after midnight of an "HH:MM" time; NaN when malformed. */
function timeMinutes(time: string): number {
  const m = TIME_RE.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.NaN;
}

/** Days from a day of week forward to Saturday (0 when it is Saturday). */
function daysToSaturday(dow: number): number {
  return (SATURDAY - dow + 7) % 7;
}

/** Minutes from the send day's midnight to a step's day and time, within the send week. */
function stepOffset(s: ScheduleSettings, dow: number, time: string): number {
  return ((dow - s.sendDow + 7) % 7) * DAY_MINUTES + timeMinutes(time);
}

/**
 * Why a schedule is invalid, or null when it is fine. The send is Monday to
 * Friday, and steps are ordered within the week that starts on the send day:
 * send < reminder < cut-off ≤ finalise-by, and cut-off no later than that
 * week's Saturday. A weekday send keeps a round current through its Sunday.
 */
export function validateSchedule(s: ScheduleSettings): string | null {
  const days: [string, number][] = [
    ["send", s.sendDow],
    ["reminder", s.reminderDow],
    ["cut-off", s.cutoffDow],
    ["finalise-by", s.finaliseDow],
  ];
  for (const [name, dow] of days) {
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      return `The ${name} day must be 0 (Sunday) to 6 (Saturday).`;
    }
  }
  // A Saturday send is never due (the weekend has begun), and a Sunday send
  // starts the next round on the round's own match Sunday.
  if (s.sendDow === 0 || s.sendDow === SATURDAY) {
    return "The send day must be before the weekend (Monday to Friday).";
  }
  const times: [string, string][] = [
    ["send", s.sendTime],
    ["reminder", s.reminderTime],
    ["cut-off", s.cutoffTime],
    ["finalise-by", s.finaliseTime],
  ];
  for (const [name, time] of times) {
    if (!TIME_RE.test(time)) return `The ${name} time must be HH:MM (24-hour).`;
  }
  const send = stepOffset(s, s.sendDow, s.sendTime);
  const reminder = stepOffset(s, s.reminderDow, s.reminderTime);
  const cutoff = stepOffset(s, s.cutoffDow, s.cutoffTime);
  const finalise = stepOffset(s, s.finaliseDow, s.finaliseTime);
  if (cutoff <= send) return "The cut-off must come after the send in the same week.";
  if (reminder <= send || reminder >= cutoff) {
    return "The reminder must fall after the send and before the cut-off.";
  }
  if (finalise < cutoff) return "The finalise-by time can't be before the cut-off.";
  if (cutoff >= (daysToSaturday(s.sendDow) + 1) * DAY_MINUTES) {
    return "The cut-off must be no later than the Saturday of the round's weekend.";
  }
  return null;
}

/** The weekend (its Saturday, `YYYY-MM-DD`) of the send week containing `now`. */
export function roundWeekendFor(s: Pick<ScheduleSettings, "sendDow">, now: Date): string {
  const today = perthDate(now);
  const sendDate = addDays(today, -((perthDow(today) - s.sendDow + 7) % 7));
  return addDays(sendDate, daysToSaturday(s.sendDow));
}

/** Each step's instant for the round of `weekendDate`. */
export function roundSlots(
  s: ScheduleSettings,
  weekendDate: string,
): { send: Date; reminder: Date; cutoff: Date; finalise: Date } {
  const weekStart = perthDayStart(addDays(weekendDate, -daysToSaturday(s.sendDow))).getTime();
  const at = (dow: number, time: string) =>
    new Date(weekStart + stepOffset(s, dow, time) * MINUTE_MS);
  return {
    send: at(s.sendDow, s.sendTime),
    reminder: at(s.reminderDow, s.reminderTime),
    cutoff: at(s.cutoffDow, s.cutoffTime),
    finalise: at(s.finaliseDow, s.finaliseTime),
  };
}

/**
 * The steps due at `now` for the current round, in run order (pure). A step is
 * due when its slot has passed and its claim doesn't stand (never claimed, or
 * abandoned unfinished for {@link STALE_CLAIM_MS}), and:
 * - send: not once the weekend has begun (too late to ask);
 * - reminder: only when the send went out before the reminder slot, and not
 *   once the cut-off is due (a club enabled late gets send then cut-off);
 * - cut-off: only for a round that was (or is now being) asked, and not after
 *   the weekend is over.
 */
export function dueSteps(
  s: ScheduleSettings,
  now: Date,
  round: RoundProgress | null,
): ScheduleStep[] {
  const weekend = roundWeekendFor(s, now);
  const slots = roundSlots(s, weekend);
  const t = now.getTime();
  if (t >= roundWindow(weekend).to.getTime()) return [];

  const out: ScheduleStep[] = [];
  const sendStarted = round?.sendStartedAt ?? null;
  const held = (step: ScheduleStep) =>
    claimHeld(round?.[STARTED_KEY[step]] ?? null, round?.[COMPLETED[step]] ?? null, now);
  const sendDue =
    !held("send") && slots.send.getTime() <= t && t < perthDayStart(weekend).getTime();
  if (sendDue) out.push("send");
  if (
    sendStarted != null &&
    sendStarted.getTime() < slots.reminder.getTime() &&
    !held("reminder") &&
    round?.cutoffStartedAt == null &&
    slots.reminder.getTime() <= t &&
    t < slots.cutoff.getTime()
  ) {
    out.push("reminder");
  }
  if ((sendStarted != null || sendDue) && !held("cutoff")) {
    if (slots.cutoff.getTime() <= t) out.push("cutoff");
  }
  return out;
}

/**
 * True when a recipient's last message reached nobody and is worth trying
 * again: no channel was delivered and one failed, or the message never
 * finished (both results unset). "off", "no_contact", "opted_out" and
 * "invalid_number" can't be fixed by retrying.
 */
export function deliveryFailed(
  r: Pick<AvailabilityRequestRow, "smsResult" | "emailResult">,
): boolean {
  const results = [r.smsResult, r.emailResult];
  if (results.includes("sent")) return false;
  if (r.smsResult == null && r.emailResult == null) return true;
  return results.includes("failed");
}

/** A fixture as the date rules read it. */
export type WindowFixture = { grade: string; startAt: Date };

/**
 * The Perth dates a member is asked about (pure): each date in the
 * round on which their grade has a fixture; with no known grade, or a grade
 * without a fixture that weekend, every date with a fixture in their section.
 */
export function datesForGrade(
  grade: string | null,
  section: SquadSection,
  fixtures: readonly WindowFixture[],
): string[] {
  const dates = (list: readonly WindowFixture[]) =>
    [...new Set(list.map((f) => perthDate(f.startAt)))].sort();
  const own = grade ? dates(fixtures.filter((f) => f.grade === grade)) : [];
  if (own.length > 0) return own;
  return dates(fixtures.filter((f) => fixtureSection(f.grade) === section));
}

type DatedMember = MemberIdentity & Pick<SquadMemberRow, "section">;

/**
 * The dates each member is asked about in the round of `weekendDate`:
 * the club's fixtures in the round's window, and each member's grade from the
 * team lists before it (else their grade hint).
 */
export async function loadRoundDates(
  tenantId: number,
  weekendDate: string,
  members: readonly DatedMember[],
): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (members.length === 0) return out;
  const window = roundWindow(weekendDate);
  const fixtures = await db
    .select({ grade: fixturesTable.grade, startAt: fixturesTable.startAt })
    .from(fixturesTable)
    .where(
      and(
        eq(fixturesTable.tenantId, tenantId),
        gte(fixturesTable.startAt, window.from),
        lt(fixturesTable.startAt, window.to),
      ),
    );
  if (fixtures.length === 0) {
    for (const m of members) out.set(m.id, []);
    return out;
  }
  const [grades, lists] = await Promise.all([
    db
      .selectDistinct({ grade: fixturesTable.grade })
      .from(fixturesTable)
      .where(eq(fixturesTable.tenantId, tenantId)),
    db
      .select({
        grade: fixturesTable.grade,
        startAt: fixturesTable.startAt,
        players: teamListsTable.players,
      })
      .from(teamListsTable)
      .innerJoin(
        fixturesTable,
        and(
          eq(fixturesTable.id, teamListsTable.fixtureId),
          eq(fixturesTable.tenantId, teamListsTable.tenantId),
        ),
      )
      .where(
        and(
          eq(teamListsTable.tenantId, tenantId),
          lt(fixturesTable.startAt, window.from),
          sql`jsonb_array_length(${teamListsTable.players}) > 0`,
        ),
      ),
  ]);
  const byMember = memberGrades(
    members,
    lists,
    grades.map((g) => g.grade),
  );
  for (const m of members) {
    out.set(m.id, datesForGrade(byMember.get(m.id) ?? null, m.section, fixtures));
  }
  return out;
}

/** The dates one member is asked about in a round, for the player page. */
export async function datesForMember(
  tenantId: number,
  round: Pick<AvailabilityRoundRow, "weekendDate">,
  member: DatedMember,
): Promise<string[]> {
  return (await loadRoundDates(tenantId, round.weekendDate, [member])).get(member.id) ?? [];
}

// --- DB-backed steps ---

/** Pause between members while sending, below provider rate limits. */
let sendPaceMs = 250;

/** Test seam: the pause between members (0 in tests). */
export function setSendPaceMs(ms: number): void {
  sendPaceMs = ms;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Manual reminders go at most once per recipient per 12 hours. */
export const MANUAL_REMINDER_GAP_MS = 12 * 60 * 60 * 1000;

export type StepOptions = {
  logger?: Logger;
  /** Admin "Run now": sends can repeat; reminders remain throttled and stamped. */
  manual?: boolean;
  /** Overrides the module's pace between members. */
  paceMs?: number;
  /** Reminder only: remind members of this section alone (the Selection Hub's switch). */
  section?: SquadSection;
  /**
   * Reminder only: skip recipients messaged at or after this instant (the
   * reminder slot), so a reminder resumed after a failure doesn't repeat.
   */
  remindedSince?: Date;
};

export type StepResult = {
  step: ScheduleStep;
  /** Members messaged (any recipient attempted). */
  messaged: number;
  /** Members recorded unavailable from an away period, not messaged. */
  away: number;
  /** Members with no fixture to be asked about this round. */
  noFixture: number;
  /** Members skipped by the 12-hour manual reminder throttle. */
  throttled: number;
  /** Draft sides created at cut-off. */
  drafts: number;
};

const COMPLETED = {
  send: "sendCompletedAt",
  reminder: "reminderCompletedAt",
  cutoff: "cutoffCompletedAt",
} as const;

const STARTED_KEY = {
  send: "sendStartedAt",
  reminder: "reminderStartedAt",
  cutoff: "cutoffStartedAt",
} as const;

/** The club's settings row, or null when it has never saved any. */
export async function loadAvailabilitySettings(
  tenantId: number,
): Promise<AvailabilitySettingsRow | null> {
  const [row] = await db
    .select()
    .from(availabilitySettingsTable)
    .where(eq(availabilitySettingsTable.tenantId, tenantId));
  return row ?? null;
}

/** The round for a weekend, created when missing (unique per tenant and weekend). */
export async function ensureRound(
  tenantId: number,
  weekendDate: string,
): Promise<AvailabilityRoundRow> {
  await db
    .insert(availabilityRoundsTable)
    .values({ tenantId, weekendDate })
    .onConflictDoNothing({
      target: [availabilityRoundsTable.tenantId, availabilityRoundsTable.weekendDate],
    });
  const round = await findRound(tenantId, weekendDate);
  if (!round) throw new Error("availability round missing after upsert");
  return round;
}

export async function findRound(
  tenantId: number,
  weekendDate: string,
): Promise<AvailabilityRoundRow | null> {
  const [row] = await db
    .select()
    .from(availabilityRoundsTable)
    .where(
      and(
        eq(availabilityRoundsTable.tenantId, tenantId),
        eq(availabilityRoundsTable.weekendDate, weekendDate),
      ),
    );
  return row ?? null;
}

/**
 * Claim a step for a round: set its `*_started_at` only while it is NULL, or
 * while it is a stale claim (unfinished and older than {@link STALE_CLAIM_MS}).
 * Manual sends may reclaim a completed send, but never an in-flight send.
 * True for exactly one caller, however many race.
 */
export async function claimStep(
  tenantId: number,
  roundId: number,
  step: ScheduleStep,
  now: Date,
  repeatCompletedSend = false,
): Promise<boolean> {
  const repeat = step === "send" && repeatCompletedSend;
  const rows = await db
    .update(availabilityRoundsTable)
    .set({
      [STARTED_KEY[step]]: now,
      ...(repeat ? { [COMPLETED[step]]: null } : {}),
    })
    .where(
      and(
        eq(availabilityRoundsTable.id, roundId),
        eq(availabilityRoundsTable.tenantId, tenantId),
        or(
          isNull(availabilityRoundsTable[STARTED_KEY[step]]),
          ...(repeat ? [isNotNull(availabilityRoundsTable[COMPLETED[step]])] : []),
          and(
            isNull(availabilityRoundsTable[COMPLETED[step]]),
            lt(
              availabilityRoundsTable[STARTED_KEY[step]],
              new Date(now.getTime() - STALE_CLAIM_MS),
            ),
          ),
        ),
      ),
    )
    .returning({ id: availabilityRoundsTable.id });
  return rows.length === 1;
}

/** Give back a claim taken at `claimedAt` whose step failed, so the next tick retries it. */
async function releaseStep(
  tenantId: number,
  roundId: number,
  step: ScheduleStep,
  claimedAt: Date,
): Promise<void> {
  await db
    .update(availabilityRoundsTable)
    .set({ [STARTED_KEY[step]]: null })
    .where(
      and(
        eq(availabilityRoundsTable.id, roundId),
        eq(availabilityRoundsTable.tenantId, tenantId),
        eq(availabilityRoundsTable[STARTED_KEY[step]], claimedAt),
        isNull(availabilityRoundsTable[COMPLETED[step]]),
      ),
    );
}

async function completeStep(
  tenantId: number,
  roundId: number,
  step: ScheduleStep,
  now: Date,
): Promise<void> {
  await db
    .update(availabilityRoundsTable)
    .set({ [COMPLETED[step]]: now })
    .where(
      and(eq(availabilityRoundsTable.id, roundId), eq(availabilityRoundsTable.tenantId, tenantId)),
    );
}

async function activeMembers(tenantId: number): Promise<SquadMemberRow[]> {
  return db
    .select()
    .from(squadMembersTable)
    .where(and(eq(squadMembersTable.tenantId, tenantId), eq(squadMembersTable.active, true)));
}

/** Members with any answer for the round. */
async function answeredMembers(tenantId: number, roundId: number): Promise<Set<number>> {
  const rows = await db
    .selectDistinct({ memberId: availabilityResponsesTable.memberId })
    .from(availabilityResponsesTable)
    .where(
      and(
        eq(availabilityResponsesTable.tenantId, tenantId),
        eq(availabilityResponsesTable.roundId, roundId),
      ),
    );
  return new Set(rows.map((r) => r.memberId));
}

const emptyResult = (step: ScheduleStep): StepResult => ({
  step,
  messaged: 0,
  away: 0,
  noFixture: 0,
  throttled: 0,
  drafts: 0,
});

/**
 * Send: every active member with a fixture to be asked about gets a
 * request through their recipients. A member whose away periods cover
 * every date they'd be asked about gets No recorded for those dates instead,
 * and no message. Paced between members. Resumable: a recipient that already
 * has a request row this round was attempted by an earlier run and is left to
 * the retry pass, so an automated re-run never sends twice. An explicit manual
 * run deliberately re-sends to every eligible recipient, including new contacts.
 */
async function runSend(
  tenantId: number,
  round: AvailabilityRoundRow,
  smsOn: boolean,
  now: Date,
  opts: StepOptions,
): Promise<StepResult> {
  const result = emptyResult("send");
  const pace = opts.paceMs ?? sendPaceMs;
  const members = await activeMembers(tenantId);
  const dates = await loadRoundDates(tenantId, round.weekendDate, members);
  const window = roundWindow(round.weekendDate);
  const away = await db
    .select({
      memberId: availabilityAwayTable.memberId,
      fromDate: availabilityAwayTable.fromDate,
      toDate: availabilityAwayTable.toDate,
    })
    .from(availabilityAwayTable)
    .where(
      and(
        eq(availabilityAwayTable.tenantId, tenantId),
        lte(availabilityAwayTable.fromDate, perthDate(new Date(window.to.getTime() - 1))),
        gte(availabilityAwayTable.toDate, perthDate(window.from)),
      ),
    );

  const awayOf = new Map<number, typeof away>();
  for (const a of away) awayOf.set(a.memberId, [...(awayOf.get(a.memberId) ?? []), a]);
  const attempted = new Map<number, Set<RecipientSlot>>();
  const earlier = await db
    .select({
      memberId: availabilityRequestsTable.memberId,
      slot: availabilityRequestsTable.recipientSlot,
    })
    .from(availabilityRequestsTable)
    .where(
      and(
        eq(availabilityRequestsTable.tenantId, tenantId),
        eq(availabilityRequestsTable.roundId, round.id),
      ),
    );
  for (const r of earlier) {
    attempted.set(r.memberId, (attempted.get(r.memberId) ?? new Set()).add(r.slot));
  }

  const batch: MessageBatch = {};
  let first = true;
  for (const m of members) {
    const asked = dates.get(m.id) ?? [];
    if (asked.length === 0) {
      result.noFixture++;
      continue;
    }
    const periods = awayOf.get(m.id) ?? [];
    const allAway = asked.every((d) => periods.some((a) => a.fromDate <= d && d <= a.toDate));
    if (allAway) {
      // An explicit answer (none yet, normally) is never overwritten.
      await db
        .insert(availabilityResponsesTable)
        .values(
          asked.map((date) => ({
            tenantId,
            roundId: round.id,
            memberId: m.id,
            date,
            status: "no" as const,
            respondedAt: now,
          })),
        )
        .onConflictDoNothing();
      result.away++;
      continue;
    }
    // Automated resumes deduplicate; manual runs deliberately send again.
    const done = opts.manual ? undefined : attempted.get(m.id);
    const slots = done
      ? recipientsFor(m, now)
          .map((r) => r.slot)
          .filter((slot) => !done.has(slot))
      : undefined;
    if (slots && slots.length === 0) continue;
    if (!first && pace > 0) await sleep(pace);
    first = false;
    const sent = await messageMember(
      {
        tenantId,
        member: m,
        kind: "request",
        context: { roundId: round.id },
        smsEnabled: smsOn,
        slots,
        now,
        batch,
      },
      opts.logger,
    );
    if (sent.results.length > 0) result.messaged++;
  }
  return result;
}

/**
 * Reminder: members asked this round who haven't answered for any
 * date. A recipient reminded by hand in the last 12 hours is skipped; a manual
 * run stamps each recipient's last manual reminder time.
 */
export async function runReminder(
  tenantId: number,
  round: AvailabilityRoundRow,
  smsOn: boolean,
  now: Date,
  opts: StepOptions,
): Promise<StepResult> {
  const result = emptyResult("reminder");
  const pace = opts.paceMs ?? sendPaceMs;
  const requests = await db
    .select()
    .from(availabilityRequestsTable)
    .where(
      and(
        eq(availabilityRequestsTable.tenantId, tenantId),
        eq(availabilityRequestsTable.roundId, round.id),
      ),
    );
  const answered = await answeredMembers(tenantId, round.id);
  const bySlot = new Map<number, Map<RecipientSlot, AvailabilityRequestRow>>();
  for (const r of requests) {
    if (answered.has(r.memberId)) continue;
    const slots = bySlot.get(r.memberId) ?? new Map<RecipientSlot, AvailabilityRequestRow>();
    slots.set(r.recipientSlot, r);
    bySlot.set(r.memberId, slots);
  }
  if (bySlot.size === 0) return result;
  const members = await db
    .select()
    .from(squadMembersTable)
    .where(
      and(
        eq(squadMembersTable.tenantId, tenantId),
        eq(squadMembersTable.active, true),
        inArray(squadMembersTable.id, [...bySlot.keys()]),
        ...(opts.section ? [eq(squadMembersTable.section, opts.section)] : []),
      ),
    );

  const since = now.getTime() - MANUAL_REMINDER_GAP_MS;
  const remindedSince = opts.remindedSince?.getTime() ?? null;
  const lastAttempt = (r: AvailabilityRequestRow | undefined) =>
    Math.max(r?.smsAt?.getTime() ?? 0, r?.emailAt?.getTime() ?? 0);
  const batch: MessageBatch = {};
  let first = true;
  for (const m of members) {
    const asked = bySlot.get(m.id)!;
    // Current recipients (contacts may have changed since the send), minus any
    // reminded by hand within the last 12 hours, and (resuming) any already
    // messaged since the reminder slot.
    const slots = recipientsFor(m, now)
      .map((r) => r.slot)
      .filter((slot) => {
        const last = asked.get(slot)?.lastManualReminderAt;
        if (last && last.getTime() > since) return false;
        return remindedSince == null || lastAttempt(asked.get(slot)) < remindedSince;
      });
    if (slots.length === 0) {
      result.throttled++;
      continue;
    }
    if (!first && pace > 0) await sleep(pace);
    first = false;
    const sent = await messageMember(
      {
        tenantId,
        member: m,
        kind: "reminder",
        context: { roundId: round.id },
        smsEnabled: smsOn,
        slots,
        now,
        batch,
      },
      opts.logger,
    );
    if (sent.results.length > 0) result.messaged++;
    const ids = sent.results.map((r) => r.requestId).filter((id): id is number => id != null);
    if (opts.manual && ids.length > 0) {
      await db
        .update(availabilityRequestsTable)
        .set({ lastManualReminderAt: now })
        .where(
          and(
            eq(availabilityRequestsTable.tenantId, tenantId),
            inArray(availabilityRequestsTable.id, ids),
          ),
        );
    }
  }
  return result;
}

/** Cut-off: build the draft sides, then tell captains and admins. */
async function runCutoff(
  tenantId: number,
  round: AvailabilityRoundRow,
  now: Date,
  opts: StepOptions,
): Promise<StepResult> {
  const result = emptyResult("cutoff");
  const drafts = await buildRoundDrafts(tenantId, round.id, now);
  result.drafts = drafts.created;
  if (drafts.created > 0) {
    const sides = drafts.created === 1 ? "1 draft side is" : `${drafts.created} draft sides are`;
    await notifyStaff(
      {
        tenantId,
        kind: "selection_drafts_ready",
        title: "Draft sides are ready",
        body: `Availability has closed for the weekend of ${round.weekendDate}. ${sides} ready to pick in the Selection Hub.`,
        link: "/admin/selection",
        payload: {
          roundId: round.id,
          weekendDate: round.weekendDate,
          selectionIds: drafts.selectionIds,
        },
      },
      opts.logger,
    );
  }
  return result;
}

/**
 * Run one step for a round: claim it (false → someone else has, nothing runs),
 * do the work, then stamp completion. If the work throws, the claim is given
 * back and the error rethrown, so the next tick runs the step again (each step
 * is safe to resume). Shared by the scheduler and "Run now".
 */
export async function runStep(
  tenantId: number,
  round: AvailabilityRoundRow,
  step: ScheduleStep,
  settings: Pick<AvailabilitySettingsRow, "smsEnabled">,
  now: Date,
  opts: StepOptions = {},
): Promise<StepResult | null> {
  if (!(await claimStep(tenantId, round.id, step, now, step === "send" && opts.manual === true))) {
    return null;
  }
  let result: StepResult;
  try {
    if (step === "send") result = await runSend(tenantId, round, settings.smsEnabled, now, opts);
    else if (step === "reminder") {
      result = await runReminder(tenantId, round, settings.smsEnabled, now, opts);
    } else result = await runCutoff(tenantId, round, now, opts);
  } catch (err) {
    // If the release fails too, the claim goes stale and is re-claimed later.
    await releaseStep(tenantId, round.id, step, now).catch(() => {});
    throw err;
  }
  await completeStep(tenantId, round.id, step, now);
  return result;
}

/**
 * Re-attempt recipients whose last delivery failed and whose member hasn't
 * answered. Runs every tick between send and cut-off, at most
 * {@link MAX_DELIVERY_RETRIES} times per recipient (a bounced address isn't
 * hammered all week); a recipient delivered on any channel is never retried.
 * Retries the step's own message: a request, or a reminder once the reminder
 * has gone.
 */
export async function retryFailedDeliveries(
  tenantId: number,
  round: AvailabilityRoundRow,
  smsOn: boolean,
  now: Date,
  opts: StepOptions = {},
): Promise<number> {
  // Only once the send has finished, so a send still running elsewhere (whose
  // recipients have no result yet) is never doubled.
  if (round.sendCompletedAt == null || round.cutoffStartedAt != null) return 0;
  const { smsResult: sms, emailResult: email } = availabilityRequestsTable;
  const failed = await db
    .select()
    .from(availabilityRequestsTable)
    .where(
      and(
        eq(availabilityRequestsTable.tenantId, tenantId),
        eq(availabilityRequestsTable.roundId, round.id),
        // `deliveryFailed` in SQL: nothing sent, and both unset or one failed.
        sql`coalesce(${sms}, '') <> 'sent' and coalesce(${email}, '') <> 'sent'`,
        sql`((${sms} is null and ${email} is null) or ${sms} = 'failed' or ${email} = 'failed')`,
        lt(availabilityRequestsTable.retryCount, MAX_DELIVERY_RETRIES),
      ),
    );
  if (failed.length === 0) return 0;
  const answered = await answeredMembers(tenantId, round.id);
  const bySlot = new Map<number, RecipientSlot[]>();
  const retrying: number[] = [];
  for (const r of failed) {
    if (answered.has(r.memberId)) continue;
    bySlot.set(r.memberId, [...(bySlot.get(r.memberId) ?? []), r.recipientSlot]);
    retrying.push(r.id);
  }
  if (bySlot.size === 0) return 0;
  const members = await db
    .select()
    .from(squadMembersTable)
    .where(
      and(
        eq(squadMembersTable.tenantId, tenantId),
        eq(squadMembersTable.active, true),
        inArray(squadMembersTable.id, [...bySlot.keys()]),
      ),
    );
  // Counted before sending, so an attempt that dies midway still counts.
  await db
    .update(availabilityRequestsTable)
    .set({ retryCount: sql`${availabilityRequestsTable.retryCount} + 1` })
    .where(
      and(
        eq(availabilityRequestsTable.tenantId, tenantId),
        inArray(availabilityRequestsTable.id, retrying),
      ),
    );
  const kind: MessageKind = round.reminderStartedAt != null ? "reminder" : "request";
  const pace = opts.paceMs ?? sendPaceMs;
  const batch: MessageBatch = {};
  let retried = 0;
  for (const m of members) {
    if (retried > 0 && pace > 0) await sleep(pace);
    await messageMember(
      {
        tenantId,
        member: m,
        kind,
        context: { roundId: round.id },
        smsEnabled: smsOn,
        slots: bySlot.get(m.id),
        now,
        batch,
      },
      opts.logger,
    );
    retried++;
  }
  return retried;
}

export type ScheduleSummary = {
  enabled: boolean;
  weekendDate: string | null;
  roundId: number | null;
  /** Steps this tick ran (claimed and finished). */
  ran: ScheduleStep[];
  /** Members whose failed delivery was re-attempted. */
  retried: number;
  results: StepResult[];
};

/**
 * One scheduler tick for a club: skip unless enabled; retry
 * failed deliveries; then claim and run each due step in order. Each step is
 * isolated, so one failing never blocks the next.
 */
export async function runAvailabilitySchedule(
  tenantId: number,
  now: Date = new Date(),
  opts: StepOptions = {},
): Promise<ScheduleSummary> {
  const logger = opts.logger ?? defaultLogger;
  const summary: ScheduleSummary = {
    enabled: false,
    weekendDate: null,
    roundId: null,
    ran: [],
    retried: 0,
    results: [],
  };
  const settings = await loadAvailabilitySettings(tenantId);
  if (!settings?.enabled) return summary;
  summary.enabled = true;
  const weekendDate = roundWeekendFor(settings, now);
  summary.weekendDate = weekendDate;

  let round = await findRound(tenantId, weekendDate);
  if (round) {
    summary.roundId = round.id;
    try {
      summary.retried = await retryFailedDeliveries(tenantId, round, settings.smsEnabled, now, {
        ...opts,
        logger,
      });
    } catch (err) {
      logger.error({ err, tenantId, roundId: round.id }, "availability retry failed");
    }
  }

  const steps = dueSteps(settings, now, round);
  if (steps.length === 0) return summary;
  round ??= await ensureRound(tenantId, weekendDate);
  summary.roundId = round.id;
  const remindedSince = roundSlots(settings, weekendDate).reminder;
  for (const step of steps) {
    try {
      const result = await runStep(tenantId, round, step, settings, now, {
        ...opts,
        logger,
        remindedSince,
      });
      if (!result) continue;
      summary.ran.push(step);
      summary.results.push(result);
      logger.info({ tenantId, roundId: round.id, ...result }, "availability step ran");
      // Later steps see this one's claim (cut-off after a send in the same tick).
      round = (await findRound(tenantId, weekendDate)) ?? round;
    } catch (err) {
      logger.error({ err, tenantId, roundId: round.id, step }, "availability step failed");
    }
  }
  return summary;
}

export type RoundCounts = {
  yes: number;
  maybe: number;
  no: number;
  none: number;
  /** Members with an answer given after the cut-off. */
  late: number;
  total: number;
};

/**
 * Response breakdown for a round, one status per member asked: Yes when
 * they said Yes for any date, else Maybe, else No; None when they haven't
 * answered. Members asked = those with a request plus those recorded away.
 */
export async function roundCounts(
  tenantId: number,
  roundId: number,
  /** Narrows the count to these members (one section of the Selection Hub). */
  onlyMembers?: ReadonlySet<number>,
): Promise<RoundCounts> {
  const counts: RoundCounts = { yes: 0, maybe: 0, no: 0, none: 0, late: 0, total: 0 };
  const asked = await db
    .selectDistinct({ memberId: availabilityRequestsTable.memberId })
    .from(availabilityRequestsTable)
    .where(
      and(
        eq(availabilityRequestsTable.tenantId, tenantId),
        eq(availabilityRequestsTable.roundId, roundId),
      ),
    );
  const responses = await db
    .select({
      memberId: availabilityResponsesTable.memberId,
      status: availabilityResponsesTable.status,
      late: availabilityResponsesTable.late,
    })
    .from(availabilityResponsesTable)
    .where(
      and(
        eq(availabilityResponsesTable.tenantId, tenantId),
        eq(availabilityResponsesTable.roundId, roundId),
      ),
    );
  const statuses = new Map<number, Set<string>>();
  const late = new Set<number>();
  const counted = (id: number) => !onlyMembers || onlyMembers.has(id);
  for (const a of asked) if (counted(a.memberId)) statuses.set(a.memberId, new Set());
  for (const r of responses) {
    if (!counted(r.memberId)) continue;
    const set = statuses.get(r.memberId) ?? new Set<string>();
    set.add(r.status);
    statuses.set(r.memberId, set);
    if (r.late) late.add(r.memberId);
  }
  counts.late = late.size;
  for (const set of statuses.values()) {
    counts.total++;
    if (set.has("yes")) counts.yes++;
    else if (set.has("maybe")) counts.maybe++;
    else if (set.has("no")) counts.no++;
    else counts.none++;
  }
  return counts;
}
