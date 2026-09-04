import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  teamOfDecadeBoardsTable,
  tourContentTable,
  capRegisterTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Tenant isolation for the curated tables the original isolation suite did not
 * touch (plan.md §5.11): Team of the Decade boards, the onboarding tour content
 * singleton, and the cap register. Same contract as tenant-isolation.test.ts:
 * tenant 2's rows are invisible to tenant 1 and vice versa, and a write as
 * tenant 2 lands on tenant 2 only.
 *
 * Real-DB integration test (needs DATABASE_URL). Tenant 1 is the seeded demo
 * tenant; tenant 2 is created here and removed afterwards.
 */

const STAMP = Date.now();
const T2_BOARD_KEY = `iso_tod_t2_${STAMP}`;
const T2_BOARD_TITLE = `Iso Team of the Decade T2 ${STAMP}`;
const T2_CAP_NAME = `Iso Capped Player T2 ${STAMP}`;
const T2_WELCOME_TITLE = `Welcome to Iso Tenant 2 ${STAMP}`;

describe("tenant isolation: team of the decade, tour content, cap register", () => {
  let tenant2Id: number;
  let adminT2Id: number;
  let adminT2Cookie: string;
  let capId: number;
  let boardId: number;

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-curated-isolation";

    const [tenant2] = await db
      .insert(tenantsTable)
      .values({
        slug: `iso-curated-t2-${STAMP}`,
        centralClubId: 9401,
        readsFromCentral: true,
        name: "Iso Curated Tenant 2",
        plan: "pilot",
      })
      .returning();
    tenant2Id = tenant2.id;

    const [board] = await db
      .insert(teamOfDecadeBoardsTable)
      .values({
        tenantId: tenant2Id,
        key: T2_BOARD_KEY,
        title: T2_BOARD_TITLE,
        published: true,
      })
      .returning();
    boardId = board.id;

    const [cap] = await db
      .insert(capRegisterTable)
      .values({
        tenantId: tenant2Id,
        // A high number that cannot collide with tenant 1's real register.
        capNumber: 90_000 + (STAMP % 1000),
        category: "male",
        name: T2_CAP_NAME,
      })
      .returning();
    capId = cap.id;

    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenant2Id,
        username: `iso_curated_admin_${STAMP}`,
        displayName: "Iso Curated Admin",
        passwordHash: "x",
      })
      .returning();
    adminT2Id = admin.id;
    adminT2Cookie = `${SESSION_COOKIE}=${encodeSession({ adminId: adminT2Id, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db.delete(teamOfDecadeBoardsTable).where(eq(teamOfDecadeBoardsTable.id, boardId));
    await db.delete(capRegisterTable).where(eq(capRegisterTable.id, capId));
    await db.delete(tourContentTable).where(eq(tourContentTable.tenantId, tenant2Id));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminT2Id));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant2Id));
  });

  it("team-of-decade-boards: tenant 2's board is hidden from tenant 1 and visible to tenant 2", async () => {
    const asT1 = await request(app)
      .get("/api/team-of-decade-boards")
      .set("x-tenant-id", "1")
      .expect(200);
    expect(asT1.body.some((b: { key: string }) => b.key === T2_BOARD_KEY)).toBe(false);

    const asT2 = await request(app)
      .get("/api/team-of-decade-boards")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.some((b: { key: string }) => b.key === T2_BOARD_KEY)).toBe(true);
  });

  it("caps: tenant 2's cap is hidden from tenant 1 and visible to tenant 2", async () => {
    const asT1 = await request(app).get("/api/caps").set("x-tenant-id", "1").expect(200);
    expect(asT1.body.some((c: { name: string }) => c.name === T2_CAP_NAME)).toBe(false);

    const asT2 = await request(app)
      .get("/api/caps")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.some((c: { name: string }) => c.name === T2_CAP_NAME)).toBe(true);
  });

  it("tour-content: tenant 2's edit never appears in tenant 1's onboarding copy", async () => {
    const before = await request(app).get("/api/tour-content").set("x-tenant-id", "1").expect(200);
    const t1Title = before.body.welcomeTitle;

    await request(app)
      .patch("/api/tour-content")
      .set("Cookie", adminT2Cookie)
      .set("x-tenant-id", String(tenant2Id))
      .send({ welcomeTitle: T2_WELCOME_TITLE })
      .expect(200);

    const asT2 = await request(app)
      .get("/api/tour-content")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.welcomeTitle).toBe(T2_WELCOME_TITLE);

    const asT1 = await request(app).get("/api/tour-content").set("x-tenant-id", "1").expect(200);
    expect(asT1.body.welcomeTitle).toBe(t1Title);
    expect(asT1.body.welcomeTitle).not.toBe(T2_WELCOME_TITLE);
  });

  it("tour-content: a tenant 2 admin session cannot edit tenant 1's copy", async () => {
    // The session is valid for tenant 2, but the request targets tenant 1's host.
    await request(app)
      .patch("/api/tour-content")
      .set("Cookie", adminT2Cookie)
      .set("x-tenant-id", "1")
      .send({ welcomeTitle: `cross-tenant ${STAMP}` })
      .expect(401);
  });
});
