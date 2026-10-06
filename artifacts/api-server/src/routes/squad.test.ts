import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  captainsTable,
  squadMembersTable,
  playerIdMapTable,
  fixturesTable,
  teamListsTable,
} from "@workspace/db";
import {
  SESSION_COOKIE,
  CAPTAIN_SESSION_COOKIE,
  encodeSession,
  encodeCaptainSession,
} from "../lib/auth";
import {
  ADULT,
  JUNIOR,
  COACH,
  CANCELLED,
  DISCARDED_SENTINELS,
  PLAYHQ_PARTICIPANT_COLUMNS,
  buildParticipantCsv,
  participantRow,
} from "../test/fixtures/playhq-participants";

/**
 * Squad register import + admin API (plan 2026-10-06-002 U3; R1–R4, R6, R7).
 * Real-DB integration test (needs DATABASE_URL). Every participant row is fake.
 */

const STAMP = Date.now();

// Linked via player_id_map (participantId == Profile ID).
const MAPPED = participantRow({
  "First Name": "Morgan",
  "Last Name": "Mapwell",
  "Profile ID": "B0000000-0000-4000-8000-000000000011",
  "Date of Birth": "01/01/1992",
  "Account Holder Mobile": "0400 000 040",
});
// Mapped only to a fill-in id — must never link (R7).
const FILL_IN = participantRow({
  "First Name": "Frankie",
  "Last Name": "Fillin",
  "Profile ID": "b0000000-0000-4000-8000-000000000012",
  "Date of Birth": "01/01/1993",
});
// Linked by a unique name in the club's team-list history (KTD7).
const BY_NAME = participantRow({
  "First Name": "Samuel",
  "Last Name": "Namelink",
  "Preferred Name": "Sam",
  "Profile ID": "b0000000-0000-4000-8000-000000000013",
  "Date of Birth": "01/01/1994",
});

const FILE_ROWS = [ADULT, JUNIOR, COACH, CANCELLED, MAPPED, FILL_IN, BY_NAME];

function upload(cookie: string, tenantId: number, csv: string, name = "participants.csv") {
  return request(app)
    .post("/api/squad/import")
    .set("Cookie", cookie)
    .set("x-tenant-id", String(tenantId))
    .attach("file", Buffer.from(csv, "utf8"), name);
}

