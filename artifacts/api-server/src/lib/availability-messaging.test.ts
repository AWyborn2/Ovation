import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  db,
  tenantsTable,
  squadMembersTable,
  availabilityRoundsTable,
  availabilityRequestsTable,
  availabilityTokensTable,
  notificationsTable,
  socialSettingsTable,
  type SquadMemberRow,
} from "@workspace/db";
import { setEmailTransport, type EmailMessage } from "./integrations/email";
import {
  setSmsTransport,
  SmsTransportError,
  isGsm7,
  gsm7Length,
  type SmsMessage,
} from "./integrations/sms";
import {
  buildMessage,
  formatMatchTime,
  isUnder18,
  messageMember,
  notifyStaff,
  recipientsFor,
} from "./availability-messaging";
import {
  availabilityLink,
  defaultTokenExpiry,
  mintRequestToken,
  resolveAvailabilityToken,
  revokeOtherTokens,
} from "./availability-tokens";
import { purgeTestTenants } from "./tenant-purge.test-helpers";

/**
 * Member messaging for the availability round (plan 2026-10-06-002 U2):
 * contact routing by age (R5), SMS switch (R14), STOP opt-out (R13), delivery
 * recorded per recipient, fresh hashed tokens per message (KTD5), staff
 * notices, and no contact value in any log line (KTD3).
 *
 * Fake SMS and email transports throughout — nothing leaves the process. The
 * DB-backed parts need DATABASE_URL with migrations applied (CI's api-tests job
 * provides it).
 */

const STAMP = Date.now();
const NOW = new Date("2026-10-06T10:00:00Z");
const ADULT_MOBILE = "0412 345 678";
const ADULT_EMAIL = "pat.adult@example.com";

let smsSent: SmsMessage[] = [];
let emailSent: EmailMessage[] = [];

function useFakeTransports() {
  smsSent = [];
  emailSent = [];
  setSmsTransport(async (m) => {
    smsSent.push(m);
  });
  setEmailTransport(async (m) => {
    emailSent.push(m);
  });
}

/** A logger that keeps every call, so a test can search what would be logged. */
function captureLogger() {
  const lines: unknown[] = [];
  return {
    lines,
    logger: { warn: (obj: unknown, msg?: string) => lines.push({ obj, msg }) },
    text: () => JSON.stringify(lines),
  };
}

const savedEnv = {
  PLATFORM_BASE_DOMAIN: process.env.PLATFORM_BASE_DOMAIN,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_FROM: process.env.TWILIO_FROM,
  TWILIO_MESSAGING_SERVICE_SID: process.env.TWILIO_MESSAGING_SERVICE_SID,
};

