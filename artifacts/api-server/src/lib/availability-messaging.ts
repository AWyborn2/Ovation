import type { Request } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  notificationsTable,
  socialSettingsTable,
  squadMembersTable,
  availabilityRequestsTable,
  availabilityRoundsTable,
  type NotificationRow,
  type RecipientSlot,
  type SquadMemberRow,
  type TeamListRole,
} from "@workspace/db";
import { sendEmail } from "./integrations/email";
import {
  sendSms,
  smsEnabled,
  smsRepliesReachUs,
  normaliseAuMobile,
  redactContact,
  isGsm7,
  gsm7Length,
} from "./integrations/sms";
import { getTenantBrand, type TenantBrand } from "./tenant-brand";
import {
  availabilityLink,
  defaultTokenExpiry,
  loadTenantForLinks,
  mintRequestToken,
} from "./availability-tokens";
import { isUnder18OnDate, memberFirstName, perthDate } from "./availability-grades";
import { CLUB_TIME_ZONE } from "./round-schedules";
import { logger as defaultLogger } from "./logger";

/**
 * Member and staff messaging for the availability round and the Selection Hub.
 *
 * A member is reached through the right contacts: the account holder for
 * adults, Parent/Guardian 1 and 2 for members under 18 on the day of sending.
 * Each recipient gets an SMS (when the club has SMS on and that contact
 * hasn't opted out) plus an email. With Twilio a STOP reply opts out; with
 * ClickSend's own-number sender replies go to the club's phone, so the SMS
 * points at the personal link instead, whose page can stop texts. Every message that carries a link
 * mints a fresh token for its recipient and records the last delivery
 * result per channel on the recipient's `availability_requests` row, which the
 * scheduler reads to re-attempt only failed recipients.
 *
 * Best-effort throughout: transport failures are reported in the returned
 * results and logged, never thrown, so messaging never blocks the state change
 * that triggered it. Logs carry tenant id, member id, recipient slot, channel
 * and result kind only — never a number, an address or a token.
 */

type Logger = { warn: (obj: unknown, msg?: string) => void };

export type MessageKind = "request" | "reminder" | "selected" | "deselected" | "contact_changed";

/** Short result kinds, also stored on `availability_requests` (never a contact value). */
export type DeliveryResult =
  "sent" | "failed" | "opted_out" | "no_contact" | "invalid_number" | "off";

export type Recipient = {
  slot: RecipientSlot;
  name: string | null;
  mobile: string | null;
  email: string | null;
  smsOptOut: boolean;
};

export type RecipientResult = {
  slot: RecipientSlot;
  requestId: number | null;
  sms: DeliveryResult;
  email: DeliveryResult;
};

export type MessageMemberResult = {
  results: RecipientResult[];
  /** Slots that should have been messaged but have neither a mobile nor an email. */
  skipped: RecipientSlot[];
};

export type MessageFixture = {
  grade: string;
  opponentName: string;
  startAt: Date;
  venue?: string | null;
};

export type MessageContext = {
  /** The round the message belongs to; required for every kind with a link. */
  roundId?: number;
  /** Token expiry; defaults to the end of the day after the round's weekend. */
  expiresAt?: Date;
  /** The match, for `selected` and `deselected`. */
  fixture?: MessageFixture;
  /** The member's role in the side, for `selected`. */
  role?: TeamListRole | null;
  /** For `selected`: picked as the side's 12th player (slot 12), who holds no role. */
  twelfth?: boolean;
  /** For `contact_changed`: the slot that changed and its PREVIOUS contact. */
  previous?: { slot: RecipientSlot; mobile: string | null; email: string | null };
  /** The current request, when there is one, so links use its host. */
  req?: Request;
};

const LINKED_KINDS: ReadonlySet<MessageKind> = new Set([
  "request",
  "reminder",
  "selected",
  "deselected",
]);

const STOP_LINE = "Reply STOP to opt out.";
/** When replies don't reach us (ClickSend own number): the link's page stops texts. */
const LINK_STOP_LINE = "Stop texts at the link.";
const SMS_LIMIT = 160;

/**
 * True when a member born on `dateOfBirth` (YYYY-MM-DD) is under 18 on Perth's
 * date at `now`. A missing or malformed date of birth counts as an adult.
 */
export function isUnder18(dateOfBirth: string | null | undefined, now: Date): boolean {
  return isUnder18OnDate(dateOfBirth, perthDate(now)) ?? false;
}

