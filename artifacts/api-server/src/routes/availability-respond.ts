import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import {
  db,
  availabilityAwayTable,
  availabilityResponsesTable,
  fixturesTable,
  selectionEventsTable,
  selectionsTable,
  squadMembersTable,
  type AvailabilityStatus,
  type FixtureRow,
  type RecipientSlot,
  type SelectionRow,
  type SquadMemberRow,
} from "@workspace/db";
import {
  AddAvailabilityAwayBody,
  GetAvailabilityResponseParams,
  RemoveAvailabilityAwayParams,
  SaveAvailabilityAnswersBody,
  SetAvailabilityTextsBody,
  UpdateAvailabilityContactBody,
} from "@workspace/api-zod";
import { getTenantId } from "../middlewares/tenant-context";
import { availabilityLinkRateLimiter } from "../middlewares/rate-limit";
import {
  resolveAvailabilityToken,
  revokeOtherTokens,
  type ResolvedAvailabilityToken,
} from "../lib/availability-tokens";
import { messageMember, notifyStaff } from "../lib/availability-messaging";
import { datesForMember, loadAvailabilitySettings } from "../lib/availability-schedule";
import { memberDisplayName, memberFirstName, perthDate } from "../lib/availability-grades";
import { SelectionError, withdrawFromSelection } from "../lib/selection-board";
import { TWELFTH_INDEX } from "../lib/selection-drafts";
import { normaliseAuMobile, smsEnabled } from "../lib/integrations/sms";
import { normaliseEmail, normaliseMobile } from "../lib/squad-import";
import { getTenantBrand } from "../lib/tenant-brand";

/**
 * The player availability page's API.
 *
 * Public: the personal link's token is the only credential. It resolves to one
 * request — one recipient slot of one member in one round — on the request's
 * own tenant host; anything else (unknown, expired, revoked, another club) is
 * a bare 404, so a guess learns nothing. A forwarded link exposes only that
 * member's answers for that round, and only this recipient's own contact,
 * masked. Every endpoint is rate-limited by IP, and the token path segment is
 * redacted in the request log (`app.ts`). Logs carry ids only — never a token
 * or a contact value.
 *
 * Answers change freely until the member's side for that date is final; after
 * that only "can't make it" (withdraw) is allowed.
 *
 * The page can also stop (and restart) texts to its recipient: the functional
 * unsubscribe when replies don't reach us (ClickSend own-number sender).
 */
const router: IRouter = Router();

const BASE = "/availability/respond/:token";

/** Away periods may run at most this long, and a member may hold this many. */
const MAX_AWAY_DAYS = 120;
const MAX_AWAY_PERIODS = 20;

/** A member's contact may change from a link once in this long. */
export const CONTACT_CHANGE_GAP_MS = 12 * 60 * 60 * 1000;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SLOT_COLUMNS = {
  account: {
    mobile: "accountHolderMobile",
    email: "accountHolderEmail",
    optOut: "accountSmsOptOut",
  },
  guardian1: { mobile: "guardian1Mobile", email: "guardian1Email", optOut: "guardian1SmsOptOut" },
  guardian2: { mobile: "guardian2Mobile", email: "guardian2Email", optOut: "guardian2SmsOptOut" },
} as const satisfies Record<
  RecipientSlot,
  { mobile: keyof SquadMemberRow; email: keyof SquadMemberRow; optOut: keyof SquadMemberRow }
>;

const SLOT_LABEL: Record<RecipientSlot, string> = {
  account: "account holder",
  guardian1: "parent/guardian 1",
  guardian2: "parent/guardian 2",
};

/** "04xx xxx 678" for an Australian mobile; other numbers keep only their last 3 digits. */
export function maskMobile(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const e164 = normaliseAuMobile(raw);
  const digits = e164 ? `0${e164.slice(3)}` : raw.replace(/\D/g, "");
  if (digits.length < 4) return "xxx";
  if (e164) return `04xx xxx ${digits.slice(-3)}`;
  return `${"x".repeat(digits.length - 3)}${digits.slice(-3)}`;
}

/** "j***@example.com": the first character of the local part and the domain. */
export function maskEmail(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  const at = s.lastIndexOf("@");
  if (at < 1) return "***";
  return `${s[0]}***${s.slice(at)}`;
}

/** A real calendar date, YYYY-MM-DD. */
function isCalendarDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function notFound(res: Response): void {
  res.status(404).json({ error: "not_found" });
}

