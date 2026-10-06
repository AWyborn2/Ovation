import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
  squadMembersTable,
  availabilitySettingsTable,
  availabilityRoundsTable,
  availabilityRequestsTable,
  availabilityResponsesTable,
  availabilityAwayTable,
  fixturesTable,
  notificationsTable,
  selectionsTable,
  type SquadMemberRow,
} from "@workspace/db";
import { setEmailTransport, type EmailMessage } from "./integrations/email";
import { setSmsTransport, type SmsMessage } from "./integrations/sms";
import { purgeTestTenants } from "./tenant-purge.test-helpers";
import {
  DEFAULT_SCHEDULE,
  claimStep,
  datesForGrade,
  datesForMember,
  deliveryFailed,
  dueSteps,
  roundCounts,
  roundSlots,
  roundWeekendFor,
  runAvailabilitySchedule,
  setSendPaceMs,
  validateSchedule,
  type ScheduleSettings,
} from "./availability-schedule";

/**
 * The availability round (plan 2026-10-06-002 U4; R8, R9, R11, R19, KTD4,
 * KTD11, KTD12): pure, fixed-clock tests of which steps are due, then the
 * scheduler against the DB with fake SMS and email transports (nothing leaves
 * the process). Perth is UTC+8 with no daylight saving, so Monday 18:00 Perth
 * is Monday 10:00Z. The DB part needs DATABASE_URL with migrations applied.
 */

// Mon 18:00 send, Wed 18:00 reminder, Thu 18:00 cut-off, Fri 20:00 finalise-by.
const S: ScheduleSettings = DEFAULT_SCHEDULE;
const perth = (local: string) => new Date(`${local}+08:00`);
const NONE = { sendStartedAt: null, reminderStartedAt: null, cutoffStartedAt: null };

describe("roundWeekendFor / roundSlots", () => {
  it("defaults to Mon / Wed / Thu / Fri", () => {
    expect([S.sendDow, S.reminderDow, S.cutoffDow, S.finaliseDow]).toEqual([1, 3, 4, 5]);
  });

  it("the round is the first Saturday on or after this week's send day", () => {
    expect(roundWeekendFor(S, perth("2026-10-12T00:30:00"))).toBe("2026-10-17"); // Mon
    expect(roundWeekendFor(S, perth("2026-10-15T19:00:00"))).toBe("2026-10-17"); // Thu
    expect(roundWeekendFor(S, perth("2026-10-17T09:00:00"))).toBe("2026-10-17"); // Sat
    expect(roundWeekendFor(S, perth("2026-10-18T23:59:00"))).toBe("2026-10-17"); // Sun
    expect(roundWeekendFor(S, perth("2026-10-19T00:00:00"))).toBe("2026-10-24"); // next Mon
    // A Sunday send asks about the Saturday six days later.
    const sun = { ...S, sendDow: 0 };
    expect(roundWeekendFor(sun, perth("2026-10-11T20:00:00"))).toBe("2026-10-17");
    expect(roundWeekendFor(sun, perth("2026-10-17T20:00:00"))).toBe("2026-10-17");
  });

  it("places each step on its Perth day and time within the send week", () => {
    const slots = roundSlots(S, "2026-10-17");
    expect(slots.send.toISOString()).toBe("2026-10-12T10:00:00.000Z");
    expect(slots.reminder.toISOString()).toBe("2026-10-14T10:00:00.000Z");
    expect(slots.cutoff.toISOString()).toBe("2026-10-15T10:00:00.000Z");
    expect(slots.finalise.toISOString()).toBe("2026-10-16T12:00:00.000Z");
  });
});