function slotContact(member: SquadMemberRow, slot: RecipientSlot): Recipient {
  switch (slot) {
    case "account":
      return {
        slot,
        name: member.accountHolderName,
        mobile: member.accountHolderMobile,
        email: member.accountHolderEmail,
        smsOptOut: member.accountSmsOptOut,
      };
    case "guardian1":
      return {
        slot,
        name: member.guardian1Name,
        mobile: member.guardian1Mobile,
        email: member.guardian1Email,
        smsOptOut: member.guardian1SmsOptOut,
      };
    case "guardian2":
      return {
        slot,
        name: member.guardian2Name,
        mobile: member.guardian2Mobile,
        email: member.guardian2Email,
        smsOptOut: member.guardian2SmsOptOut,
      };
  }
}

/** The slots a member should be reached through at `now`, contacts or not. */
export function intendedSlotsFor(member: SquadMemberRow, now: Date): RecipientSlot[] {
  return isUnder18(member.dateOfBirth, now) ? ["guardian1", "guardian2"] : ["account"];
}

const hasValue = (v: string | null | undefined) => !!v && v.trim() !== "";

/**
 * Who to message for a member: the account holder for adults, both
 * guardians for under-18s. Slots with neither a mobile nor an email are left
 * out (see {@link intendedSlotsFor} to count them).
 */
export function recipientsFor(member: SquadMemberRow, now: Date): Recipient[] {
  return intendedSlotsFor(member, now)
    .map((slot) => slotContact(member, slot))
    .filter((r) => hasValue(r.mobile) || hasValue(r.email));
}

const OPT_OUT_COLUMN = {
  account: "accountSmsOptOut",
  guardian1: "guardian1SmsOptOut",
  guardian2: "guardian2SmsOptOut",
} as const satisfies Record<RecipientSlot, keyof SquadMemberRow>;

/** "Sat 11 Oct 1:30pm" in Perth time, GSM-safe (no narrow no-break spaces). */
export function formatMatchTime(startAt: Date): string {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: CLUB_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(startAt);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")} ${get("hour")}:${get("minute")}${get("dayPeriod").toLowerCase()}`;
}

/** "Sat 11 Oct" in Perth time. */
function formatMatchDay(startAt: Date): string {
  return formatMatchTime(startAt).split(" ").slice(0, 3).join(" ");
}

/**
 * The first candidate that fits one GSM-7 segment, else the last (shortest)
 * one. Used for the weekly request and reminder, which go to every member.
 */
function fitSms(candidates: string[]): string {
  for (const c of candidates) {
    if (isGsm7(c) && gsm7Length(c) <= SMS_LIMIT) return c;
  }
  return candidates[candidates.length - 1];
}

const ROLE_TEXT: Record<TeamListRole, string> = {
  C: "captain",
  VC: "vice-captain",
  WK: "keeper",
  "C/WK": "captain and keeper",
  "VC/WK": "vice-captain and keeper",
};

type TextInput = {
  kind: MessageKind;
  /** Short club name for SMS (e.g. "HHCC"), full name for email. */
  clubShort: string;
  clubName: string;
  /** The player's first (or preferred) name. */
  player: string;
  /** True when writing to the player themself rather than a guardian. */
  self: boolean;
  greetingName: string | null;
  link: string | null;
  context: MessageContext;
  /**
   * How the SMS offers an opt-out: "reply" (STOP, the default) when replies
   * reach the provider, "link" when they don't ({@link smsRepliesReachUs}).
   */
  optOut?: "reply" | "link";
};