/** Resolve the request's token on its own tenant, or answer 404 and return null. */
async function resolve(req: Request, res: Response): Promise<ResolvedAvailabilityToken | null> {
  const params = GetAvailabilityResponseParams.safeParse(req.params);
  if (!params.success) {
    notFound(res);
    return null;
  }
  const found = await resolveAvailabilityToken(getTenantId(req), params.data.token);
  if (!found || found.member.tenantId !== found.token.tenantId) {
    notFound(res);
    return null;
  }
  return found;
}

type MemberSide = { selection: SelectionRow; fixture: FixtureRow; date: string };

/** The round's sides holding this member (at most one per date), with their Perth dates. */
async function memberSides(
  tenantId: number,
  roundId: number,
  memberId: number,
): Promise<MemberSide[]> {
  const rows = await db
    .select({ selection: selectionsTable, fixture: fixturesTable })
    .from(selectionsTable)
    .innerJoin(
      fixturesTable,
      and(
        eq(fixturesTable.id, selectionsTable.fixtureId),
        eq(fixturesTable.tenantId, selectionsTable.tenantId),
      ),
    )
    .where(
      and(
        eq(selectionsTable.tenantId, tenantId),
        eq(selectionsTable.roundId, roundId),
        sql`${selectionsTable.slots} @> ${JSON.stringify([{ memberId }])}::jsonb`,
      ),
    )
    .orderBy(asc(fixturesTable.startAt));
  return rows.map((r) => ({ ...r, date: perthDate(r.fixture.startAt) }));
}

/** The dates a member answers this round: their grade's dates plus any date they're picked on. */
async function askedDates(found: ResolvedAvailabilityToken, sides: MemberSide[]) {
  const dates = await datesForMember(found.member.tenantId, found.round, found.member);
  return [...new Set([...dates, ...sides.map((s) => s.date)])].sort();
}

/** Did the member withdraw from a side of this round? */
async function hasWithdrawn(tenantId: number, roundId: number, memberId: number) {
  const [row] = await db
    .select({ id: selectionEventsTable.id })
    .from(selectionEventsTable)
    .innerJoin(selectionsTable, eq(selectionsTable.id, selectionEventsTable.selectionId))
    .where(
      and(
        eq(selectionEventsTable.tenantId, tenantId),
        eq(selectionsTable.tenantId, tenantId),
        eq(selectionsTable.roundId, roundId),
        eq(selectionEventsTable.action, "withdraw"),
        sql`${selectionEventsTable.detail} ->> 'memberId' = ${String(memberId)}`,
      ),
    )
    .limit(1);
  return !!row;
}

/** The team-list role a member holds in a side. */
function roleIn(side: SelectionRow, memberId: number): "C" | "WK" | "C/WK" | null {
  const c = side.captainMemberId === memberId;
  const wk = side.keeperMemberId === memberId;
  return c && wk ? "C/WK" : c ? "C" : wk ? "WK" : null;
}