describe("dueSteps (fixed clock)", () => {
  it("Mon 17:59 nothing; Mon 18:05 send; Mon 19:05 send doesn't repeat", () => {
    expect(dueSteps(S, perth("2026-10-12T17:59:00"), null)).toEqual([]);
    expect(dueSteps(S, perth("2026-10-12T18:05:00"), null)).toEqual(["send"]);
    const sent = { ...NONE, sendStartedAt: perth("2026-10-12T18:05:00") };
    expect(dueSteps(S, perth("2026-10-12T19:05:00"), sent)).toEqual([]);
  });

  it("reminder after its slot, then cut-off after its slot, each once", () => {
    const sent = { ...NONE, sendStartedAt: perth("2026-10-12T18:05:00") };
    expect(dueSteps(S, perth("2026-10-14T17:00:00"), sent)).toEqual([]);
    expect(dueSteps(S, perth("2026-10-14T18:01:00"), sent)).toEqual(["reminder"]);
    const reminded = { ...sent, reminderStartedAt: perth("2026-10-14T18:01:00") };
    expect(dueSteps(S, perth("2026-10-14T19:01:00"), reminded)).toEqual([]);
    expect(dueSteps(S, perth("2026-10-15T18:01:00"), reminded)).toEqual(["cutoff"]);
    const cut = { ...reminded, cutoffStartedAt: perth("2026-10-15T18:01:00") };
    expect(dueSteps(S, perth("2026-10-16T09:00:00"), cut)).toEqual([]);
  });

  it("a missed reminder is skipped once cut-off is due", () => {
    const sent = { ...NONE, sendStartedAt: perth("2026-10-12T18:05:00") };
    expect(dueSteps(S, perth("2026-10-15T18:30:00"), sent)).toEqual(["cutoff"]);
  });

  it("enabled late on Thursday after cut-off → send then cut-off, no reminder", () => {
    expect(dueSteps(S, perth("2026-10-15T19:00:00"), null)).toEqual(["send", "cutoff"]);
  });

  it("enabled after the reminder slot → send now, no reminder (it was sent after its slot)", () => {
    expect(dueSteps(S, perth("2026-10-14T19:00:00"), null)).toEqual(["send"]);
    const late = { ...NONE, sendStartedAt: perth("2026-10-14T19:00:00") };
    expect(dueSteps(S, perth("2026-10-14T20:00:00"), late)).toEqual([]);
  });

  it("never starts a round once its weekend has begun", () => {
    expect(dueSteps(S, perth("2026-10-17T08:00:00"), null)).toEqual([]);
    expect(dueSteps(S, perth("2026-10-18T20:00:00"), null)).toEqual([]);
    // A round already asked still drafts on a late tick before the weekend ends.
    const sent = { ...NONE, sendStartedAt: perth("2026-10-12T18:05:00") };
    expect(dueSteps(S, perth("2026-10-17T08:00:00"), sent)).toEqual(["cutoff"]);
  });
});

describe("validateSchedule", () => {
  it("accepts the defaults", () => {
    expect(validateSchedule(S)).toBeNull();
  });

  it("rejects a cut-off before the send", () => {
    expect(validateSchedule({ ...S, cutoffDow: 1, cutoffTime: "09:00" })).toMatch(/cut-off/i);
  });

  it("rejects a reminder outside send → cut-off, and a finalise-by before cut-off", () => {
    expect(validateSchedule({ ...S, reminderDow: 5 })).toMatch(/reminder/i);
    expect(validateSchedule({ ...S, reminderDow: 1, reminderTime: "18:00" })).toMatch(/reminder/i);
    expect(validateSchedule({ ...S, finaliseDow: 4, finaliseTime: "17:00" })).toMatch(/finalise/i);
  });

  it("rejects a cut-off after the weekend's Saturday, and bad times", () => {
    expect(validateSchedule({ ...S, cutoffDow: 0, finaliseDow: 0 })).toMatch(/Saturday/);
    expect(validateSchedule({ ...S, sendTime: "24:00" })).toMatch(/time/i);
    expect(validateSchedule({ ...S, sendDow: 7 })).toMatch(/day/i);
  });
});