function restoreEnv() {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

afterEach(() => {
  setSmsTransport(null);
  setEmailTransport(null);
});

describe("isUnder18 / recipientsFor (R5)", () => {
  const base = {
    id: 1,
    dateOfBirth: null,
    accountHolderName: "Pat",
    accountHolderMobile: "0400000001",
    accountHolderEmail: "acc@example.com",
    accountSmsOptOut: false,
    guardian1Name: "G1",
    guardian1Mobile: "0400000002",
    guardian1Email: null,
    guardian1SmsOptOut: false,
    guardian2Name: "G2",
    guardian2Mobile: null,
    guardian2Email: "g2@example.com",
    guardian2SmsOptOut: false,
  } as unknown as SquadMemberRow;

  it("counts age on Perth's date, and a missing date of birth as an adult", () => {
    expect(isUnder18("2011-05-01", NOW)).toBe(true);
    expect(isUnder18("2008-10-07", NOW)).toBe(true); // turns 18 tomorrow
    expect(isUnder18("2008-10-06", NOW)).toBe(false); // 18 today
    // 2026-10-05T17:00Z is already the 6th in Perth.
    expect(isUnder18("2008-10-06", new Date("2026-10-05T17:00:00Z"))).toBe(false);
    expect(isUnder18(null, NOW)).toBe(false);
    expect(isUnder18("not a date", NOW)).toBe(false);
  });

  it("routes adults to the account holder and juniors to both guardians", () => {
    expect(recipientsFor({ ...base, dateOfBirth: "1990-01-01" }, NOW).map((r) => r.slot)).toEqual([
      "account",
    ]);
    expect(recipientsFor(base, NOW).map((r) => r.slot)).toEqual(["account"]);
    expect(recipientsFor({ ...base, dateOfBirth: "2011-05-01" }, NOW).map((r) => r.slot)).toEqual([
      "guardian1",
      "guardian2",
    ]);
  });

  it("skips a guardian slot with neither a mobile nor an email", () => {
    const junior = { ...base, dateOfBirth: "2011-05-01", guardian2Email: " " };
    expect(recipientsFor(junior, NOW).map((r) => r.slot)).toEqual(["guardian1"]);
  });
});

describe("message text", () => {
  const link = `https://hallshead.ovation.app/availability/${"x".repeat(43)}`;
  const ctx = { roundId: 1 };

  it("a request SMS carries the link and the STOP line within 160 GSM characters", () => {
    for (const self of [true, false]) {
      for (const kind of ["request", "reminder"] as const) {
        const { sms } = buildMessage({
          kind,
          clubShort: "Halls Head Cricket Club",
          clubName: "Halls Head Cricket Club",
          player: "Jordan",
          self,
          greetingName: "Sam",
          link,
          context: ctx,
        });
        expect(sms).toContain(link);
        expect(sms.endsWith("Reply STOP to opt out.")).toBe(true);
        expect(isGsm7(sms)).toBe(true);
        expect(gsm7Length(sms)).toBeLessThanOrEqual(160);
      }
    }
  });

  it("a selected message names the match, the role and the can't-make-it link", () => {
    const { sms, email } = buildMessage({
      kind: "selected",
      clubShort: "HHCC",
      clubName: "Halls Head Cricket Club",
      player: "Jordan",
      self: true,
      greetingName: "Jordan",
      link,
      context: {
        roundId: 1,
        role: "C/WK",
        fixture: {
          grade: "A Grade",
          opponentName: "Mandurah",
          startAt: new Date("2026-10-10T05:30:00Z"),
          venue: "Rushton Park",
        },
      },
    });
    expect(formatMatchTime(new Date("2026-10-10T05:30:00Z"))).toBe("Sat 10 Oct 1:30pm");
    expect(sms).toContain("A Grade v Mandurah, Sat 10 Oct 1:30pm");
    expect(sms).toContain("captain and keeper");
    expect(sms).toContain(link);
    expect(sms.endsWith("Reply STOP to opt out.")).toBe(true);
    expect(email.text).toContain("Rushton Park");
    expect(email.text).toContain(link);
  });
});

describe("messageMember / notifyStaff (DB)", () => {
  let tenantId: number;
  let otherTenantId: number;
  let roundId: number;
  let otherRoundId: number;
  // A realistic subdomain length, so the request SMS is tested as clubs see it.
  const slug = `tv${STAMP % 1_000_000}`;

  const newMember = async (overrides: Partial<typeof squadMembersTable.$inferInsert> = {}) => {
    const [m] = await db
      .insert(squadMembersTable)
      .values({
        tenantId,
        firstName: "Pat",
        lastName: "Adult",
        dateOfBirth: "1995-03-04",
        accountHolderName: "Pat Adult",
        accountHolderMobile: ADULT_MOBILE,
        accountHolderEmail: ADULT_EMAIL,
        ...overrides,
      })
      .returning();
    return m;
  };

  const requestRows = (memberId: number) =>
    db
      .select()
      .from(availabilityRequestsTable)
      .where(eq(availabilityRequestsTable.memberId, memberId));

  beforeAll(async () => {
    process.env.PLATFORM_BASE_DOMAIN = "ovation.test";
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug,
        centralClubId: 9_000_000 + (STAMP % 1_000_000),
        name: "Test Valley Cricket Club",
        shortName: "TVCC",
        plan: "pilot",
      })
      .returning();
    tenantId = t.id;
    const [o] = await db
      .insert(tenantsTable)
      .values({
        slug: `${slug}-other`,
        centralClubId: 8_000_000 + (STAMP % 1_000_000),
        name: "Other Cricket Club",
        plan: "pilot",
      })
      .returning();
    otherTenantId = o.id;
    const [r] = await db
      .insert(availabilityRoundsTable)
      .values({ tenantId, weekendDate: "2026-10-10" })
      .returning();
    roundId = r.id;
    const [r2] = await db
      .insert(availabilityRoundsTable)
      .values({ tenantId: otherTenantId, weekendDate: "2026-10-10" })
      .returning();
    otherRoundId = r2.id;
  });

  afterAll(async () => {
    restoreEnv();
    await purgeTestTenants([tenantId, otherTenantId]);
  });

  it("adult with mobile and email, SMS on → one SMS to the account mobile and one email", async () => {
    useFakeTransports();
    const member = await newMember();
    const out = await messageMember({
      tenantId,
      member,
      kind: "request",
      context: { roundId },
      smsEnabled: true,
      now: NOW,
    });
    expect(out.skipped).toEqual([]);
    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({ slot: "account", sms: "sent", email: "sent" });
    expect(smsSent).toHaveLength(1);
    expect(smsSent[0].to).toBe("+61412345678");
    expect(emailSent.map((e) => e.to)).toEqual([ADULT_EMAIL]);

    // The SMS names the club, carries a working personal link and the STOP line.
    const sms = smsSent[0].body;
    expect(sms.startsWith("TVCC")).toBe(true);
    expect(sms.endsWith("Reply STOP to opt out.")).toBe(true);
    expect(gsm7Length(sms)).toBeLessThanOrEqual(160);
    const match = /https:\/\/([^/\s]+)\/availability\/([A-Za-z0-9_-]+)/.exec(sms);
    expect(match?.[1]).toBe(`${slug}.ovation.test`);
    const resolved = await resolveAvailabilityToken(tenantId, match![2], NOW);
    expect(resolved?.member.id).toBe(member.id);
    expect(resolved?.request.recipientSlot).toBe("account");
    expect(emailSent[0].text).toContain(match![0]);
    expect(emailSent[0].subject).toContain("Test Valley Cricket Club");

    // One token per recipient per message, shared by its SMS and email; only
    // the hash is stored.
    const rows = await requestRows(member.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ smsResult: "sent", emailResult: "sent" });
    expect(rows[0].smsAt).not.toBeNull();
    const tokens = await db
      .select()
      .from(availabilityTokensTable)
      .where(eq(availabilityTokensTable.requestId, rows[0].id));
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).not.toBe(match![2]);
    expect(tokens[0].expiresAt.toISOString()).toBe(defaultTokenExpiry("2026-10-10").toISOString());
  });

  it("a later message reuses the request row and mints a fresh token (KTD5)", async () => {
    useFakeTransports();
    const member = await newMember({ firstName: "Again" });
    await messageMember({
      tenantId,
      member,
      kind: "request",
      context: { roundId },
      smsEnabled: true,
      now: NOW,
    });
    await messageMember({
      tenantId,
      member,
      kind: "reminder",
      context: { roundId },
      smsEnabled: true,
      now: NOW,
    });
    const rows = await requestRows(member.id);
    expect(rows).toHaveLength(1);
    const tokens = await db
      .select()
      .from(availabilityTokensTable)
      .where(eq(availabilityTokensTable.requestId, rows[0].id));
    expect(tokens).toHaveLength(2);
    expect(smsSent[1].body).toContain("reminder");
    expect(smsSent[0].body).not.toBe(smsSent[1].body);
  });

  it("member aged 15 → both guardians get SMS and email; the account holder gets nothing (AE6)", async () => {
    useFakeTransports();
    const member = await newMember({
      firstName: "Jordan",
      dateOfBirth: "2011-05-01",
      section: "junior",
      accountHolderMobile: "0499 999 999",
      accountHolderEmail: "account@example.com",
      guardian1Name: "Alex Parent",
      guardian1Mobile: "0411 111 111",
      guardian1Email: "g1@example.com",
      guardian2Name: "Sam Parent",
      guardian2Mobile: "0422 222 222",
      guardian2Email: "g2@example.com",
    });
    const out = await messageMember({
      tenantId,
      member,
      kind: "request",
      context: { roundId },
      smsEnabled: true,
      now: NOW,
    });
    expect(out.results.map((r) => [r.slot, r.sms, r.email])).toEqual([
      ["guardian1", "sent", "sent"],
      ["guardian2", "sent", "sent"],
    ]);
    expect(smsSent.map((m) => m.to).sort()).toEqual(["+61411111111", "+61422222222"]);
    expect(emailSent.map((m) => m.to).sort()).toEqual(["g1@example.com", "g2@example.com"]);
    expect(smsSent[0].body).toContain("Is Jordan available");
    expect(emailSent.find((e) => e.to === "g1@example.com")?.text).toMatch(/^Hi Alex Parent,/);
    const rows = await requestRows(member.id);
    expect(rows.map((r) => r.recipientSlot).sort()).toEqual(["guardian1", "guardian2"]);
  });

  it("a junior with one reachable guardian reports the other slot as skipped", async () => {
    useFakeTransports();
    const member = await newMember({
      dateOfBirth: "2012-01-01",
      guardian1Mobile: "0411 111 111",
      guardian2Mobile: null,
      guardian2Email: null,
    });
    const out = await messageMember({
      tenantId,
      member,
      kind: "request",
      context: { roundId },
      smsEnabled: true,
      now: NOW,
    });
    expect(out.results.map((r) => r.slot)).toEqual(["guardian1"]);
    expect(out.results[0].email).toBe("no_contact");
    expect(out.skipped).toEqual(["guardian2"]);
  });

  it("club SMS off → email only, SMS transport never called (R14)", async () => {
    useFakeTransports();
    const member = await newMember();
    const out = await messageMember({
      tenantId,
      member,
      kind: "request",
      context: { roundId },
      smsEnabled: false,
      now: NOW,
    });
    expect(out.results[0]).toMatchObject({ sms: "off", email: "sent" });
    expect(smsSent).toHaveLength(0);
    expect(emailSent).toHaveLength(1);
    const [row] = await requestRows(member.id);
    expect(row).toMatchObject({ smsResult: "off", emailResult: "sent" });
  });

  it("Twilio env vars missing → SMS disabled, no throw, email still sent", async () => {
    smsSent = [];
    emailSent = [];
    setSmsTransport(null);
    setEmailTransport(async (m) => {
      emailSent.push(m);
    });
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM;
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    const member = await newMember();
    const out = await messageMember({
      tenantId,
      member,
      kind: "request",
      context: { roundId },
      smsEnabled: true,
      now: NOW,
    });
    expect(out.results[0]).toMatchObject({ sms: "off", email: "sent" });
    restoreEnv();
    process.env.PLATFORM_BASE_DOMAIN = "ovation.test";
  });

  it("error 21610 → opted_out and flag set; the next message skips SMS but emails (R13)", async () => {
    emailSent = [];
    let smsCalls = 0;
    setSmsTransport(async () => {
      smsCalls++;
      throw new SmsTransportError("Attempt to send to unsubscribed recipient", 21610);
    });
    setEmailTransport(async (m) => {
      emailSent.push(m);
    });
    const member = await newMember();
    const first = await messageMember({
      tenantId,
      member,
      kind: "request",
      context: { roundId },
      smsEnabled: true,
      now: NOW,
    });
    expect(first.results[0]).toMatchObject({ sms: "opted_out", email: "sent" });
    expect(smsCalls).toBe(1);
    const [flagged] = await db
      .select()
      .from(squadMembersTable)
      .where(eq(squadMembersTable.id, member.id));
    expect(flagged.accountSmsOptOut).toBe(true);
    expect(flagged.guardian1SmsOptOut).toBe(false);

    // The caller still holds the stale row; the flag is honoured anyway.
    const second = await messageMember({
      tenantId,
      member,
      kind: "reminder",
      context: { roundId },
      smsEnabled: true,
      now: NOW,
    });
    expect(second.results[0]).toMatchObject({ sms: "opted_out", email: "sent" });
    expect(smsCalls).toBe(1);
    expect(emailSent).toHaveLength(2);
  });

  it("a failed send never logs the mobile or the email (KTD3)", async () => {
    const mobile = "0433 555 777";
    const email = "private.person@example.com";
    setSmsTransport(async (m) => {
      throw new SmsTransportError(`The 'To' number ${m.to} is not a valid phone number.`, 21211);
    });
    setEmailTransport(async (m) => {
      throw new Error(`Resend rejected ${m.to}`);
    });
    const member = await newMember({ accountHolderMobile: mobile, accountHolderEmail: email });
    const cap = captureLogger();
    const out = await messageMember(
      { tenantId, member, kind: "request", context: { roundId }, smsEnabled: true, now: NOW },
      cap.logger,
    );
    expect(out.results[0]).toMatchObject({ sms: "failed", email: "failed" });
    expect(cap.lines.length).toBeGreaterThanOrEqual(2);
    const logged = cap.text();
    for (const needle of [mobile, "0433555777", "+61433555777", "433555777", email]) {
      expect(logged).not.toContain(needle);
    }
    expect(logged).toContain(`"memberId":${member.id}`);
    expect(logged).toContain('"slot":"account"');
    const [row] = await requestRows(member.id);
    expect(row).toMatchObject({ smsResult: "failed", emailResult: "failed" });
  });

  it("an unparseable number is skipped and reported; the email still goes", async () => {
    useFakeTransports();
    const member = await newMember({ accountHolderMobile: "call the clubhouse" });
    const cap = captureLogger();
    const out = await messageMember(
      { tenantId, member, kind: "request", context: { roundId }, smsEnabled: true, now: NOW },
      cap.logger,
    );
    expect(out.results[0]).toMatchObject({ sms: "invalid_number", email: "sent" });
    expect(smsSent).toHaveLength(0);
    expect(cap.text()).not.toContain("clubhouse");
    const [row] = await requestRows(member.id);
    expect(row.smsResult).toBe("invalid_number");
  });

  it("selected and deselected messages carry the match and a fresh link", async () => {
    useFakeTransports();
    const member = await newMember({ firstName: "Taylor" });
    const fixture = {
      grade: "B Grade",
      opponentName: "Rockingham",
      startAt: new Date("2026-10-10T04:00:00Z"),
      venue: "Halls Head Oval",
    };
    const sel = await messageMember({
      tenantId,
      member,
      kind: "selected",
      context: { roundId, fixture, role: "WK" },
      smsEnabled: true,
      now: NOW,
    });
    expect(sel.results[0]).toMatchObject({ sms: "sent", email: "sent" });
    expect(smsSent[0].body).toContain("You're selected (keeper) for B Grade v Rockingham");
    expect(smsSent[0].body).toMatch(/\/availability\/[A-Za-z0-9_-]+ Reply STOP to opt out\.$/);
    await messageMember({
      tenantId,
      member,
      kind: "deselected",
      context: { roundId, fixture },
      smsEnabled: true,
      now: NOW,
    });
    expect(smsSent[1].body).toContain("no longer in the B Grade side on Sat 10 Oct");
    expect(emailSent[1].subject).toContain("B Grade");
  });

  it("contact_changed goes only to the previous contact, with no link or request row", async () => {
    useFakeTransports();
    const member = await newMember({
      accountHolderMobile: "0400 000 999",
      accountHolderEmail: "new@example.com",
    });
    const out = await messageMember({
      tenantId,
      member,
      kind: "contact_changed",
      context: { previous: { slot: "account", mobile: "0411 000 111", email: "old@example.com" } },
      smsEnabled: true,
      now: NOW,
    });
    expect(out.results[0]).toMatchObject({ slot: "account", requestId: null, sms: "sent" });
    expect(smsSent.map((m) => m.to)).toEqual(["+61411000111"]);
    expect(emailSent.map((m) => m.to)).toEqual(["old@example.com"]);
    expect(smsSent[0].body).not.toContain("/availability/");
    expect(smsSent[0].body.endsWith("Reply STOP to opt out.")).toBe(true);
    expect(await requestRows(member.id)).toHaveLength(0);
  });

  it("another tenant's member is a no-op", async () => {
    useFakeTransports();
    const member = await newMember();
    const out = await messageMember({
      tenantId: otherTenantId,
      member,
      kind: "request",
      context: { roundId: otherRoundId },
      smsEnabled: true,
      now: NOW,
    });
    expect(out).toEqual({ results: [], skipped: [] });
    expect(smsSent).toHaveLength(0);
    expect(emailSent).toHaveLength(0);
  });

  describe("tokens (KTD5)", () => {
    let requestId: number;
    let memberId: number;

    beforeAll(async () => {
      const member = await newMember({ firstName: "Token" });
      memberId = member.id;
      const [req] = await db
        .insert(availabilityRequestsTable)
        .values({ tenantId, roundId, memberId, recipientSlot: "account" })
        .returning();
      requestId = req.id;
    });

    it("mints, resolves, and refuses another tenant, expiry and revocation", async () => {
      const expiresAt = new Date("2026-10-13T00:00:00+08:00");
      const a = await mintRequestToken({ tenantId, requestId, expiresAt });
      const b = await mintRequestToken({ tenantId, requestId, expiresAt });
      expect(a.token).not.toBe(b.token);
      expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const ra = await resolveAvailabilityToken(tenantId, a.token, NOW);
      expect(ra).toMatchObject({
        request: { id: requestId },
        member: { id: memberId },
        round: { id: roundId },
      });
      expect(await resolveAvailabilityToken(otherTenantId, a.token, NOW)).toBeNull();
      expect(await resolveAvailabilityToken(tenantId, "nope", NOW)).toBeNull();
      expect(await resolveAvailabilityToken(tenantId, "", NOW)).toBeNull();
      // Expiry is exclusive.
      expect(await resolveAvailabilityToken(tenantId, a.token, expiresAt)).toBeNull();

      // Revoke every live token but the one in use.
      const revoked = await revokeOtherTokens({ tenantId, requestId, keepTokenId: b.tokenId });
      expect(revoked).toBeGreaterThanOrEqual(1);
      expect(await resolveAvailabilityToken(tenantId, a.token, NOW)).toBeNull();
      expect((await resolveAvailabilityToken(tenantId, b.token, NOW))?.token.id).toBe(b.tokenId);
      // Another tenant can't revoke this tenant's tokens.
      expect(await revokeOtherTokens({ tenantId: otherTenantId, requestId })).toBe(0);
      expect(await resolveAvailabilityToken(tenantId, b.token, NOW)).not.toBeNull();
    });

    it("builds links on the club's own host (custom domain wins)", () => {
      expect(availabilityLink({ slug: "hallshead", customDomain: null }, "abc")).toBe(
        "https://hallshead.ovation.test/availability/abc",
      );
      expect(availabilityLink({ slug: "hallshead", customDomain: "stats.hhcc.au" }, "abc")).toBe(
        "https://stats.hhcc.au/availability/abc",
      );
    });

    it("the default expiry is the end of the day after the weekend, Perth time", () => {
      expect(defaultTokenExpiry("2026-10-10").toISOString()).toBe("2026-10-12T16:00:00.000Z");
    });
  });

  it("notifyStaff writes the notification and emails the club address", async () => {
    useFakeTransports();
    await db
      .insert(socialSettingsTable)
      .values({ tenantId, notificationEmail: "committee@example.com" });
    const row = await notifyStaff({
      tenantId,
      kind: "selection_drafts_ready",
      title: "Draft sides are ready",
      body: "3 grades have draft sides.",
      link: "/admin/selection",
    });
    expect(row).toMatchObject({
      tenantId,
      kind: "selection_drafts_ready",
      link: "/admin/selection",
    });
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(and(eq(notificationsTable.tenantId, tenantId), eq(notificationsTable.id, row.id)));
    expect(rows).toHaveLength(1);
    expect(emailSent).toEqual([
      {
        to: "committee@example.com",
        subject: "Draft sides are ready",
        text: "3 grades have draft sides.\n\n/admin/selection",
      },
    ]);
  });

  it("notifyStaff still writes the notification when the email fails", async () => {
    setEmailTransport(async () => {
      throw new Error("committee@example.com bounced");
    });
    const cap = captureLogger();
    const row = await notifyStaff(
      {
        tenantId,
        kind: "selection_slot_reopened",
        title: "A slot re-opened",
        body: "Taylor can't make it.",
        link: "/admin/selection",
      },
      cap.logger,
    );
    expect(row.kind).toBe("selection_slot_reopened");
    expect(cap.text()).not.toContain("committee@example.com");
  });
});
