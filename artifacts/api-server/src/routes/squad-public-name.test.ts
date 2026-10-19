import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  captainsTable,
  captainGradePermissionsTable,
  availabilityRoundsTable,
  fixturesTable,
  selectionsTable,
  squadMembersTable,
  teamListsTable,
} from "@workspace/db";
import {
  SESSION_COOKIE,
  CAPTAIN_SESSION_COOKIE,
  encodeSession,
  encodeCaptainSession,
} from "../lib/auth";
import { setEmailTransport } from "../lib/integrations/email";
import { setSmsTransport } from "../lib/integrations/sms";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import { pinClockMidWeek } from "../lib/mid-week-clock.test-helpers";
import { perthDayStart } from "../lib/availability-grades";
import { DEFAULT_SCHEDULE, roundWeekendFor } from "../lib/availability-schedule";

/**
 * The per-player "show name publicly" toggle (ADR-008 §5): an admin-only edit
 * through `PATCH /squad/:id`, stamped with who and when; ignored for a junior
 * or under-18 member; tenant-scoped. A private member is "Private Player" on
 * the published team list unless the toggle is on. Real-DB integration test
 * (needs DATABASE_URL with migrations applied).
 */

const STAMP = Date.now();

describe("show name publicly", () => {
  let tenantA = 0;
  let tenantB = 0;
  let adminA = "";
  let adminB = "";
  let captainA = "";
  let priv = 0;
  let pub = 0;
  let junior = 0;
  let under18 = 0;
  let sideId = 0;
  let fixtureId = 0;

  const asA = (r: request.Test) => r.set("x-tenant-id", String(tenantA));
  const patch = (cookie: string, id: number, body: Record<string, unknown>) =>
    asA(request(app).patch(`/api/squad/${id}`).set("Cookie", cookie)).send(body);
  const member = async (id: number) =>
    (await db.select().from(squadMembersTable).where(eq(squadMembersTable.id, id)))[0];

  /** Finalise the side (re-opening it first when needed); the published names. */
  async function publish(): Promise<string[]> {
    const [side] = await db.select().from(selectionsTable).where(eq(selectionsTable.id, sideId));
    if (side.state === "final") {
      await asA(request(app).post(`/api/selection/${sideId}/reopen`).set("Cookie", adminA)).expect(
        200,
      );
    }
    const [open] = await db.select().from(selectionsTable).where(eq(selectionsTable.id, sideId));
    await asA(request(app).post(`/api/selection/${sideId}/finalise`).set("Cookie", adminA))
      .send({ version: open.version })
      .expect(200);
    const [list] = await db
      .select()
      .from(teamListsTable)
      .where(and(eq(teamListsTable.tenantId, tenantA), eq(teamListsTable.fixtureId, fixtureId)));
    return [...list.players].sort((a, b) => a.order - b.order).map((p) => p.displayName);
  }

  beforeAll(async () => {
    pinClockMidWeek();
    setSmsTransport(async () => {});
    setEmailTransport(async () => {});
    const tenants = await db
      .insert(tenantsTable)
      .values([
        {
          slug: `pub-name-a-${STAMP}`,
          centralClubId: 7_800_000 + (STAMP % 100_000) * 10,
          name: "Names A",
          plan: "pilot",
        },
        {
          slug: `pub-name-b-${STAMP}`,
          centralClubId: 7_800_001 + (STAMP % 100_000) * 10,
          name: "Names B",
          plan: "pilot",
        },
      ])
      .returning();
    [tenantA, tenantB] = tenants.map((t) => t.id);
    const admins = await db
      .insert(adminsTable)
      .values([
        {
          tenantId: tenantA,
          username: `pn_a_${STAMP}`,
          displayName: "Pat Admin",
          passwordHash: "x",
        },
        {
          tenantId: tenantB,
          username: `pn_b_${STAMP}`,
          displayName: "Bo Admin",
          passwordHash: "x",
        },
      ])
      .returning();
    adminA = `${SESSION_COOKIE}=${encodeSession({ adminId: admins[0].id, issuedAt: Date.now() })}`;
    adminB = `${SESSION_COOKIE}=${encodeSession({ adminId: admins[1].id, issuedAt: Date.now() })}`;
    const [cap] = await db
      .insert(captainsTable)
      .values({
        tenantId: tenantA,
        username: `pn_cap_${STAMP}`,
        displayName: "Cy Captain",
        passwordHash: "x",
      })
      .returning();
    await db.insert(captainGradePermissionsTable).values({ captainId: cap.id, grade: "A Grade" });
    captainA = `${CAPTAIN_SESSION_COOKIE}=${encodeCaptainSession({ captainId: cap.id, issuedAt: Date.now() })}`;

    const rows = await db
      .insert(squadMembersTable)
      .values([
        {
          tenantId: tenantA,
          firstName: "Penny",
          lastName: "Private",
          isPrivate: true,
          dateOfBirth: "1990-02-03",
        },
        { tenantId: tenantA, firstName: "Paul", lastName: "Public" },
        {
          tenantId: tenantA,
          firstName: "Jo",
          lastName: "Junior",
          section: "junior",
          isPrivate: true,
        },
        {
          tenantId: tenantA,
          firstName: "Uma",
          lastName: "Young",
          isPrivate: true,
          dateOfBirth: "2012-01-01",
        },
      ])
      .returning();
    [priv, pub, junior, under18] = rows.map((r) => r.id);

    const weekendDate = roundWeekendFor(DEFAULT_SCHEDULE, new Date());
    const startAt = new Date(perthDayStart(weekendDate).getTime() + 13 * 3_600_000);
    const [round] = await db
      .insert(availabilityRoundsTable)
      .values({ tenantId: tenantA, weekendDate })
      .returning();
    const [f] = await db
      .insert(fixturesTable)
      .values({ tenantId: tenantA, grade: "A Grade", opponentName: "Mandurah", startAt })
      .returning();
    fixtureId = f.id;
    const slots = [priv, pub, under18, ...Array(9).fill(null)].map((memberId) => ({ memberId }));
    const [side] = await db
      .insert(selectionsTable)
      .values({ tenantId: tenantA, roundId: round.id, fixtureId, slots })
      .returning();
    sideId = side.id;
  });

  afterAll(async () => {
    vi.useRealTimers();
    setSmsTransport(null);
    setEmailTransport(null);
    await purgeTestTenants([tenantA, tenantB]);
  });

  it("a private member is masked on the published list while the toggle is off", async () => {
    expect((await member(priv)).showNamePublicly).toBe(false);
    expect(await publish()).toEqual(["Private Player", "Paul Public", "Private Player"]);
  });

  it("an admin turns it on: stamped, returned, and the member is named once re-published", async () => {
    const res = await patch(adminA, priv, { showNamePublicly: true }).expect(200);
    expect(res.body).toMatchObject({
      showNamePublicly: true,
      showNamePubliclyBy: "Pat Admin",
    });
    expect(res.body.showNamePubliclyAt).toEqual(expect.any(String));
    const detail = await asA(request(app).get(`/api/squad/${priv}`).set("Cookie", adminA)).expect(
      200,
    );
    expect(detail.body.showNamePublicly).toBe(true);
    const list = await asA(request(app).get("/api/squad").set("Cookie", adminA)).expect(200);
    expect(list.body.find((m: { id: number }) => m.id === priv).showNamePublicly).toBe(true);
    // The under-18 stays masked; only Penny is named.
    expect(await publish()).toEqual(["Penny Private", "Paul Public", "Private Player"]);
  });

  it("turning it off masks them again", async () => {
    await patch(adminA, priv, { showNamePublicly: false }).expect(200);
    expect(await publish()).toEqual(["Private Player", "Paul Public", "Private Player"]);
  });

  it("is ignored for a junior or under-18 member", async () => {
    for (const id of [junior, under18]) {
      const res = await patch(adminA, id, { showNamePublicly: true }).expect(200);
      expect(res.body.showNamePublicly).toBe(false);
      const row = await member(id);
      expect(row).toMatchObject({ showNamePublicly: false, showNamePubliclyBy: null });
    }
    expect(await publish()).toEqual(["Private Player", "Paul Public", "Private Player"]);
  });

  it("captains can't change it", async () => {
    const res = await patch(captainA, priv, { showNamePublicly: true });
    expect([401, 403]).toContain(res.status);
    expect((await member(priv)).showNamePublicly).toBe(false);
  });

  it("is tenant-scoped", async () => {
    // Another club's admin on this club's host, and on their own host.
    expect((await patch(adminB, priv, { showNamePublicly: true })).status).toBe(401);
    await request(app)
      .patch(`/api/squad/${priv}`)
      .set("x-tenant-id", String(tenantB))
      .set("Cookie", adminB)
      .send({ showNamePublicly: true })
      .expect(404);
    expect((await member(priv)).showNamePublicly).toBe(false);
  });
});