describe("datesForGrade (KTD12)", () => {
  const fixtures = [
    { grade: "A Grade", startAt: perth("2026-10-17T13:00:00") },
    { grade: "B Grade", startAt: perth("2026-10-18T10:00:00") },
    { grade: "Under 15", startAt: perth("2026-10-17T08:00:00") },
  ];
  it("asks about the dates the member's grade plays", () => {
    expect(datesForGrade("A Grade", "senior", fixtures)).toEqual(["2026-10-17"]);
    expect(datesForGrade("B Grade", "senior", fixtures)).toEqual(["2026-10-18"]);
  });
  it("no known grade (or a grade without a fixture) → every date of the section", () => {
    expect(datesForGrade(null, "senior", fixtures)).toEqual(["2026-10-17", "2026-10-18"]);
    expect(datesForGrade("C Grade", "senior", fixtures)).toEqual(["2026-10-17", "2026-10-18"]);
    expect(datesForGrade(null, "junior", fixtures)).toEqual(["2026-10-17"]);
    expect(datesForGrade(null, "junior", [])).toEqual([]);
  });
});

describe("deliveryFailed", () => {
  it("failed when nothing was delivered and a channel failed (or the message never finished)", () => {
    expect(deliveryFailed({ smsResult: "failed", emailResult: "failed" })).toBe(true);
    expect(deliveryFailed({ smsResult: "off", emailResult: "failed" })).toBe(true);
    expect(deliveryFailed({ smsResult: null, emailResult: null })).toBe(true);
  });
  it("delivered on any channel, or nothing attemptable → not retried", () => {
    expect(deliveryFailed({ smsResult: "sent", emailResult: "failed" })).toBe(false);
    expect(deliveryFailed({ smsResult: "failed", emailResult: "sent" })).toBe(false);
    expect(deliveryFailed({ smsResult: "opted_out", emailResult: "no_contact" })).toBe(false);
    expect(deliveryFailed({ smsResult: "off", emailResult: "off" })).toBe(false);
  });
});

