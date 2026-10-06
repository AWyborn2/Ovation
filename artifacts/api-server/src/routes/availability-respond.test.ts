import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import pino from "pino";
import { and, eq } from "drizzle-orm";
import app, { logUrl } from "../app";
import {
  db,
  tenantsTable,
  squadMembersTable,
  availabilityAwayTable,
  availabilityRequestsTable,
  availabilityResponsesTable,
  availabilityRoundsTable,
  fixturesTable,
  notificationsTable,
  selectionEventsTable,
  selectionsTable,
  teamListsTable,
  type RecipientSlot,
  type SelectionSlot,
} from "@workspace/db";
import { setEmailTransport, type EmailMessage } from "../lib/integrations/email";
import { setSmsTransport, normaliseAuMobile, type SmsMessage } from "../lib/integrations/sms";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import { addDays, perthDayStart } from "../lib/availability-grades";
import {
  DEFAULT_SCHEDULE,
  ensureRound,
  roundWeekendFor,
  runStep,
  setSendPaceMs,
} from "../lib/availability-schedule";
import { defaultTokenExpiry, mintRequestToken } from "../lib/availability-tokens";
import { logger } from "../lib/logger";
import { maskEmail, maskMobile } from "./availability-respond";

/**
 * The player availability page's API (plan 2026-10-06-002 U5; R6, R10–R12,
 * R15, R33; AE6, AE7; KTD5, KTD12). Real-DB integration test (needs
 * DATABASE_URL with migrations applied); SMS and email go to in-process fakes.
 *
 * Tenant A's round has A Grade on Saturday and B Grade plus Under 15 on
 * Sunday. Adults with no known grade are asked about both senior dates; the
 * junior (two guardians) about Sunday only (KTD12).
 */

const STAMP = Date.now();
const tail = String(STAMP % 1000).padStart(3, "0");
const ADULT_EMAIL = `alex.${STAMP}@example.test`;
const ADULT_MOBILE = `0412 345 ${tail}`;
const OTHER_EMAIL = `olive.${STAMP}@example.test`;
const OTHER_MOBILE = `0413 222 ${tail}`;
const G1_EMAIL = `gail.${STAMP}@example.test`;
const G1_MOBILE = `0414 111 ${tail}`;
const G2_EMAIL = `greg.${STAMP}@example.test`;
const G2_MOBILE = `0415 222 ${tail}`;
const SEL_EMAIL = `sam.${STAMP}@example.test`;