describe("squad register API", () => {
  let tenantA: number;
  let tenantB: number;
  let adminA: number;
  let adminB: number;
  let captainA: number;
  let cookieA: string;
  let cookieB: string;
  let captainCookieA: string;

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-squad";
    const [a] = await db
      .insert(tenantsTable)
      .values({ slug: `squad-a-${STAMP}`, centralClubId: 9301, name: "Squad A" })
      .returning();
    const [b] = await db
      .insert(tenantsTable)
      .values({ slug: `squad-b-${STAMP}`, centralClubId: 9302, name: "Squad B" })
      .returning();
    tenantA = a.id;
    tenantB = b.id;
    const [aa] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantA,
        username: `squad_a_${STAMP}`,
        displayName: "A",
        passwordHash: "x",
      })
      .returning();
    const [ab] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantB,
        username: `squad_b_${STAMP}`,
        displayName: "B",
        passwordHash: "x",
      })
      .returning();
    adminA = aa.id;
    adminB = ab.id;
    cookieA = `${SESSION_COOKIE}=${encodeSession({ adminId: adminA, issuedAt: Date.now() })}`;
    cookieB = `${SESSION_COOKIE}=${encodeSession({ adminId: adminB, issuedAt: Date.now() })}`;
    const [cap] = await db
      .insert(captainsTable)
      .values({ tenantId: tenantA, username: "skip", displayName: "Skip", passwordHash: "x" })
      .returning();
    captainA = cap.id;
    captainCookieA = `${CAPTAIN_SESSION_COOKIE}=${encodeCaptainSession({
      captainId: captainA,
      issuedAt: Date.now(),
    })}`;

    // KTD7 link sources. Profile ids are matched case-insensitively.
    await db.insert(playerIdMapTable).values([
      { tenantId: tenantA, participantId: MAPPED["Profile ID"].toLowerCase(), playerId: 4321 },
      { tenantId: tenantA, participantId: FILL_IN["Profile ID"], playerId: 95001 },
      // Another tenant's map row for the same profile must not leak across.
      { tenantId: tenantB, participantId: ADULT["Profile ID"], playerId: 777 },
    ]);
    const [fx] = await db
      .insert(fixturesTable)
      .values({
        tenantId: tenantA,
        grade: "B Grade",
        opponentName: "Opp",
        startAt: new Date("2026-09-19T01:30:00Z"),
      })
      .returning();
    await db.insert(teamListsTable).values({
      tenantId: tenantA,
      fixtureId: fx.id,
      players: [
        { order: 1, playerId: 4400, displayName: "Sam Namelink" },
        { order: 2, playerId: 95002, displayName: "Frankie Fillin" },
      ],
    });
  });

  afterAll(async () => {
    for (const t of [tenantA, tenantB]) {
      await db.delete(squadMembersTable).where(eq(squadMembersTable.tenantId, t));
      await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, t));
      await db.delete(teamListsTable).where(eq(teamListsTable.tenantId, t));
      await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, t));
      await db.delete(captainsTable).where(eq(captainsTable.tenantId, t));
    }
    await db.delete(adminsTable).where(inArray(adminsTable.id, [adminA, adminB]));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantA, tenantB]));
  });

  async function memberByProfile(tenantId: number, profileId: string) {
    const [row] = await db
      .select()
      .from(squadMembersTable)
      .where(
        and(
          eq(squadMembersTable.tenantId, tenantId),
          eq(squadMembersTable.playhqProfileId, profileId),
        ),
      );
    return row;
  }

  it("refuses no session and a captain session (401)", async () => {
    const csv = buildParticipantCsv([ADULT]);
    await request(app)
      .post("/api/squad/import")
      .set("x-tenant-id", String(tenantA))
      .attach("file", Buffer.from(csv), "p.csv")
      .expect(401);
    await request(app)
      .post("/api/squad/import")
      .set("Cookie", captainCookieA)
      .set("x-tenant-id", String(tenantA))
      .attach("file", Buffer.from(csv), "p.csv")
      .expect(401);
    await request(app).get("/api/squad").set("x-tenant-id", String(tenantA)).expect(401);
    await request(app)
      .get("/api/squad")
      .set("Cookie", captainCookieA)
      .set("x-tenant-id", String(tenantA))
      .expect(401);
  });

  it("refuses a file without a Profile ID column, naming it (400)", async () => {
    const cols = PLAYHQ_PARTICIPANT_COLUMNS.filter((c) => c !== "Profile ID");
    const res = await upload(cookieA, tenantA, buildParticipantCsv([ADULT], cols)).expect(400);
    expect(res.body.error).toMatch(/Profile ID/);
  });

  it("imports players, skips coach/cancelled with reasons and stores no discarded value", async () => {
    const res = await upload(cookieA, tenantA, buildParticipantCsv(FILE_ROWS)).expect(200);
    expect(res.body).toMatchObject({ created: 5, updated: 0, deactivated: 0, linked: 2 });
    expect(res.body.skipped).toEqual([
      expect.objectContaining({ name: "Casey Coachman", reason: "not_a_player" }),
      expect.objectContaining({ name: "Drew Gonebye", reason: "inactive_status" }),
    ]);
    // Nothing from a discarded column is echoed back either.
    const echoed = JSON.stringify(res.body);
    for (const v of Object.values(DISCARDED_SENTINELS)) expect(echoed).not.toContain(v);

    const rows = await db
      .select()
      .from(squadMembersTable)
      .where(eq(squadMembersTable.tenantId, tenantA));
    expect(rows).toHaveLength(5);
    const stored = JSON.stringify(rows);
    for (const v of Object.values(DISCARDED_SENTINELS)) expect(stored).not.toContain(v);
    expect(stored).not.toContain("Moved interstate"); // Cancellation Reason
    expect(stored).not.toContain("0400000020"); // the skipped coach's mobile
  });

  it("stores a 15-year-old as junior with guardian contacts (R5)", async () => {
    const m = await memberByProfile(tenantA, JUNIOR["Profile ID"]);
    expect(m).toMatchObject({
      section: "junior",
      dateOfBirth: "2011-06-20",
      guardian1Mobile: "0400000011",
      guardian2Email: "robin.testwood@example.com",
      active: true,
    });
    const adult = await memberByProfile(tenantA, ADULT["Profile ID"]);
    expect(adult.section).toBe("senior");
  });

  it("links by player_id_map and by unique team-list name, never a fill-in (R7)", async () => {
    expect((await memberByProfile(tenantA, MAPPED["Profile ID"])).linkedPlayerId).toBe(4321);
    expect((await memberByProfile(tenantA, BY_NAME["Profile ID"])).linkedPlayerId).toBe(4400);
    expect((await memberByProfile(tenantA, FILL_IN["Profile ID"])).linkedPlayerId).toBeNull();
    // Tenant B's map row for ADULT never applied to tenant A.
    expect((await memberByProfile(tenantA, ADULT["Profile ID"])).linkedPlayerId).toBeNull();
  });

  it("re-importing creates 0 and updates every row; a changed mobile updates (R1)", async () => {
    const changed = { ...ADULT, "Account Holder Mobile": "0400 999 888" };
    const rows = FILE_ROWS.map((r) => (r === ADULT ? changed : r));
    const res = await upload(cookieA, tenantA, buildParticipantCsv(rows)).expect(200);
    expect(res.body).toMatchObject({ created: 0, updated: 5, linked: 0 });
    const m = await memberByProfile(tenantA, ADULT["Profile ID"]);
    expect(m.accountHolderMobile).toBe("0400999888");
  });

  it("lists members with contact presence flags, never values (R6)", async () => {
    const res = await request(app)
      .get("/api/squad")
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenantA))
      .expect(200);
    expect(res.body).toHaveLength(5);
    const junior = res.body.find(
      (m: { playhqProfileId: string }) => m.playhqProfileId === JUNIOR["Profile ID"],
    );
    expect(junior).toMatchObject({
      section: "junior",
      under18: true,
      guardian1: { hasName: true, hasMobile: true, hasEmail: true, smsOptedOut: false },
    });
    const blob = JSON.stringify(res.body);
    expect(blob).not.toContain("0400000011");
    expect(blob).not.toContain("@example.com");
    expect(blob).not.toContain("2011-06-20");
  });

  it("returns full contacts for one member to an admin", async () => {
    const m = await memberByProfile(tenantA, JUNIOR["Profile ID"]);
    const res = await request(app)
      .get(`/api/squad/${m.id}`)
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenantA))
      .expect(200);
    expect(res.body.guardian1).toEqual({
      name: "Pat Testwood",
      mobile: "0400000011",
      email: "pat.testwood@example.com",
      smsOptedOut: false,
    });
    expect(res.body.dateOfBirth).toBe("2011-06-20");
  });

  it("another tenant's admin can't list, read, patch or remove these members", async () => {
    const m = await memberByProfile(tenantA, ADULT["Profile ID"]);
    const list = await request(app)
      .get("/api/squad")
      .set("Cookie", cookieB)
      .set("x-tenant-id", String(tenantB))
      .expect(200);
    expect(list.body).toEqual([]);
    for (const call of [
      request(app).get(`/api/squad/${m.id}`),
      request(app).patch(`/api/squad/${m.id}`).send({ active: false }),
      request(app).delete(`/api/squad/${m.id}`),
    ]) {
      await call.set("Cookie", cookieB).set("x-tenant-id", String(tenantB)).expect(404);
    }
    // Tenant A's session presented on tenant B's host is not an admin there.
    await request(app)
      .get("/api/squad")
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenantB))
      .expect(401);
    const after = await memberByProfile(tenantA, ADULT["Profile ID"]);
    expect(after.active).toBe(true);
    expect(after.accountHolderMobile).toBe("0400999888");
  });

  it("PATCH edits contacts, link and active; the admin's inactive flag survives a re-import", async () => {
    const m = await memberByProfile(tenantA, MAPPED["Profile ID"]);
    await db
      .update(squadMembersTable)
      .set({ accountSmsOptOut: true, contactChangeFlag: true })
      .where(eq(squadMembersTable.id, m.id));
    const res = await request(app)
      .patch(`/api/squad/${m.id}`)
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenantA))
      .send({
        active: false,
        gradeHint: "C Grade",
        contactChangeFlag: false,
        account: { mobile: "0411 222 333", email: " New@Example.com " },
      })
      .expect(200);
    expect(res.body).toMatchObject({
      active: false,
      activeSetByAdmin: true,
      gradeHint: "C Grade",
      contactChangeFlag: false,
      account: { mobile: "0411222333", email: "new@example.com", smsOptedOut: false },
    });

    await request(app)
      .patch(`/api/squad/${m.id}`)
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenantA))
      .send({ linkedPlayerId: 95000 })
      .expect(400);
    await request(app)
      .patch(`/api/squad/${m.id}`)
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenantA))
      .send({ section: "veteran" })
      .expect(400);

    await upload(cookieA, tenantA, buildParticipantCsv(FILE_ROWS)).expect(200);
    const after = await memberByProfile(tenantA, MAPPED["Profile ID"]);
    expect(after.active).toBe(false);
    expect(after.activeSetByAdmin).toBe(true);
  });

  it("a cancelled registration stands down an existing member the admin hasn't set", async () => {
    const cancelledAdult = { ...ADULT, Status: "Deregistered" };
    const rows = FILE_ROWS.map((r) => (r === ADULT ? cancelledAdult : r));
    const res = await upload(cookieA, tenantA, buildParticipantCsv(rows)).expect(200);
    expect(res.body.deactivated).toBe(1);
    expect((await memberByProfile(tenantA, ADULT["Profile ID"])).active).toBe(false);
  });

  it("DELETE removes contacts and date of birth, keeps the name, and a re-import doesn't restore them", async () => {
    const m = await memberByProfile(tenantA, JUNIOR["Profile ID"]);
    await request(app)
      .delete(`/api/squad/${m.id}`)
      .set("Cookie", cookieA)
      .set("x-tenant-id", String(tenantA))
      .expect(204);
    const after = await memberByProfile(tenantA, JUNIOR["Profile ID"]);
    expect(after).toMatchObject({
      firstName: "Jordan",
      lastName: "Testwood",
      active: false,
      activeSetByAdmin: true,
      dateOfBirth: null,
      accountHolderName: null,
      accountHolderMobile: null,
      accountHolderEmail: null,
      guardian1Name: null,
      guardian1Mobile: null,
      guardian1Email: null,
      guardian2Name: null,
      guardian2Mobile: null,
      guardian2Email: null,
    });

    await upload(cookieA, tenantA, buildParticipantCsv(FILE_ROWS)).expect(200);
    const reimported = await memberByProfile(tenantA, JUNIOR["Profile ID"]);
    expect(reimported.active).toBe(false);
    expect(reimported.guardian1Mobile).toBeNull();
    expect(reimported.dateOfBirth).toBeNull();
  });
});