describe("runAvailabilitySchedule (DB, fake transports)", () => {
  const STAMP = Date.now();
  let tenantA: number;
  let tenantOff: number;
  let tenantRace: number;
  let tenantLate: number;
  let adult: SquadMemberRow;
  let flakyAdult: SquadMemberRow;
  let awayAdult: SquadMemberRow;
  let junior: SquadMemberRow;
  let inactive: SquadMemberRow;

  let sms: SmsMessage[] = [];
  let email: EmailMessage[] = [];
  let flaky = true;
  const FLAKY_EMAIL = "flaky.adult@example.com";
  const clear = () => {
    sms = [];
    email = [];
  };
  const quiet = { info: () => {}, warn: () => {}, error: () => {} };
  const tick = (tenantId: number, local: string) =>
    runAvailabilitySchedule(tenantId, perth(local), { logger: quiet });

  let clubSeq = 0;
  const newTenant = async (suffix: string, enabled: boolean | null) => {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `avs-${suffix}-${STAMP}`,
        centralClubId: 7_000_000 + (STAMP % 100_000) * 10 + clubSeq++,
        name: `Schedule ${suffix} CC`,
        plan: "pilot",
      })
      .returning();
    if (enabled != null) {
      await db.insert(availabilitySettingsTable).values({ tenantId: t.id, enabled });
    }
    // A Grade on Saturday and an under-15 side on Sunday of the round weekend.
    await db.insert(fixturesTable).values([
      {
        tenantId: t.id,
        grade: "A Grade",
        opponentName: "Mandurah",
        startAt: perth("2026-10-17T13:00:00"),
      },
      {
        tenantId: t.id,
        grade: "Under 15",
        opponentName: "Rockingham",
        startAt: perth("2026-10-18T08:30:00"),
      },
    ]);
    return t.id;
  };

  const newMember = async (
    tenantId: number,
    values: Partial<typeof squadMembersTable.$inferInsert>,
  ): Promise<SquadMemberRow> => {
    const [m] = await db
      .insert(squadMembersTable)
      .values({
        tenantId,
        firstName: "Pat",
        lastName: "Player",
        dateOfBirth: "1995-03-04",
        gradeHint: "A Grade",
        ...values,
      })
      .returning();
    return m;
  };

  const roundOf = async (tenantId: number) =>
    (
      await db
        .select()
        .from(availabilityRoundsTable)
        .where(eq(availabilityRoundsTable.tenantId, tenantId))
    )[0] ?? null;

  beforeAll(async () => {
    setSendPaceMs(0);
    process.env.PLATFORM_BASE_DOMAIN = "ovation.test";
    setSmsTransport(async (m) => {
      sms.push(m);
    });
    setEmailTransport(async (m) => {
      if (flaky && m.to === FLAKY_EMAIL) throw new Error("mailbox unavailable");
      email.push(m);
    });

    tenantA = await newTenant("a", true);
    tenantOff = await newTenant("off", false);
    tenantRace = await newTenant("race", true);
    tenantLate = await newTenant("late", true);

    adult = await newMember(tenantA, {
      firstName: "Alex",
      accountHolderName: "Alex Player",
      accountHolderMobile: "0412 000 001",
      accountHolderEmail: "alex@example.com",
    });
    flakyAdult = await newMember(tenantA, {
      firstName: "Flynn",
      accountHolderName: "Flynn Player",
      accountHolderEmail: FLAKY_EMAIL,
    });
    awayAdult = await newMember(tenantA, {
      firstName: "Avery",
      accountHolderName: "Avery Player",
      accountHolderEmail: "avery@example.com",
    });
    junior = await newMember(tenantA, {
      firstName: "Jules",
      section: "junior",
      dateOfBirth: "2012-02-02",
      gradeHint: "Under 15",
      guardian1Name: "Gail",
      guardian1Email: "gail@example.com",
      guardian2Name: "Glen",
      guardian2Mobile: "0412 000 003",
    });
    inactive = await newMember(tenantA, {
      firstName: "Ina",
      active: false,
      accountHolderEmail: "ina@example.com",
    });
    await newMember(tenantOff, { accountHolderEmail: "off@example.com" });
    await newMember(tenantRace, { firstName: "Rae", accountHolderEmail: "rae@example.com" });
    await newMember(tenantLate, { firstName: "Lee", accountHolderEmail: "lee@example.com" });
    // Away from Friday to Monday: the whole round weekend (R11).
    await db.insert(availabilityAwayTable).values({
      tenantId: tenantA,
      memberId: awayAdult.id,
      fromDate: "2026-10-16",
      toDate: "2026-10-19",
    });
  });

  afterAll(async () => {
    setSmsTransport(null);
    setEmailTransport(null);
    setSendPaceMs(250);
    await purgeTestTenants([tenantA, tenantOff, tenantRace, tenantLate]);
  });

  it("a disabled club gets no round and no messages (KTD11)", async () => {
    clear();
    const summary = await tick(tenantOff, "2026-10-15T19:00:00");
    expect(summary.enabled).toBe(false);
    expect(await roundOf(tenantOff)).toBeNull();
    expect(sms.length + email.length).toBe(0);
  });

  it("Mon 17:59 does nothing and creates no round", async () => {
    clear();
    const summary = await tick(tenantA, "2026-10-12T17:59:00");
    expect(summary.ran).toEqual([]);
    expect(await roundOf(tenantA)).toBeNull();
    expect(sms.length + email.length).toBe(0);
  });

  it("Mon 18:05 sends: active members asked, the away member recorded No, a failure doesn't stop the rest", async () => {
    clear();
    const summary = await tick(tenantA, "2026-10-12T18:05:00");
    expect(summary.ran).toEqual(["send"]);
    expect(summary.results[0]).toMatchObject({ messaged: 3, away: 1 });
    const round = await roundOf(tenantA);
    expect(round?.weekendDate).toBe("2026-10-17");
    expect(round?.sendStartedAt).not.toBeNull();
    expect(round?.sendCompletedAt).not.toBeNull();

    expect(email.map((m) => m.to).sort()).toEqual(["alex@example.com", "gail@example.com"]);
    expect(sms.map((m) => m.to).sort()).toEqual(["+61412000001", "+61412000003"]);
    const all = JSON.stringify([...sms, ...email]);
    expect(all).not.toContain("avery@example.com");
    expect(all).not.toContain("ina@example.com");

    // The away member answers No for the date they'd be asked about (R11).
    const away = await db
      .select()
      .from(availabilityResponsesTable)
      .where(eq(availabilityResponsesTable.memberId, awayAdult.id));
    expect(away.map((r) => [r.date, r.status, r.respondedBySlot])).toEqual([
      ["2026-10-17", "no", null],
    ]);
    const [flakyReq] = await db
      .select()
      .from(availabilityRequestsTable)
      .where(eq(availabilityRequestsTable.memberId, flakyAdult.id));
    expect(flakyReq.emailResult).toBe("failed");
    expect(
      await db
        .select()
        .from(availabilityRequestsTable)
        .where(eq(availabilityRequestsTable.memberId, inactive.id)),
    ).toEqual([]);
  });

  it("Mon 19:05 doesn't repeat the send and re-attempts only the failed recipient", async () => {
    clear();
    flaky = false;
    const summary = await tick(tenantA, "2026-10-12T19:05:00");
    expect(summary.ran).toEqual([]);
    expect(summary.retried).toBe(1);
    expect(email.map((m) => m.to)).toEqual([FLAKY_EMAIL]);
    expect(sms).toEqual([]);
  });

  it("once delivered, a recipient is not sent again", async () => {
    clear();
    const summary = await tick(tenantA, "2026-10-12T20:05:00");
    expect(summary.retried).toBe(0);
    expect(sms.length + email.length).toBe(0);
  });

  it("the reminder goes only to members without any response", async () => {
    const round = (await roundOf(tenantA))!;
    await db.insert(availabilityResponsesTable).values({
      tenantId: tenantA,
      roundId: round.id,
      memberId: adult.id,
      date: "2026-10-17",
      status: "yes",
      respondedBySlot: "account",
    });
    clear();
    const summary = await tick(tenantA, "2026-10-14T18:05:00");
    expect(summary.ran).toEqual(["reminder"]);
    expect(email.map((m) => m.to).sort()).toEqual([FLAKY_EMAIL, "gail@example.com"]);
    expect(sms.map((m) => m.to)).toEqual(["+61412000003"]);
    expect(email.every((m) => /reminder/i.test(m.subject))).toBe(true);
  });

  it("cut-off drafts each fixture and tells the staff (R19); the round records cut-off completion", async () => {
    clear();
    const summary = await tick(tenantA, "2026-10-15T18:05:00");
    expect(summary.ran).toEqual(["cutoff"]);
    expect(summary.results[0].drafts).toBe(2);
    const round = (await roundOf(tenantA))!;
    expect(round.cutoffCompletedAt).not.toBeNull();
    const notes = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.tenantId, tenantA),
          eq(notificationsTable.kind, "selection_drafts_ready"),
        ),
      );
    expect(notes).toHaveLength(1);
    expect(await roundCounts(tenantA, round.id)).toMatchObject({
      yes: 1,
      no: 1,
      none: 2,
      total: 4,
    });
    // Nothing more on later ticks.
    clear();
    expect((await tick(tenantA, "2026-10-15T19:05:00")).ran).toEqual([]);
    expect(sms.length + email.length).toBe(0);
  });

  it("two concurrent ticks for the same round send exactly once", async () => {
    clear();
    const [a, b] = await Promise.all([
      tick(tenantRace, "2026-10-12T18:05:00"),
      tick(tenantRace, "2026-10-12T18:05:00"),
    ]);
    expect([...a.ran, ...b.ran]).toEqual(["send"]);
    expect(email.map((m) => m.to)).toEqual(["rae@example.com"]);
    const round = (await roundOf(tenantRace))!;
    expect(await claimStep(tenantRace, round.id, "send", perth("2026-10-12T18:10:00"))).toBe(false);
  });

  it("a club enabled on Thursday after cut-off sends, then drafts, in that order", async () => {
    clear();
    const summary = await tick(tenantLate, "2026-10-15T19:00:00");
    expect(summary.ran).toEqual(["send", "cutoff"]);
    expect(email.map((m) => m.to)).toEqual(["lee@example.com"]);
    expect(
      await db.select().from(selectionsTable).where(eq(selectionsTable.tenantId, tenantLate)),
    ).toHaveLength(2);
  });

  it("datesForMember reads the member's grade (KTD12)", async () => {
    const round = (await roundOf(tenantA))!;
    expect(await datesForMember(tenantA, round, adult)).toEqual(["2026-10-17"]);
    expect(await datesForMember(tenantA, round, junior)).toEqual(["2026-10-18"]);
  });
});