describe("availability respond API", () => {
  let tenantA: number;
  let tenantB: number;
  let roundId: number;
  let weekendDate: string;
  let sat: string;
  let sun: string;
  let fixtureA: number;
  let adult: number;
  let other: number;
  let junior: number;
  let selected: number;
  let filler: number;

  let sms: SmsMessage[] = [];
  let email: EmailMessage[] = [];

  const asA = (r: request.Test) => r.set("x-tenant-id", String(tenantA));
  const path = (token: string, rest = "") => `/api/availability/respond/${token}${rest}`;

  async function requestFor(memberId: number, slot: RecipientSlot): Promise<number> {
    const [row] = await db
      .insert(availabilityRequestsTable)
      .values({ tenantId: tenantA, roundId, memberId, recipientSlot: slot })
      .onConflictDoNothing()
      .returning({ id: availabilityRequestsTable.id });
    if (row) return row.id;
    const [existing] = await db
      .select({ id: availabilityRequestsTable.id })
      .from(availabilityRequestsTable)
      .where(
        and(
          eq(availabilityRequestsTable.roundId, roundId),
          eq(availabilityRequestsTable.memberId, memberId),
          eq(availabilityRequestsTable.recipientSlot, slot),
        ),
      );
    return existing.id;
  }

  async function tokenFor(memberId: number, slot: RecipientSlot, expiresAt?: Date) {
    const requestId = await requestFor(memberId, slot);
    const { token } = await mintRequestToken({
      tenantId: tenantA,
      requestId,
      expiresAt: expiresAt ?? defaultTokenExpiry(weekendDate),
    });
    return token;
  }

  const answer = async (memberId: number, date: string) =>
    (
      await db
        .select()
        .from(availabilityResponsesTable)
        .where(
          and(
            eq(availabilityResponsesTable.roundId, roundId),
            eq(availabilityResponsesTable.memberId, memberId),
            eq(availabilityResponsesTable.date, date),
          ),
        )
    )[0];

  /** A Grade, finalised with `selected` as captain and `filler`, published as its team list. */
  async function finalSide(): Promise<number> {
    await db.delete(selectionsTable).where(eq(selectionsTable.tenantId, tenantA));
    await db.delete(teamListsTable).where(eq(teamListsTable.tenantId, tenantA));
    const slots: SelectionSlot[] = [
      { memberId: selected },
      { memberId: filler },
      ...Array.from({ length: 9 }, () => ({ memberId: null })),
    ];
    const [row] = await db
      .insert(selectionsTable)
      .values({
        tenantId: tenantA,
        roundId,
        fixtureId: fixtureA,
        slots,
        captainMemberId: selected,
        state: "final",
        finalisedAt: new Date(),
        notifiedMemberIds: [selected, filler],
      })
      .returning({ id: selectionsTable.id });
    await db.insert(teamListsTable).values({
      tenantId: tenantA,
      fixtureId: fixtureA,
      isPublished: true,
      source: "selection",
      players: [
        { order: 1, displayName: "Sam Selected", role: "C" },
        { order: 2, displayName: "Finn Filler" },
      ],
    });
    return row.id;
  }

  beforeAll(async () => {
    setSendPaceMs(0);
    process.env.PLATFORM_BASE_DOMAIN = "ovation.test";
    setSmsTransport(async (msg) => {
      sms.push(msg);
    });
    setEmailTransport(async (msg) => {
      email.push(msg);
    });

    const tenants = await db
      .insert(tenantsTable)
      .values([
        {
          slug: `resp-a-${STAMP}`,
          centralClubId: 7_600_000 + (STAMP % 100_000) * 10,
          name: "Respond A CC",
          plan: "pilot",
        },
        {
          slug: `resp-b-${STAMP}`,
          centralClubId: 7_600_001 + (STAMP % 100_000) * 10,
          name: "Respond B CC",
          plan: "pilot",
        },
      ])
      .returning();
    [tenantA, tenantB] = tenants.map((t) => t.id);

    weekendDate = roundWeekendFor(DEFAULT_SCHEDULE, new Date());
    sat = weekendDate;
    sun = addDays(weekendDate, 1);
    const at = (date: string, hour: number) =>
      new Date(perthDayStart(date).getTime() + hour * 3_600_000);
    const [round] = await db
      .insert(availabilityRoundsTable)
      .values({ tenantId: tenantA, weekendDate, sendStartedAt: new Date() })
      .returning();
    roundId = round.id;
    const fx = await db
      .insert(fixturesTable)
      .values([
        {
          tenantId: tenantA,
          grade: "A Grade",
          opponentName: "Mandurah",
          venue: "Rushton Park",
          isHome: false,
          startAt: at(sat, 13),
        },
        { tenantId: tenantA, grade: "B Grade", opponentName: "Pinjarra", startAt: at(sun, 13) },
        { tenantId: tenantA, grade: "Under 15", opponentName: "Waroona", startAt: at(sun, 8) },
      ])
      .returning();
    fixtureA = fx[0].id;

    const insertMember = async (values: Partial<typeof squadMembersTable.$inferInsert>) =>
      (
        await db
          .insert(squadMembersTable)
          .values({ tenantId: tenantA, firstName: "X", lastName: "Y", ...values })
          .returning()
      )[0].id;
    adult = await insertMember({
      firstName: "Alexander",
      preferredName: "Alex",
      lastName: "Adult",
      dateOfBirth: "1990-03-03",
      accountHolderName: "Alex Adult",
      accountHolderEmail: ADULT_EMAIL,
      accountHolderMobile: ADULT_MOBILE,
    });
    other = await insertMember({
      firstName: "Olive",
      lastName: "Otherly",
      dateOfBirth: "1991-03-03",
      accountHolderName: "Olive Otherly",
      accountHolderEmail: OTHER_EMAIL,
      accountHolderMobile: OTHER_MOBILE,
    });
    junior = await insertMember({
      firstName: "Jamie",
      lastName: "Junior",
      section: "junior",
      dateOfBirth: "2011-06-01",
      guardian1Name: "Gail Junior",
      guardian1Email: G1_EMAIL,
      guardian1Mobile: G1_MOBILE,
      guardian2Name: "Greg Junior",
      guardian2Email: G2_EMAIL,
      guardian2Mobile: G2_MOBILE,
      // Stale opt-out on guardian 2's old number, cleared by a new number.
      guardian2SmsOptOut: true,
    });
    selected = await insertMember({
      firstName: "Sam",
      lastName: "Selected",
      dateOfBirth: "1992-03-03",
      accountHolderName: "Sam Selected",
      accountHolderEmail: SEL_EMAIL,
    });
    filler = await insertMember({
      firstName: "Finn",
      lastName: "Filler",
      dateOfBirth: "1993-03-03",
    });
  });

  afterAll(async () => {
    setSmsTransport(null);
    setEmailTransport(null);
    setSendPaceMs(250);
    await purgeTestTenants([tenantA, tenantB]);
  });

  it("masks contacts", () => {
    expect(maskMobile("0412 345 678")).toBe("04xx xxx 678");
    expect(maskMobile("+61412345678")).toBe("04xx xxx 678");
    expect(maskEmail("jo.smith@example.com")).toBe("j***@example.com");
    expect(maskMobile(null)).toBeNull();
    expect(maskEmail("")).toBeNull();
  });

  it("a valid token returns the member's section dates and none of another member's data", async () => {
    const token = await tokenFor(adult, "account");
    const res = await asA(request(app).get(path(token))).expect(200);
    expect(res.body).toMatchObject({
      clubName: expect.any(String),
      firstName: "Alex",
      displayName: "Alex Adult",
      recipientSlot: "account",
      self: true,
      weekendDate,
      selection: null,
      canWithdraw: false,
      locked: false,
      withdrawn: false,
      late: false,
    });
    expect(res.body.dates.map((d: { date: string }) => d.date)).toEqual([sat, sun]);
    // Masked, never in full (R6, KTD5).
    expect(res.body.contact).toEqual({ mobile: `04xx xxx ${tail}`, email: "a***@example.test" });
    const json = JSON.stringify(res.body);
    for (const leak of [ADULT_EMAIL, normaliseAuMobile(ADULT_MOBILE)!, "0412345", "Olive"]) {
      expect(json).not.toContain(leak);
    }
    expect(json).not.toContain(OTHER_EMAIL);

    const jr = await asA(request(app).get(path(await tokenFor(junior, "guardian1")))).expect(200);
    expect(jr.body.dates.map((d: { date: string }) => d.date)).toEqual([sun]);
    expect(jr.body.self).toBe(false);
    // Guardian 1's own contact only.
    expect(jr.body.contact.email).toBe("g***@example.test");
    expect(JSON.stringify(jr.body)).not.toContain(G2_EMAIL);
  });

  it("unknown, expired and other-tenant tokens are a bare 404", async () => {
    const expired = await tokenFor(adult, "account", new Date(Date.now() - 60_000));
    const res = await asA(request(app).get(path(expired))).expect(404);
    expect(res.body).toEqual({ error: "not_found" });
    await asA(request(app).get(path("not-a-real-token"))).expect(404);

    const valid = await tokenFor(adult, "account");
    const other = await request(app)
      .get(path(valid))
      .set("x-tenant-id", String(tenantB))
      .expect(404);
    expect(other.body).toEqual({ error: "not_found" });
    await request(app)
      .put(path(valid))
      .set("x-tenant-id", String(tenantB))
      .send({ answers: [{ date: sat, status: "yes" }] })
      .expect(404);
  });

  it("either guardian answers and the later answer stands (AE6)", async () => {
    const g1 = await tokenFor(junior, "guardian1");
    const g2 = await tokenFor(junior, "guardian2");
    await asA(request(app).put(path(g1)))
      .send({ answers: [{ date: sun, status: "yes", note: "Can bring snacks" }] })
      .expect(200);
    expect(await answer(junior, sun)).toMatchObject({
      status: "yes",
      respondedBySlot: "guardian1",
    });
    const res = await asA(request(app).put(path(g2)))
      .send({ answers: [{ date: sun, status: "no" }] })
      .expect(200);
    expect(await answer(junior, sun)).toMatchObject({
      status: "no",
      respondedBySlot: "guardian2",
      // An omitted note keeps the earlier one.
      note: "Can bring snacks",
      late: false,
    });
    expect(res.body.dates).toEqual([
      { date: sun, status: "no", note: "Can bring snacks", late: false, locked: false },
    ]);
  });

  it("a date outside the member's list → 400, nothing written", async () => {
    const g1 = await tokenFor(junior, "guardian1");
    const res = await asA(request(app).put(path(g1)))
      .send({ answers: [{ date: sat, status: "yes" }] })
      .expect(400);
    expect(res.body).toEqual({ error: "date_not_asked" });
    expect(await answer(junior, sat)).toBeUndefined();
    await asA(request(app).put(path(g1)))
      .send({ answers: [{ date: sun, status: "sometimes" }] })
      .expect(400);
  });

  it("answers after cut-off are kept and marked late (R15)", async () => {
    await db
      .update(availabilityRoundsTable)
      .set({ cutoffStartedAt: new Date(), cutoffCompletedAt: new Date() })
      .where(eq(availabilityRoundsTable.id, roundId));
    try {
      const token = await tokenFor(other, "account");
      const res = await asA(request(app).put(path(token)))
        .send({ answers: [{ date: sat, status: "maybe" }] })
        .expect(200);
      expect(res.body.late).toBe(true);
      expect(await answer(other, sat)).toMatchObject({ status: "maybe", late: true });
    } finally {
      await db
        .update(availabilityRoundsTable)
        .set({ cutoffStartedAt: null, cutoffCompletedAt: null })
        .where(eq(availabilityRoundsTable.id, roundId));
    }
  });

  it("PATCH contact via guardian 2 changes only guardian 2, notifies the old contact and revokes their other links (R6, KTD5)", async () => {
    const g1 = await tokenFor(junior, "guardian1");
    const g2Old = await tokenFor(junior, "guardian2");
    const g2 = await tokenFor(junior, "guardian2");
    sms = [];
    email = [];
    const NEW_MOBILE = `0499 888 ${tail}`;

    const res = await asA(request(app).patch(path(g2, "/contact")))
      .send({ mobile: NEW_MOBILE })
      .expect(200);
    expect(res.body.contact.mobile).toBe(`04xx xxx ${tail}`);
    expect(JSON.stringify(res.body)).not.toContain(NEW_MOBILE.replace(/\s/g, ""));

    const [row] = await db.select().from(squadMembersTable).where(eq(squadMembersTable.id, junior));
    expect(normaliseAuMobile(row.guardian2Mobile)).toBe(normaliseAuMobile(NEW_MOBILE));
    expect(row.guardian2Email).toBe(G2_EMAIL);
    expect(row.guardian1Mobile).toBe(G1_MOBILE);
    expect(row.guardian1Email).toBe(G1_EMAIL);
    expect(row.contactChangeFlag).toBe(true);
    expect(row.contactChangedAt).not.toBeNull();
    // A new number hasn't replied STOP.
    expect(row.guardian2SmsOptOut).toBe(false);

    // The notice went to the PREVIOUS contact only. The old number had opted out,
    // so it gets the email alone.
    expect(sms.map((s) => s.to)).not.toContain(normaliseAuMobile(NEW_MOBILE));
    expect(sms).toHaveLength(0);
    expect(email.map((e) => e.to)).toEqual([G2_EMAIL]);
    expect(email[0].subject).toMatch(/contact details changed/i);

    // Staff are told, without contact values.
    const notes = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.tenantId, tenantA),
          eq(notificationsTable.kind, "selection_contact_changed"),
        ),
      );
    expect(notes).toHaveLength(1);
    const noteText = JSON.stringify(notes[0]);
    for (const v of [NEW_MOBILE, G2_MOBILE, normaliseAuMobile(NEW_MOBILE)!, G2_EMAIL]) {
      expect(noteText).not.toContain(v);
    }

    // Guardian 2's other link is revoked; this one and guardian 1's keep working.
    await asA(request(app).get(path(g2Old))).expect(404);
    await asA(request(app).get(path(g2))).expect(200);
    await asA(request(app).get(path(g1))).expect(200);

    // An email change notifies the previous mobile (now the new one) and email.
    sms = [];
    email = [];
    await asA(request(app).patch(path(g2, "/contact")))
      .send({ email: `greg.new.${STAMP}@example.test` })
      .expect(200);
    expect(sms.map((s) => s.to)).toEqual([normaliseAuMobile(NEW_MOBILE)]);
    expect(email.map((e) => e.to)).toEqual([G2_EMAIL]);

    await asA(request(app).patch(path(g2, "/contact")))
      .send({ mobile: "08 9555 1234" })
      .expect(400);
    await asA(request(app).patch(path(g2, "/contact")))
      .send({ email: "not-an-email" })
      .expect(400);
    await asA(request(app).patch(path(g2, "/contact")))
      .send({})
      .expect(400);
  });

  it("the request log never carries the token", async () => {
    expect(logUrl("/api/availability/respond/abc123/away/4?x=1")).toBe(
      "/api/availability/respond/[token]/away/4",
    );
    expect(logUrl("/API/Availability/Respond/abc123")).toBe("/API/Availability/Respond/[token]");
    expect(logUrl("/api/selection/board?section=senior")).toBe("/api/selection/board");

    const token = await tokenFor(adult, "account");
    const stream = (logger as unknown as Record<symbol, { write: (s: string) => unknown }>)[
      pino.symbols.streamSym
    ];
    const lines: string[] = [];
    const spy = vi.spyOn(stream, "write").mockImplementation((s: string) => {
      lines.push(String(s));
      return true;
    });
    const level = logger.level;
    logger.level = "info";
    try {
      await asA(request(app).get(path(token))).expect(200);
      await asA(request(app).put(path(token)))
        .send({ answers: [{ date: sat, status: "yes" }] })
        .expect(200);
      await asA(request(app).get(path(`${token}x`))).expect(404);
      await new Promise((r) => setTimeout(r, 50));
    } finally {
      logger.level = level;
      spy.mockRestore();
    }
    const out = lines.join("\n");
    expect(out).toContain("/api/availability/respond/[token]");
    expect(out).not.toContain(token);
  });

  it("answering after the member's side is final → 409; GET shows the match", async () => {
    await finalSide();
    const token = await tokenFor(selected, "account");
    const page = await asA(request(app).get(path(token))).expect(200);
    expect(page.body).toMatchObject({
      locked: true,
      canWithdraw: true,
      selection: {
        grade: "A Grade",
        opponent: "Mandurah",
        venue: "Rushton Park",
        isHome: false,
        role: "C",
      },
    });
    expect(page.body.dates.find((d: { date: string }) => d.date === sat).locked).toBe(true);
    const res = await asA(request(app).put(path(token)))
      .send({ answers: [{ date: sat, status: "no" }] })
      .expect(409);
    expect(res.body).toEqual({ error: "selection_final" });
    // A date they aren't picked on can still change.
    await asA(request(app).put(path(token)))
      .send({ answers: [{ date: sun, status: "yes" }] })
      .expect(200);
  });

  it("withdraw re-opens the slot, returns the side to draft, keeps the list published and alerts staff (AE7)", async () => {
    const selectionId = await finalSide();
    await db.delete(notificationsTable).where(eq(notificationsTable.tenantId, tenantA));
    const token = await tokenFor(selected, "account");

    // Not in a side → 409.
    await asA(request(app).post(path(await tokenFor(adult, "account"), "/withdraw"))).expect(409);

    const res = await asA(request(app).post(path(token, "/withdraw"))).expect(200);
    expect(res.body).toMatchObject({
      withdrawn: true,
      canWithdraw: false,
      locked: false,
      selection: null,
    });

    const [side] = await db
      .select()
      .from(selectionsTable)
      .where(eq(selectionsTable.id, selectionId));
    expect(side.state).toBe("draft");
    expect(side.slots[0]).toEqual({
      memberId: null,
      gap: { name: "Sam Selected", reason: "withdrew" },
    });
    expect(side.captainMemberId).toBeNull();

    const [list] = await db
      .select()
      .from(teamListsTable)
      .where(and(eq(teamListsTable.tenantId, tenantA), eq(teamListsTable.fixtureId, fixtureA)));
    expect(list.isPublished).toBe(true);
    expect(list.players.map((p) => p.displayName)).toEqual(["Finn Filler"]);

    const events = await db
      .select()
      .from(selectionEventsTable)
      .where(eq(selectionEventsTable.selectionId, selectionId));
    expect(events.map((e) => [e.action, e.actorKind])).toEqual([["withdraw", "player"]]);
    const notes = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.tenantId, tenantA),
          eq(notificationsTable.kind, "selection_slot_reopened"),
        ),
      );
    expect(notes).toHaveLength(1);
    // The Hub shows them unavailable for the match date.
    expect(await answer(selected, sat)).toMatchObject({ status: "no" });

    // Now they can answer again, and a second withdraw has nothing to leave.
    await asA(request(app).put(path(token)))
      .send({ answers: [{ date: sat, status: "maybe" }] })
      .expect(200);
    await asA(request(app).post(path(token, "/withdraw"))).expect(409);
  });

  it("away periods: validated, removable only by their member, and the next send skips them (R11)", async () => {
    const token = await tokenFor(adult, "account");
    const nextSat = addDays(weekendDate, 7);
    const nextSun = addDays(weekendDate, 8);

    await asA(request(app).post(path(token, "/away")))
      .send({ fromDate: nextSun, toDate: nextSat })
      .expect(400);
    await asA(request(app).post(path(token, "/away")))
      .send({ fromDate: "2020-01-01", toDate: "2020-01-02" })
      .expect(400);
    await asA(request(app).post(path(token, "/away")))
      .send({ fromDate: nextSat, toDate: addDays(nextSat, 200) })
      .expect(400);

    const res = await asA(request(app).post(path(token, "/away")))
      .send({ fromDate: nextSat, toDate: nextSun })
      .expect(201);
    expect(res.body.away).toEqual([{ id: expect.any(Number), fromDate: nextSat, toDate: nextSun }]);
    const awayId = res.body.away[0].id as number;

    // Another member's link can't remove it.
    await asA(
      request(app).delete(path(await tokenFor(other, "account"), `/away/${awayId}`)),
    ).expect(404);

    // Next weekend's send skips the away member and records No (U4).
    const [nextFixture] = await db
      .insert(fixturesTable)
      .values({
        tenantId: tenantA,
        grade: "A Grade",
        opponentName: "Baldivis",
        startAt: new Date(perthDayStart(nextSat).getTime() + 13 * 3_600_000),
      })
      .returning();
    const nextRound = await ensureRound(tenantA, nextSat);
    sms = [];
    email = [];
    const result = await runStep(tenantA, nextRound, "send", { smsEnabled: true }, new Date());
    expect(result?.away).toBe(1);
    expect(email.map((e) => e.to)).not.toContain(ADULT_EMAIL);
    expect(email.map((e) => e.to)).toContain(OTHER_EMAIL);
    const [recorded] = await db
      .select()
      .from(availabilityResponsesTable)
      .where(
        and(
          eq(availabilityResponsesTable.roundId, nextRound.id),
          eq(availabilityResponsesTable.memberId, adult),
        ),
      );
    expect(recorded).toMatchObject({ date: nextSat, status: "no" });

    const removed = await asA(request(app).delete(path(token, `/away/${awayId}`))).expect(200);
    expect(removed.body.away).toEqual([]);
    expect(
      await db.select().from(availabilityAwayTable).where(eq(availabilityAwayTable.id, awayId)),
    ).toHaveLength(0);
    await db.delete(fixturesTable).where(eq(fixturesTable.id, nextFixture.id));
  });
});
