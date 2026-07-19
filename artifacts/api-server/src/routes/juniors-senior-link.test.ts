import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  tenantsTable,
  playersTable,
  juniorParticipantsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Junior↔senior profile link (junior_participants.senior_player_id). The link
 * is a cross-reference only — these tests pin the write endpoints, the
 * by-senior reverse lookup (private participants excluded), tenant isolation,
 * and the senior-side cleanup on player delete/merge.
 *
 * Real-DB integration test (needs DATABASE_URL; central not required).
 */

const STAMP = Date.now();
const P1 = `test-jsl-a-${STAMP}`;
const P2 = `test-jsl-b-${STAMP}`;
const P_PRIVATE = `test-jsl-priv-${STAMP}`;

describe("junior↔senior profile link", () => {
  let adminCookie: string;
  let adminId: number;
  let tenantBId: number;
  let adminBCookie: string;
  let seniorId: number;
  const playerIds: number[] = [];

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-junior-senior-link";

    const [admin] = await db
      .insert(adminsTable)
      .values({
        username: `test_admin_jsl_${STAMP}`,
        displayName: "Test Admin JSL",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;

    const [tenantB] = await db
      .insert(tenantsTable)
      .values({
        slug: `jsl-b-${STAMP}`,
        centralClubId: 8811,
        name: "JSL Tenant B",
        plan: "pilot",
      })
      .returning();
    tenantBId = tenantB.id;
    const [adminB] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantBId,
        username: `test_admin_jsl_b_${STAMP}`,
        displayName: "B",
        passwordHash: "x",
      })
      .returning();
    adminBCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: adminB.id, issuedAt: Date.now() })}`;

    const [senior] = await db
      .insert(playersTable)
      .values({ surname: `TestJsl${STAMP}`, givenName: "Senior" })
      .returning();
    seniorId = senior.id;
    playerIds.push(seniorId);

    await db.insert(juniorParticipantsTable).values([
      { participantId: P1, displayName: "Jsl Junior One" },
      { participantId: P2, displayName: "Jsl Junior Two" },
      { participantId: P_PRIVATE, displayName: "Jsl Private", isPrivate: true },
    ]);
  });

  afterAll(async () => {
    await db
      .delete(juniorParticipantsTable)
      .where(
        inArray(juniorParticipantsTable.participantId, [P1, P2, P_PRIVATE]),
      );
    if (playerIds.length > 0) {
      await db.delete(playersTable).where(inArray(playersTable.id, playerIds));
    }
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantBId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantBId));
  });

  it("rejects link writes without an admin session", async () => {
    await request(app)
      .put(`/api/juniors/participants/${P1}/senior-link`)
      .send({ seniorPlayerId: seniorId })
      .expect(401);
    await request(app)
      .delete(`/api/juniors/participants/${P1}/senior-link`)
      .expect(401);
  });

  it("404s on an unknown participant and an unknown senior player", async () => {
    await request(app)
      .put(`/api/juniors/participants/no-such-participant/senior-link`)
      .set("Cookie", adminCookie)
      .send({ seniorPlayerId: seniorId })
      .expect(404);
    await request(app)
      .put(`/api/juniors/participants/${P1}/senior-link`)
      .set("Cookie", adminCookie)
      .send({ seniorPlayerId: 999999999 })
      .expect(404);
  });

  it("sets, surfaces, and clears the link; multiple juniors may share one senior", async () => {
    const setRes = await request(app)
      .put(`/api/juniors/participants/${P1}/senior-link`)
      .set("Cookie", adminCookie)
      .send({ seniorPlayerId: seniorId })
      .expect(200);
    expect(setRes.body.seniorPlayerId).toBe(seniorId);

    // A second junior identity (PlayHQ duplicate GUID) may link to the same senior.
    await request(app)
      .put(`/api/juniors/participants/${P2}/senior-link`)
      .set("Cookie", adminCookie)
      .send({ seniorPlayerId: seniorId })
      .expect(200);

    const bySenior = await request(app)
      .get(`/api/juniors/players/by-senior/${seniorId}`)
      .expect(200);
    const ids = (bySenior.body as Array<{ participantId: string }>).map(
      (r) => r.participantId,
    );
    expect(ids).toContain(P1);
    expect(ids).toContain(P2);

    // The junior player detail carries the link for the profile cross-section.
    const detail = await request(app).get(`/api/juniors/players/${P1}`).expect(200);
    expect(detail.body.seniorPlayerId).toBe(seniorId);

    await request(app)
      .delete(`/api/juniors/participants/${P2}/senior-link`)
      .set("Cookie", adminCookie)
      .expect(204);
    const afterClear = await request(app)
      .get(`/api/juniors/players/by-senior/${seniorId}`)
      .expect(200);
    expect(
      (afterClear.body as Array<{ participantId: string }>).map(
        (r) => r.participantId,
      ),
    ).toEqual([P1]);
  });

  it("excludes private participants from the by-senior lookup", async () => {
    await request(app)
      .put(`/api/juniors/participants/${P_PRIVATE}/senior-link`)
      .set("Cookie", adminCookie)
      .send({ seniorPlayerId: seniorId })
      .expect(200);
    const bySenior = await request(app)
      .get(`/api/juniors/players/by-senior/${seniorId}`)
      .expect(200);
    expect(
      (bySenior.body as Array<{ participantId: string }>).some(
        (r) => r.participantId === P_PRIVATE,
      ),
    ).toBe(false);
  });

  it("another tenant's admin cannot set or clear the link (404)", async () => {
    await request(app)
      .put(`/api/juniors/participants/${P1}/senior-link`)
      .set("Cookie", adminBCookie)
      .set("x-tenant-id", String(tenantBId))
      .send({ seniorPlayerId: seniorId })
      .expect(404);
    await request(app)
      .delete(`/api/juniors/participants/${P1}/senior-link`)
      .set("Cookie", adminBCookie)
      .set("x-tenant-id", String(tenantBId))
      .expect(404);
    // Tenant A's link survives.
    const [row] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.participantId, P1));
    expect(row.seniorPlayerId).toBe(seniorId);
  });

  it("deleting a senior player nulls any junior links to it", async () => {
    const [doomed] = await db
      .insert(playersTable)
      .values({ surname: `TestJslDel${STAMP}`, givenName: "Doomed" })
      .returning();
    await request(app)
      .put(`/api/juniors/participants/${P2}/senior-link`)
      .set("Cookie", adminCookie)
      .send({ seniorPlayerId: doomed.id })
      .expect(200);

    await request(app)
      .delete(`/api/players/${doomed.id}`)
      .set("Cookie", adminCookie)
      .expect(204);

    const [row] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.participantId, P2));
    expect(row.seniorPlayerId).toBeNull();
  });

  it("merging a duplicate senior reassigns junior links to the keeper", async () => {
    const [dup] = await db
      .insert(playersTable)
      .values({ surname: `TestJslDup${STAMP}`, givenName: "Duplicate" })
      .returning();
    const [keeper] = await db
      .insert(playersTable)
      .values({ surname: `TestJslKeep${STAMP}`, givenName: "Keeper" })
      .returning();
    playerIds.push(keeper.id);

    await request(app)
      .put(`/api/juniors/participants/${P2}/senior-link`)
      .set("Cookie", adminCookie)
      .send({ seniorPlayerId: dup.id })
      .expect(200);

    await request(app)
      .post(`/api/players/${dup.id}/merge`)
      .set("Cookie", adminCookie)
      .send({ keeperId: keeper.id })
      .expect(200);

    const [row] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.participantId, P2));
    expect(row.seniorPlayerId).toBe(keeper.id);
  });
});