/** The page for a resolved token. */
async function buildPage(found: ResolvedAvailabilityToken, now: Date = new Date()) {
  const { member, request, round } = found;
  const tenantId = member.tenantId;
  const [brand, sides, settings] = await Promise.all([
    getTenantBrand(tenantId),
    memberSides(tenantId, round.id, member.id),
    loadAvailabilitySettings(tenantId),
  ]);
  const [dates, answers, away, withdrewEvent] = await Promise.all([
    askedDates(found, sides),
    db
      .select()
      .from(availabilityResponsesTable)
      .where(
        and(
          eq(availabilityResponsesTable.tenantId, tenantId),
          eq(availabilityResponsesTable.roundId, round.id),
          eq(availabilityResponsesTable.memberId, member.id),
        ),
      ),
    db
      .select({
        id: availabilityAwayTable.id,
        fromDate: availabilityAwayTable.fromDate,
        toDate: availabilityAwayTable.toDate,
      })
      .from(availabilityAwayTable)
      .where(
        and(
          eq(availabilityAwayTable.tenantId, tenantId),
          eq(availabilityAwayTable.memberId, member.id),
          gte(availabilityAwayTable.toDate, perthDate(now)),
        ),
      )
      .orderBy(asc(availabilityAwayTable.fromDate)),
    sides.length === 0 ? hasWithdrawn(tenantId, round.id, member.id) : Promise.resolve(false),
  ]);
  const answerOf = new Map(answers.map((a) => [a.date, a]));
  const finalDates = new Set(sides.filter((s) => s.selection.state === "final").map((s) => s.date));
  const final = sides.find((s) => s.selection.state === "final");
  const cols = SLOT_COLUMNS[request.recipientSlot];

  return {
    clubName: brand.name,
    clubShortName: brand.shortName?.trim() || null,
    logoUrl: brand.logoUrl ?? null,
    primaryColour: brand.primaryColour ?? null,
    firstName: memberFirstName(member),
    displayName: memberDisplayName(member),
    recipientSlot: request.recipientSlot,
    self: request.recipientSlot === "account",
    weekendDate: round.weekendDate,
    dates: dates.map((date) => {
      const a = answerOf.get(date);
      return {
        date,
        status: a?.status ?? null,
        note: a?.note ?? null,
        late: a?.late ?? false,
        locked: finalDates.has(date),
      };
    }),
    away,
    // This recipient's own contact only, masked.
    contact: { mobile: maskMobile(member[cols.mobile]), email: maskEmail(member[cols.email]) },
    selection: final
      ? {
          grade: final.fixture.grade,
          opponent: final.fixture.opponentName,
          venue: final.fixture.venue ?? null,
          startAt: final.fixture.startAt,
          isHome: final.fixture.isHome,
          role: roleIn(final.selection, member.id),
          // Slot 12 is the 12th player; older 11-slot sides have none.
          twelfth: final.selection.slots[TWELFTH_INDEX]?.memberId === member.id,
        }
      : null,
    canWithdraw: sides.length > 0,
    locked: finalDates.size > 0,
    withdrawn: withdrewEvent,
    late: round.cutoffCompletedAt != null,
    smsOptedOut: member[cols.optOut],
    // Same default as the senders: a club without saved settings has SMS on.
    textsAvailable: (settings?.smsEnabled ?? true) && smsEnabled(),
  };
}

/** Record answers for a member (latest wins; late after cut-off). */
async function upsertAnswers(
  found: ResolvedAvailabilityToken,
  answers: { date: string; status: AvailabilityStatus; note?: string | null }[],
  now: Date,
): Promise<void> {
  const { member, request, round } = found;
  const late = round.cutoffCompletedAt != null;
  for (const a of answers) {
    const note = a.note === undefined ? undefined : a.note?.trim() || null;
    await db
      .insert(availabilityResponsesTable)
      .values({
        tenantId: member.tenantId,
        roundId: round.id,
        memberId: member.id,
        date: a.date,
        status: a.status,
        note: note ?? null,
        respondedBySlot: request.recipientSlot,
        respondedAt: now,
        late,
      })
      .onConflictDoUpdate({
        target: [
          availabilityResponsesTable.roundId,
          availabilityResponsesTable.memberId,
          availabilityResponsesTable.date,
        ],
        set: {
          status: a.status,
          ...(note !== undefined ? { note } : {}),
          respondedBySlot: request.recipientSlot,
          respondedAt: now,
          late,
        },
      });
  }
}

router.get(BASE, availabilityLinkRateLimiter, async (req, res): Promise<void> => {
  const found = await resolve(req, res);
  if (!found) return;
  res.json(await buildPage(found));
});

router.put(BASE, availabilityLinkRateLimiter, async (req, res): Promise<void> => {
  const found = await resolve(req, res);
  if (!found) return;
  const body = SaveAvailabilityAnswersBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { member, round } = found;
  const sides = await memberSides(member.tenantId, round.id, member.id);
  const asked = new Set(await askedDates(found, sides));
  if (body.data.answers.some((a) => !asked.has(a.date))) {
    res.status(400).json({ error: "date_not_asked" });
    return;
  }
  const finalDates = new Set(sides.filter((s) => s.selection.state === "final").map((s) => s.date));
  if (body.data.answers.some((a) => finalDates.has(a.date))) {
    res.status(409).json({ error: "selection_final" });
    return;
  }
  const now = new Date();
  await upsertAnswers(found, body.data.answers, now);
  req.log?.info(
    {
      tenantId: member.tenantId,
      memberId: member.id,
      slot: found.request.recipientSlot,
      answers: body.data.answers.length,
    },
    "availability answered",
  );
  res.json(await buildPage(found, now));
});

