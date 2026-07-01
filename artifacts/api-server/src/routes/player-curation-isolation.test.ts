import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, adminsTable, playerCurationTable } from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Player-curation suite (U6) — proves the per-club central-player curation
 * overlay is admin-only and never crosses tenants (origin R3):
 *   - an admin can rename/merge a central participant for their own club;
 *   - the row lands with the caller's tenant_id;
 *   - tenant 1 never sees tenant 2's curation, and vice versa;
 *   - merge-into-self is rejected, and unauthenticated writes are blocked.
 *
 * Curation is an app-side table, so this needs no central fixtures — only a
 * DATABASE_URL and the seeded tenant 1. Follows the tenant-isolation pattern.
 */

const STAMP = Date.now();
const GUID = `cur-guid-t2-${STAMP}`;
const RENAME = `Michael Brown ${STAMP}`;

describe("player curation: tenant-scoped, admin-only", () => {
  let tenant2Id: number;
  let adminId: number;
  let adminCookie: string;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-for-curation";

    const [tenant2] = await db
      .insert(tenantsTable)
      .values({
        slug: `cur-tenant-2-${STAMP}`,
        centralClubId: 998,
        appClubId: null,
        name: "Curation Test Tenant 2",
        plan: "pilot",
      })
      .returning();
    tenant2Id = tenant2.id;

    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenant2Id,
        username: `cur_admin_${STAMP}`,
        displayName: "Cur Admin",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db.delete(playerCurationTable).where(eq(playerCurationTable.tenantId, tenant2Id));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant2Id));
  });

  it("rejects an unauthenticated curation write", async () => {
    await request(app)
      .put(`/api/player-curation/${GUID}`)
      .set("x-tenant-id", String(tenant2Id))
      .send({ overrideDisplayName: RENAME })
      .expect(401);
  });

  it("stores a rename with the caller's tenant_id", async () => {
    const res = await request(app)
      .put(`/api/player-curation/${GUID}`)
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenant2Id))
      .send({ overrideDisplayName: RENAME })
      .expect(200);
    expect(res.body.overrideDisplayName).toBe(RENAME);

    const [row] = await db
      .select()
      .from(playerCurationTable)
      .where(eq(playerCurationTable.tenantId, tenant2Id));
    expect(row.tenantId).toBe(tenant2Id);
    expect(row.participantId).toBe(GUID);
  });

  it("hides tenant 2's curation from tenant 1 and shows it to tenant 2", async () => {
    const asT2 = await request(app)
      .get("/api/player-curation")
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.some((r: { participantId: string }) => r.participantId === GUID)).toBe(true);

    // Tenant 1's admin surface must never surface tenant 2's curation row.
    const asT1 = await request(app)
      .get("/api/player-curation")
      .set("Cookie", adminCookie)
      .set("x-tenant-id", "1")
      .expect((r) => {
        // Either 200 with no leak, or 401 if the tenant-1 mismatch is rejected.
        if (r.status === 200) {
          expect(
            r.body.some((row: { participantId: string }) => row.participantId === GUID),
          ).toBe(false);
        }
      });
    expect([200, 401]).toContain(asT1.status);
  });

  it("rejects merging a player into itself", async () => {
    await request(app)
      .put(`/api/player-curation/${GUID}`)
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenant2Id))
      .send({ mergedIntoParticipantId: GUID })
      .expect(400);
  });

  it("clears curation on delete", async () => {
    await request(app)
      .delete(`/api/player-curation/${GUID}`)
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenant2Id))
      .expect(204);

    const rows = await db
      .select()
      .from(playerCurationTable)
      .where(eq(playerCurationTable.tenantId, tenant2Id));
    expect(rows.length).toBe(0);
  });
});