/** Build the SMS and email for one recipient. Exported for tests. */
export function buildMessage(input: TextInput): {
  sms: string;
  email: { subject: string; text: string };
} {
  const { kind, clubShort, clubName, player, self, link, context } = input;
  const byLink = input.optOut === "link";
  const stopLine = byLink ? LINK_STOP_LINE : STOP_LINE;
  const hi = `Hi ${input.greetingName?.trim() || "there"},`;
  const who = self ? "you" : player;
  const fixture = context.fixture;

  switch (kind) {
    case "request":
    case "reminder": {
      const tag = kind === "reminder" ? `${clubShort} reminder` : clubShort;
      const ask = self ? "Are you available" : `Is ${player} available`;
      const sms = fitSms([
        `${tag}: ${ask} to play this weekend? Tap to answer: ${link} ${stopLine}`,
        `${tag}: ${ask} this weekend? ${link} ${stopLine}`,
        `${clubShort}: Available this weekend? ${link} ${stopLine}`,
        `Available this weekend? ${link} ${stopLine}`,
      ]);
      const subject =
        kind === "reminder"
          ? `Reminder: ${self ? "your" : `${player}'s`} availability this weekend`
          : `${clubName}: ${self ? "are you" : `is ${player}`} available this weekend?`;
      const text = [
        hi,
        "",
        kind === "reminder"
          ? `We haven't had an answer yet. ${ask} to play this weekend?`
          : `${ask} to play this weekend?`,
        "Answer Yes, No or Maybe for each day here — no login needed:",
        "",
        `${link}`,
        "",
        `You can change ${self ? "your" : "the"} answer until the team is picked, and mark any dates ${who === "you" ? "you'll" : `${player} will`} be away.`,
        "",
        clubName,
      ].join("\n");
      return { sms, email: { subject, text } };
    }
    case "selected": {
      const match = fixture
        ? `${fixture.grade} v ${fixture.opponentName}, ${formatMatchTime(fixture.startAt)}`
        : "this weekend";
      const venue = fixture?.venue?.trim() ? ` at ${fixture.venue.trim()}` : "";
      const role = context.twelfth ? "" : context.role ? ` (${ROLE_TEXT[context.role]})` : "";
      const as12th = context.twelfth ? " as 12th player" : "";
      const lead = self ? `You're selected${as12th}` : `${player} is selected${as12th}`;
      // Match details matter more than one segment here: no fitting.
      const sms = `${clubShort}: ${lead}${role} for ${match}${venue}. Can't make it? ${link} ${stopLine}`;
      const text = [
        hi,
        "",
        `${lead}${role} for ${match}${venue}.`,
        "",
        `If ${self ? "you" : player} can't make it, let the club know here:`,
        "",
        `${link}`,
        "",
        clubName,
      ].join("\n");
      return {
        sms,
        email: { subject: `${clubName}: ${lead} for ${fixture?.grade ?? "this weekend"}`, text },
      };
    }
    case "deselected": {
      const grade = fixture?.grade ?? "the";
      const day = fixture ? ` on ${formatMatchDay(fixture.startAt)}` : " this weekend";
      const lead = self ? "You're" : `${player} is`;
      const sms = `${clubShort}: ${lead} no longer in the ${grade} side${day}. Details: ${link} ${stopLine}`;
      const text = [
        hi,
        "",
        `The ${grade} side${day} has changed and ${self ? "you're" : `${player} is`} no longer in it.`,
        "",
        "Availability and team details are here:",
        "",
        `${link}`,
        "",
        clubName,
      ].join("\n");
      return { sms, email: { subject: `${clubName}: team change for ${grade}`, text } };
    }
    case "contact_changed": {
      // No link here, and this old contact is off the list now: with link
      // opt-outs there is nothing to point at, so the line is left off.
      const stop = byLink ? "" : ` ${STOP_LINE}`;
      const sms = fitSms([
        `${clubShort}: The contact details for ${player} were just changed from their availability link. Not you? Contact the club.${stop}`,
        `${clubShort}: Contact details for ${player} were changed. Not you? Contact the club.${stop}`,
        `${clubShort}: Contact details were changed. Not you? Contact the club.${stop}`,
      ]);
      const text = [
        hi,
        "",
        `The mobile or email for ${player} was changed using their personal availability link, so club messages now go to the new details.`,
        "",
        `If you didn't make this change, please contact ${clubName}.`,
        "",
        clubName,
      ].join("\n");
      return { sms, email: { subject: `${clubName}: contact details changed`, text } };
    }
  }
}

/**
 * Lookups shared by one loop's `messageMember` calls (one tenant, one round),
 * filled by the first call that needs each: the round's weekend, the tenant's
 * link host and the brand. Start each loop with a fresh `{}`.
 */
export type MessageBatch = {
  round?: { weekendDate: string };
  tenantForLinks?: Awaited<ReturnType<typeof loadTenantForLinks>>;
  brand?: TenantBrand;
};

