import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  captainsTable,
  captainGradePermissionsTable,
  squadMembersTable,
  availabilitySettingsTable,
  availabilityRoundsTable,
  fixturesTable,
  selectionsTable,
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
import { perthDayStart } from "../lib/availability-grades";
import { DEFAULT_SCHEDULE, roundWeekendFor } from "../lib/availability-schedule";
import { withdrawFromSelection } from "../lib/selection-board";

/**
 * Selection Hub tenant isolation (plan 2026-10-06-002 U7): tenant B's admin
 * can't read or write tenant A's board, and a session minted on one tenant's
 * host — admin or captain — is rejected on the other's. Real-DB integration
 * test (needs DATABASE_URL); messaging goes to fakes.
 */

const STAMP = Date.now();

describe("Selection Hub tenant isolation", () => {
  let tenantA: number;
  let tenantB: number;
  let selA: number;
  let roundA: number;
  let memberA: number;
  let memberB: number;
  let adminA: string;
  let adminB: string;
  let captainB: string;

  const sideSlots = (ids: number[]) =>
    [...ids, ...Array(11 - ids.length).fill(null)].map((memberId) => ({ memberId }));

  beforeAll(async () => {
    setSmsTransport(async () => {});
    setEmailTransport(async () => {});
    const tenants = await db
      .insert(tenantsTable)
      .values([
        {
          slug: `sel-iso-a-${STAMP}`,
          centralClubId: 7_600_000 + (STAMP % 100_000) * 10,
          name: "Iso Sel A",
          plan: "pilot",
        },
        {
          slug: `sel-iso-b-${STAMP}`,
          centralClubId: 7_600_001 + (STAMP % 100_000) * 10,
          name: "Iso Sel B",
          plan: "pilot",
        },
      ])
      .returning();
    [tenantA, tenantB] = tenants.map((t) => t.id);
    await db.insert(availabilitySettingsTable).values([
      { tenantId: tenantA, selectionRule: "captains_all_grades" },
      { tenantId: tenantB, selectionRule: "captains_all_grades" },
    ]);

    const admins = await db
      .insert(adminsTable)
      .values([
        {
          tenantId: tenantA,
          username: `sel_iso_a_${STAMP}`,
          displayName: "Admin A",
          passwordHash: "x",
        },
        {
          tenantId: tenantB,
          username: `sel_iso_b_${STAMP}`,
          displayName: "Admin B",
          passwordHash: "x",
        },
      ])
      .returning();
    adminA = `${SESSION_COOKIE}=${encodeSession({ adminId: admins[0].id, issuedAt: Date.now() })}`;
    adminB = `${SESSION_COOKIE}=${encodeSession({ adminId: admins[1].id, issuedAt: Date.now() })}`;
    const [capB] = await db
      .insert(captainsTable)
      .values({ tenantId: tenantB, username: "skip", displayName: "Captain B", passwordHash: "x" })
      .returning();
    await db.insert(captainGradePermissionsTable).values({ captainId: capB.id, grade: "A Grade" });
    captainB = `${CAPTAIN_SESSION_COOKIE}=${encodeCaptainSession({ captainId: capB.id, issuedAt: Date.now() })}`;

    const weekendDate = roundWeekendFor(DEFAULT_SCHEDULE, new Date());
    const startAt = new Date(perthDayStart(weekendDate).getTime() + 13 * 3_600_000);
    const [ra] = await db
      .insert(availabilityRoundsTable)
      .values({ tenantId: tenantA, weekendDate })
      .returning();
    roundA = ra.id;
    const [fa] = await db
      .insert(fixturesTable)
      .values({ tenantId: tenantA, grade: "A Grade", opponentName: "Mandurah", startAt })
      .returning();
    const [ma] = await db
      .insert(squadMembersTable)
      .values({
        tenantId: tenantA,
        firstName: "Alice",
        lastName: "Aye",
        accountHolderEmail: `a.${STAMP}@example.test`,
      })
      .returning();
    const [mb] = await db
      .insert(squadMembersTable)
      .values({ tenantId: tenantB, firstName: "Bob", lastName: "Bee" })
      .returning();
    memberA = ma.id;
    memberB = mb.id;
    const [sa] = await db
      .insert(selectionsTable)
      .values({ tenantId: tenantA, roundId: roundA, fixtureId: fa.id, slots: sideSlots([memberA]) })
      .returning();
    selA = sa.id;
  });

  afterAll(async () => {
    setSmsTransport(null);
    setEmailTransport(null);
    await purgeTestTenants([tenantA, tenantB]);
  });

  it("tenant B's admin never sees tenant A's sides or members", async () => {
    const res = await request(app)
      .get("/api/selection/board?section=senior")
      .set("Cookie", adminB)
      .set("x-tenant-id", String(tenantB))
      .expect(200);
    expect(res.body.selections).toEqual([]);
    expect(res.body.pool.map((p: { id: number }) => p.id)).toEqual([memberB]);
    expect(JSON.stringify(res.body)).not.toContain("Alice");
  });

  it("tenant B's admin can't save, finalise or re-open tenant A's side", async () => {
    const change = {
      selectionId: selA,
      version: 1,
      slots: sideSlots([memberB]),
      captainMemberId: null,
      keeperMemberId: null,
    };
    await request(app)
      .put("/api/selection/board")
      .set("Cookie", adminB)
      .set("x-tenant-id", String(tenantB))
      .send({ changes: [change] })
      .expect(404);
    for (const action of ["finalise", "reopen"]) {
      await request(app)
        .post(`/api/selection/${selA}/${action}`)
        .set("Cookie", adminB)
        .set("x-tenant-id", String(tenantB))
        .send({ version: 1 })
        .expect(404);
    }
    const [row] = await db.select().from(selectionsTable).where(eq(selectionsTable.id, selA));
    expect(row).toMatchObject({ version: 1, state: "draft" });
    expect(row.slots[0].memberId).toBe(memberA);
    const lists = await db
      .select()
      .from(teamListsTable)
      .where(eq(teamListsTable.tenantId, tenantA));
    expect(lists).toEqual([]);
  });

  it("tenant A's admin can't place tenant B's member", async () => {
    const res = await request(app)
      .put("/api/selection/board")
      .set("Cookie", adminA)
      .set("x-tenant-id", String(tenantA))
      .send({
        changes: [
          {
            selectionId: selA,
            version: 1,
            slots: sideSlots([memberA, memberB]),
            captainMemberId: null,
            keeperMemberId: null,
          },
        ],
      });
    expect(res.status).toBe(400);
  });

  it("tenant B's admin and captain sessions are rejected on tenant A's host", async () => {
    for (const cookie of [adminB, captainB]) {
      await request(app)
        .get("/api/selection/board")
        .set("Cookie", cookie)
        .set("x-tenant-id", String(tenantA))
        .expect(401);
      await request(app)
        .post(`/api/selection/${selA}/finalise`)
        .set("Cookie", cookie)
        .set("x-tenant-id", String(tenantA))
        .expect(401);
      await request(app)
        .post("/api/selection/rounds/current/remind")
        .set("Cookie", cookie)
        .set("x-tenant-id", String(tenantA))
        .send({ section: "senior" })
        .expect(401);
    }
  });

  it("a withdrawal under another tenant's id changes nothing", async () => {
    const out = await withdrawFromSelection(tenantB, memberA, roundA, {
      kind: "player",
      id: null,
      name: null,
    });
    expect(out.selectionIds).toEqual([]);
    const [row] = await db.select().from(selectionsTable).where(eq(selectionsTable.id, selA));
    expect(row.slots[0].memberId).toBe(memberA);
  });
});