router.post(`${BASE}/away`, availabilityLinkRateLimiter, async (req, res): Promise<void> => {
  const found = await resolve(req, res);
  if (!found) return;
  const body = AddAvailabilityAwayBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { fromDate, toDate } = body.data;
  const now = new Date();
  const today = perthDate(now);
  if (!isCalendarDate(fromDate) || !isCalendarDate(toDate) || fromDate > toDate) {
    res.status(400).json({ error: "invalid_range" });
    return;
  }
  if (fromDate < today) {
    res.status(400).json({ error: "in_the_past" });
    return;
  }
  if (daysBetween(fromDate, toDate) + 1 > MAX_AWAY_DAYS) {
    res.status(400).json({ error: "too_long" });
    return;
  }
  const { member, round } = found;
  const tenantId = member.tenantId;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(availabilityAwayTable)
    .where(
      and(
        eq(availabilityAwayTable.tenantId, tenantId),
        eq(availabilityAwayTable.memberId, member.id),
        gte(availabilityAwayTable.toDate, today),
      ),
    );
  if (count >= MAX_AWAY_PERIODS) {
    res.status(400).json({ error: "too_many" });
    return;
  }
  await db
    .insert(availabilityAwayTable)
    .values({ tenantId, memberId: member.id, fromDate, toDate });

  // This round's dates the period covers are answered No, except a date
  // the member's side is already final on — that takes "can't make it".
  const sides = await memberSides(tenantId, round.id, member.id);
  const finalDates = new Set(sides.filter((s) => s.selection.state === "final").map((s) => s.date));
  const covered = (await askedDates(found, sides)).filter(
    (d) => fromDate <= d && d <= toDate && !finalDates.has(d),
  );
  await upsertAnswers(
    found,
    covered.map((date) => ({ date, status: "no" as const })),
    now,
  );
  req.log?.info({ tenantId, memberId: member.id, covered: covered.length }, "availability away");
  res.status(201).json(await buildPage(found, now));
});

router.delete(
  `${BASE}/away/:awayId`,
  availabilityLinkRateLimiter,
  async (req, res): Promise<void> => {
    const found = await resolve(req, res);
    if (!found) return;
    const params = RemoveAvailabilityAwayParams.safeParse(req.params);
    if (!params.success) {
      notFound(res);
      return;
    }
    const { member } = found;
    const removed = await db
      .delete(availabilityAwayTable)
      .where(
        and(
          eq(availabilityAwayTable.id, params.data.awayId),
          eq(availabilityAwayTable.tenantId, member.tenantId),
          eq(availabilityAwayTable.memberId, member.id),
        ),
      )
      .returning({ id: availabilityAwayTable.id });
    if (removed.length === 0) {
      notFound(res);
      return;
    }
    res.json(await buildPage(found));
  },
);

router.patch(`${BASE}/contact`, availabilityLinkRateLimiter, async (req, res): Promise<void> => {
  const found = await resolve(req, res);
  if (!found) return;
  const body = UpdateAvailabilityContactBody.safeParse(req.body);
  if (!body.success || (body.data.mobile === undefined && body.data.email === undefined)) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  if (body.data.mobile !== undefined && !normaliseAuMobile(body.data.mobile)) {
    res.status(400).json({ error: "invalid_mobile" });
    return;
  }
  if (body.data.email !== undefined && !EMAIL_RE.test(body.data.email.trim())) {
    res.status(400).json({ error: "invalid_email" });
    return;
  }

  const { member, request, token } = found;
  const tenantId = member.tenantId;
  const slot = request.recipientSlot;
  const cols = SLOT_COLUMNS[slot];
  const prevMobile = member[cols.mobile];
  const prevEmail = member[cols.email];
  const set: Partial<typeof squadMembersTable.$inferInsert> = {};
  const fields: ("mobile" | "email")[] = [];
  if (
    body.data.mobile !== undefined &&
    normaliseAuMobile(body.data.mobile) !== normaliseAuMobile(prevMobile)
  ) {
    set[cols.mobile] = normaliseMobile(body.data.mobile);
    fields.push("mobile");
  }
  if (body.data.email !== undefined) {
    const email = normaliseEmail(body.data.email);
    if (email !== normaliseEmail(prevEmail)) {
      set[cols.email] = email;
      fields.push("email");
    }
  }
  if (fields.length === 0) {
    res.json(await buildPage(found));
    return;
  }

  const now = new Date();
  const scoped = and(eq(squadMembersTable.id, member.id), eq(squadMembersTable.tenantId, tenantId));
  // Only this recipient slot's own fields change, and the admins see a flag. One
  // change per member every 12 hours (any slot), checked in the update itself so
  // two changes at once can't both pass.
  const changed = await db
    .update(squadMembersTable)
    .set({ ...set, contactChangeFlag: true, contactChangedAt: now, updatedAt: now })
    .where(
      and(
        scoped,
        or(
          isNull(squadMembersTable.contactChangedAt),
          lte(squadMembersTable.contactChangedAt, new Date(now.getTime() - CONTACT_CHANGE_GAP_MS)),
        ),
      ),
    )
    .returning({ id: squadMembersTable.id });
  if (changed.length === 0) {
    res.status(429).json({ error: "too_many_changes" });
    return;
  }

  // Tell the previous contact. Sent before the opt-out is cleared, so an old
  // number that replied STOP is still respected; a 21610 on it then can't
  // leave the new number marked opted out.
  const settings = await loadAvailabilitySettings(tenantId);
  await messageMember(
    {
      tenantId,
      member,
      kind: "contact_changed",
      context: { previous: { slot, mobile: prevMobile, email: prevEmail }, req },
      smsEnabled: settings?.smsEnabled ?? true,
      now,
    },
    req.log ?? undefined,
  );
  // A new number hasn't replied STOP.
  if (fields.includes("mobile")) {
    await db
      .update(squadMembersTable)
      .set({ [cols.optOut]: false, updatedAt: now })
      .where(scoped);
  }
  // Links sent to the old contact stop working; this one keeps working.
  const revoked = await revokeOtherTokens({
    tenantId,
    requestId: request.id,
    keepTokenId: token.id,
    now,
  });

  const name = memberDisplayName(member);
  try {
    await notifyStaff(
      {
        tenantId,
        kind: "selection_contact_changed",
        title: `${name}'s contact details changed`,
        body: `The ${SLOT_LABEL[slot]} for ${name} changed their ${fields.join(" and ")} from their availability link. Check the squad register.`,
        link: "/admin/squad",
        payload: { memberId: member.id, slot, fields },
      },
      req.log ?? undefined,
    );
  } catch (err) {
    req.log?.warn({ err, tenantId, memberId: member.id }, "contact change notice failed");
  }
  req.log?.info({ tenantId, memberId: member.id, slot, fields, revoked }, "availability contact");

  const [fresh] = await db.select().from(squadMembersTable).where(scoped);
  res.json(await buildPage({ ...found, member: fresh ?? member }, now));
});

