import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  captainsTable,
  squadMembersTable,
  fixturesTable,
  availabilityRequestsTable,
} from "@workspace/db";
import {
  SESSION_COOKIE,
  CAPTAIN_SESSION_COOKIE,
  encodeSession,
  encodeCaptainSession,
} from "../lib/auth";
import { setEmailTransport, type EmailMessage } from "../lib/integrations/email";
import { setSmsTransport, type SmsMessage } from "../lib/integrations/sms";
import { roundWeekendFor, setSendPaceMs } from "../lib/availability-schedule";
import { perthDayStart } from "../lib/availability-grades";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";

/**
 * Availability settings and "Run now" (plan 2026-10-06-002 U4; R8, R28, KTD4,
 * KTD11). Real-DB integration test (needs DATABASE_URL) with fake SMS and
 * email transports — nothing leaves the process.
 */

const STAMP = Date.now();

const VALID = {
  enabled: true,
  smsEnabled: true,
  sendDow: 1,
  sendTime: "18:00",
  reminderDow: 3,
  reminderTime: "18:00",
  cutoffDow: 4,
  cutoffTime: "18:00",
  finaliseDow: 5,
  finaliseTime: "20:00",
  selectionRule: "captains_own_grade",
};

describe("availability settings API", () => {
  let tenantA: number;
  let tenantB: number;
  let cookieA: string;
  let cookieB: string;
  let captainCookieA: string;
  let email: EmailMessage[] = [];
  let sms: SmsMessage[] = [];

  const as = (cookie: string, tenantId: number) => ({
    get: (path: string) =>
      request(app).get(path).set("Cookie", cookie).set("x-tenant-id", String(tenantId)),
    put: (path: string, body: object) =>
      request(app).put(path).set("Cookie", cookie).set("x-tenant-id", String(tenantId)).send(body),
    post: (path: string) =>
      request(app).post(path).set("Cookie", cookie).set("x-tenant-id", String(tenantId)),
  });

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-availability";
    process.env.PLATFORM_BASE_DOMAIN = "ovation.test";
    setSendPaceMs(0);
    setSmsTransport(async (m) => {
      sms.push(m);
    });
    setEmailTransport(async (m) => {
      email.push(m);
    });
    const [a] = await db
      .insert(tenantsTable)
      .values({ slug: `avset-a-${STAMP}`, centralClubId: 9401, name: "Avail A", plan: "pilot" })
      .returning();
    const [b] = await db
      .insert(tenantsTable)
      .values({ slug: `avset-b-${STAMP}`, centralClubId: 9402, name: "Avail B", plan: "pilot" })
      .returning();
    tenantA = a.id;
    tenantB = b.id;
    const admin = async (tenantId: number, name: string) => {
      const [row] = await db
        .insert(adminsTable)
        .values({ tenantId, username: `${name}_${STAMP}`, displayName: name, passwordHash: "x" })
        .returning();
      return `${SESSION_COOKIE}=${encodeSession({ adminId: row.id, issuedAt: Date.now() })}`;
    };
    cookieA = await admin(tenantA, "avset_a");
    cookieB = await admin(tenantB, "avset_b");
    const [cap] = await db
      .insert(captainsTable)
      .values({ tenantId: tenantA, username: "avskip", displayName: "Skip", passwordHash: "x" })
      .returning();
    captainCookieA = `${CAPTAIN_SESSION_COOKIE}=${encodeCaptainSession({
      captainId: cap.id,
      issuedAt: Date.now(),
    })}`;

    // A fixture on the current round's Saturday, whatever day the test runs.
    const weekend = roundWeekendFor({ sendDow: 1 }, new Date());
    await db.insert(fixturesTable).values({
      tenantId: tenantA,
      grade: "A Grade",
      opponentName: "Mandurah",
      startAt: new Date(perthDayStart(weekend).getTime() + 13 * 3_600_000),
    });
    await db.insert(squadMembersTable).values([
      {
        tenantId: tenantA,
        firstName: "Alex",
        lastName: "Player",
        dateOfBirth: "1995-03-04",
        gradeHint: "A Grade",
        accountHolderEmail: "alex@example.com",
      },
      {
        tenantId: tenantA,
        firstName: "Sam",
        lastName: "Player",
        dateOfBirth: "1994-03-04",
        gradeHint: "A Grade",
        accountHolderEmail: "sam@example.com",
        accountHolderMobile: "0412 000 009",
      },
    ]);
  });

  afterAll(async () => {
    setSmsTransport(null);
    setEmailTransport(null);
    setSendPaceMs(250);
    await purgeTestTenants([tenantA, tenantB]);
  });

  it("rejects anyone but the club's admin (401)", async () => {
    expect(
      (await request(app).get("/api/availability/settings").set("x-tenant-id", String(tenantA)))
        .status,
    ).toBe(401);
    expect((await as(captainCookieA, tenantA).get("/api/availability/settings")).status).toBe(401);
    expect(
      (await as(captainCookieA, tenantA).put("/api/availability/settings", VALID)).status,
    ).toBe(401);
    expect(
      (await as(captainCookieA, tenantA).post("/api/availability/rounds/current/send")).status,
    ).toBe(401);
    // Another club's admin on this club's host.
    expect((await as(cookieB, tenantA).get("/api/availability/settings")).status).toBe(401);
  });

  it("a club that never saved gets the defaults, switched off", async () => {
    const res = await as(cookieA, tenantA).get("/api/availability/settings");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      enabled: false,
      sendDow: 1,
      reminderDow: 3,
      cutoffDow: 4,
      finaliseDow: 5,
      updatedAt: null,
    });
  });

  it("PUT with the cut-off before the send → 400 with a clear message", async () => {
    const res = await as(cookieA, tenantA).put("/api/availability/settings", {
      ...VALID,
      cutoffDow: 1,
      cutoffTime: "09:00",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cut-off must come after the send/i);
    const bad = await as(cookieA, tenantA).put("/api/availability/settings", {
      ...VALID,
      sendTime: "6pm",
    });
    expect(bad.status).toBe(400);
  });

  it("Run now refuses while the club is switched off", async () => {
    const res = await as(cookieA, tenantA).post("/api/availability/rounds/current/send");
    expect(res.status).toBe(400);
    expect(email.length + sms.length).toBe(0);
  });

  it("PUT saves, and the save is the club's own (tenant isolation)", async () => {
    const res = await as(cookieA, tenantA).put("/api/availability/settings", VALID);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: true, sendTime: "18:00" });
    expect(res.body.updatedAt).not.toBeNull();
    expect((await as(cookieA, tenantA).get("/api/availability/settings")).body.enabled).toBe(true);
    const other = await as(cookieB, tenantB).get("/api/availability/settings");
    expect(other.body).toMatchObject({ enabled: false, updatedAt: null });
  });

  it("remind before the send → 409", async () => {
    const res = await as(cookieA, tenantA).post("/api/availability/rounds/current/remind");
    expect(res.status).toBe(409);
  });

  it("Run now send goes once; a second send → 409", async () => {
    const res = await as(cookieA, tenantA).post("/api/availability/rounds/current/send");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ step: "send", messaged: 2 });
    expect(email.map((m) => m.to).sort()).toEqual(["alex@example.com", "sam@example.com"]);
    email = [];
    sms = [];
    const again = await as(cookieA, tenantA).post("/api/availability/rounds/current/send");
    expect(again.status).toBe(409);
    expect(email.length + sms.length).toBe(0);
  });

  it("a manual remind goes to non-responders; a second within 12 hours sends nothing", async () => {
    email = [];
    sms = [];
    const first = await as(cookieA, tenantA).post("/api/availability/rounds/current/remind");
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ step: "remind", messaged: 2, throttled: 0 });
    expect(email).toHaveLength(2);
    const stamped = await db
      .select()
      .from(availabilityRequestsTable)
      .where(eq(availabilityRequestsTable.tenantId, tenantA));
    expect(stamped.every((r) => r.lastManualReminderAt != null)).toBe(true);

    email = [];
    sms = [];
    const second = await as(cookieA, tenantA).post("/api/availability/rounds/current/remind");
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ messaged: 0, throttled: 2 });
    expect(email.length + sms.length).toBe(0);
  });

  it("GET the current round: stage times and counts; the other club sees none of it", async () => {
    const res = await as(cookieA, tenantA).get("/api/availability/rounds/current");
    expect(res.status).toBe(200);
    expect(res.body.roundId).not.toBeNull();
    expect(res.body.sendStartedAt).not.toBeNull();
    expect(res.body.cutoffStartedAt).toBeNull();
    expect(res.body.counts).toMatchObject({ yes: 0, none: 2, total: 2 });
    const other = await as(cookieB, tenantB).get("/api/availability/rounds/current");
    expect(other.body).toMatchObject({ enabled: false, roundId: null });
    expect(other.body.counts.total).toBe(0);
    // And tenant B can't run tenant A's round.
    expect(
      (await as(cookieB, tenantB).post("/api/availability/rounds/current/cutoff")).status,
    ).toBe(400);
  });

  it("Run now cut-off drafts the side, then 409 on a repeat", async () => {
    const res = await as(cookieA, tenantA).post("/api/availability/rounds/current/cutoff");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ step: "cutoff", drafts: 1 });
    expect(
      (await as(cookieA, tenantA).post("/api/availability/rounds/current/cutoff")).status,
    ).toBe(409);
  });
});