/** Find or create the recipient's request row for the round (unique per round, member, slot). */
async function ensureRequest(
  tenantId: number,
  roundId: number,
  memberId: number,
  slot: RecipientSlot,
): Promise<number> {
  const [inserted] = await db
    .insert(availabilityRequestsTable)
    .values({ tenantId, roundId, memberId, recipientSlot: slot })
    .onConflictDoNothing()
    .returning({ id: availabilityRequestsTable.id });
  if (inserted) return inserted.id;
  const [existing] = await db
    .select({ id: availabilityRequestsTable.id })
    .from(availabilityRequestsTable)
    .where(
      and(
        eq(availabilityRequestsTable.tenantId, tenantId),
        eq(availabilityRequestsTable.roundId, roundId),
        eq(availabilityRequestsTable.memberId, memberId),
        eq(availabilityRequestsTable.recipientSlot, slot),
      ),
    );
  if (!existing) throw new Error("availability request row missing after upsert");
  return existing.id;
}

/**
 * Message one member's recipients. Never throws for a
 * transport failure; returns one result per recipient plus the slots skipped
 * for having no contact. Throws only on a programming error (a linked kind
 * without a round, or a round of another tenant).
 */
export async function messageMember(
  args: {
    tenantId: number;
    member: SquadMemberRow;
    kind: MessageKind;
    context?: MessageContext;
    /** The club's SMS switch (`availability_settings.sms_enabled`). */
    smsEnabled: boolean;
    /**
     * Only these recipient slots (a retry of failed deliveries, a throttled
     * reminder); other slots are neither messaged nor reported as skipped.
     */
    slots?: readonly RecipientSlot[];
    now?: Date;
    /** Shared lookups for a loop over members of one round; see {@link MessageBatch}. */
    batch?: MessageBatch;
  },
  logger: Logger = defaultLogger,
): Promise<MessageMemberResult> {
  const { tenantId, kind } = args;
  const context = args.context ?? {};
  const now = args.now ?? new Date();
  const batch = args.batch ?? {};

  // Re-read the member so opt-out flags set by an earlier message are honoured
  // even when the caller holds a stale row; another tenant's member is a no-op.
  const [member] = await db
    .select()
    .from(squadMembersTable)
    .where(and(eq(squadMembersTable.id, args.member.id), eq(squadMembersTable.tenantId, tenantId)));
  if (!member) return { results: [], skipped: [] };

  let recipients: Recipient[];
  let skipped: RecipientSlot[];
  if (kind === "contact_changed") {
    const prev = context.previous;
    if (!prev) throw new Error("contact_changed needs context.previous");
    const base = slotContact(member, prev.slot);
    const r: Recipient = { ...base, mobile: prev.mobile, email: prev.email };
    const reachable = hasValue(r.mobile) || hasValue(r.email);
    recipients = reachable ? [r] : [];
    skipped = reachable ? [] : [prev.slot];
  } else {
    const only = args.slots ? new Set(args.slots) : null;
    recipients = recipientsFor(member, now).filter((r) => !only || only.has(r.slot));
    const reached = new Set(recipients.map((r) => r.slot));
    skipped = intendedSlotsFor(member, now).filter(
      (s) => !reached.has(s) && (!only || only.has(s)),
    );
  }
  if (recipients.length === 0) return { results: [], skipped };

  const linked = LINKED_KINDS.has(kind);
  let expiresAt: Date | null = null;
  let tenantForLinks: Awaited<ReturnType<typeof loadTenantForLinks>> = null;
  if (linked) {
    if (context.roundId == null) throw new Error(`${kind} message needs context.roundId`);
    if (!batch.round) {
      const [round] = await db
        .select({ weekendDate: availabilityRoundsTable.weekendDate })
        .from(availabilityRoundsTable)
        .where(
          and(
            eq(availabilityRoundsTable.id, context.roundId),
            eq(availabilityRoundsTable.tenantId, tenantId),
          ),
        );
      if (!round) throw new Error("availability round not found for this tenant");
      batch.round = round;
    }
    expiresAt = context.expiresAt ?? defaultTokenExpiry(batch.round.weekendDate);
    if (batch.tenantForLinks === undefined)
      batch.tenantForLinks = await loadTenantForLinks(tenantId);
    tenantForLinks = batch.tenantForLinks;
  }

  batch.brand ??= await getTenantBrand(tenantId);
  const brand = batch.brand;
  const clubName = brand.name;
  const clubShort = brand.shortName?.trim() || brand.name;
  const player = memberFirstName(member);
  const sendSmsForClub = args.smsEnabled && smsEnabled();

  const results: RecipientResult[] = [];
  for (const r of recipients) {
    const log = { tenantId, memberId: member.id, slot: r.slot, kind };
    let requestId: number | null = null;
    let sms: DeliveryResult = "failed";
    let email: DeliveryResult = "failed";
    try {
      let link: string | null = null;
      if (linked && context.roundId != null && expiresAt && tenantForLinks) {
        requestId = await ensureRequest(tenantId, context.roundId, member.id, r.slot);
        const { token } = await mintRequestToken({ tenantId, requestId, expiresAt });
        link = availabilityLink(tenantForLinks, token, context.req);
      }
      const text = buildMessage({
        kind,
        clubShort,
        clubName,
        player,
        self: r.slot === "account",
        greetingName: r.slot === "account" ? player : r.name,
        link,
        context,
        optOut: smsRepliesReachUs() ? "reply" : "link",
      });

      // SMS: club switch and platform credentials, then contact, then opt-out.
      if (!sendSmsForClub) sms = "off";
      else if (!hasValue(r.mobile)) sms = "no_contact";
      else if (!normaliseAuMobile(r.mobile)) sms = "invalid_number";
      else if (r.smsOptOut) sms = "opted_out";
      else {
        const res = await sendSms({ to: r.mobile!, body: text.sms });
        if (res.sent) sms = "sent";
        else if (res.reason === "opted_out") {
          sms = "opted_out";
          await db
            .update(squadMembersTable)
            .set({ [OPT_OUT_COLUMN[r.slot]]: true, updatedAt: now })
            .where(
              and(eq(squadMembersTable.id, member.id), eq(squadMembersTable.tenantId, tenantId)),
            );
        } else if (res.reason === "disabled") sms = "off";
        else {
          sms = "failed";
          logger.warn(
            {
              ...log,
              channel: "sms",
              result: "failed",
              error: redactContact(res.error ?? "", [r.mobile, r.email]),
            },
            "availability sms failed",
          );
        }
      }
      if (sms === "invalid_number") {
        logger.warn({ ...log, channel: "sms", result: sms }, "availability sms skipped");
      }

      if (!hasValue(r.email)) email = "no_contact";
      else {
        const res = await sendEmail({
          to: r.email!.trim(),
          subject: text.email.subject,
          text: text.email.text,
        });
        if (res.sent) email = "sent";
        else if (res.reason === "disabled") email = "off";
        else {
          email = "failed";
          logger.warn(
            {
              ...log,
              channel: "email",
              result: "failed",
              error: redactContact(res.error ?? "", [r.mobile, r.email]),
            },
            "availability email failed",
          );
        }
      }

      if (requestId != null) {
        await db
          .update(availabilityRequestsTable)
          .set({ smsResult: sms, smsAt: now, emailResult: email, emailAt: now })
          .where(
            and(
              eq(availabilityRequestsTable.id, requestId),
              eq(availabilityRequestsTable.tenantId, tenantId),
            ),
          );
      }
    } catch (err) {
      // Best-effort: one recipient's DB or transport error never stops the rest.
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(
        { ...log, result: "error", error: redactContact(message, [r.mobile, r.email]) },
        "availability message failed",
      );
    }
    results.push({ slot: r.slot, requestId, sms, email });
  }
  return { results, skipped };
}