router.post(`${BASE}/texts`, availabilityLinkRateLimiter, async (req, res): Promise<void> => {
  const found = await resolve(req, res);
  if (!found) return;
  const body = SetAvailabilityTextsBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "invalid_body" });
    return;
  }
  const { member, request } = found;
  const tenantId = member.tenantId;
  const slot = request.recipientSlot;
  const now = new Date();
  const scoped = and(eq(squadMembersTable.id, member.id), eq(squadMembersTable.tenantId, tenantId));
  // Only this link's recipient slot. Starting again is the person's own
  // choice, made from their own link, so it is allowed as freely as stopping.
  await db
    .update(squadMembersTable)
    .set({ [SLOT_COLUMNS[slot].optOut]: body.data.stop, updatedAt: now })
    .where(scoped);
  req.log?.info(
    { tenantId, memberId: member.id, slot, stop: body.data.stop },
    "availability texts",
  );
  const [fresh] = await db.select().from(squadMembersTable).where(scoped);
  res.json(await buildPage({ ...found, member: fresh ?? member }, now));
});

router.post(`${BASE}/withdraw`, availabilityLinkRateLimiter, async (req, res): Promise<void> => {
  const found = await resolve(req, res);
  if (!found) return;
  const { member, round, request } = found;
  const tenantId = member.tenantId;
  const sides = await memberSides(tenantId, round.id, member.id);
  if (sides.length === 0) {
    res.status(409).json({ error: "not_selected" });
    return;
  }
  const now = new Date();
  let out: Awaited<ReturnType<typeof withdrawFromSelection>>;
  try {
    out = await withdrawFromSelection(
      tenantId,
      member.id,
      round.id,
      { kind: "player", id: member.id, name: memberDisplayName(member) },
      { now, logger: req.log ?? undefined },
    );
  } catch (err) {
    // The match has started: the side is fixed now.
    if (err instanceof SelectionError && err.status === 409) {
      res.status(409).json({ error: "match_started" });
      return;
    }
    throw err;
  }
  // They can't make it, so the Hub shows them unavailable for those dates.
  await upsertAnswers(
    found,
    sides.map((s) => ({ date: s.date, status: "no" as const })),
    now,
  );
  req.log?.info(
    { tenantId, memberId: member.id, slot: request.recipientSlot, selectionIds: out.selectionIds },
    "availability withdraw",
  );
  res.json(await buildPage(found, now));
});

export default router;