export type StaffNoticeKind =
  "selection_drafts_ready" | "selection_slot_reopened" | "selection_contact_changed";

/**
 * Tell the club's captains and admins: the in-app
 * notification row is authoritative and written first; the email to the club's
 * notification address is a best-effort echo, as in `draft-notifications.ts`.
 */
export async function notifyStaff(
  args: {
    tenantId: number;
    kind: StaffNoticeKind;
    title: string;
    body: string;
    link: string;
    payload?: Record<string, unknown>;
  },
  logger: Logger = defaultLogger,
): Promise<NotificationRow> {
  const { tenantId, kind, title, body, link } = args;
  const [row] = await db
    .insert(notificationsTable)
    .values({ tenantId, kind, title, body, link, payload: args.payload ?? {} })
    .returning();
  try {
    const [settings] = await db
      .select({ email: socialSettingsTable.notificationEmail })
      .from(socialSettingsTable)
      .where(eq(socialSettingsTable.tenantId, tenantId));
    if (settings?.email) {
      const result = await sendEmail({
        to: settings.email,
        subject: title,
        text: `${body}\n\n${link}`,
      });
      if (!result.sent && result.reason === "failed") {
        logger.warn(
          { tenantId, kind, error: redactContact(result.error ?? "", [settings.email]) },
          "selection notice email failed",
        );
      }
    }
  } catch (err) {
    logger.warn(
      { tenantId, kind, error: redactContact(err instanceof Error ? err.message : String(err)) },
      "selection notice email failed",
    );
  }
  return row;
}
