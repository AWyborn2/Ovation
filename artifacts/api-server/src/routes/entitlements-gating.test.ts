import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, adminsTable } from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Entitlement-gating sweep (Phase 2f). Paid admin mutations are wrapped in
 * `requireEntitlement(feature)`, which 402s when the tenant's plan lacks the
 * feature — but only once billing is enabled. This isolates the GATE (not body
 * validation): with an authenticated admin we assert 402 on a locked feature and
 * "anything-but-402" when the feature is included (the handler then 400s on the
 * empty body, which is fine — it proves the gate let the request through).
 *
 * Plan split (entitlementsFor): free {} · club {curation, socialStudio} ·
 * pro = all-on. clubroomTv is pro-only. Real-DB integration test (needs
 * DATABASE_URL; central NOT required). One tenant per plan avoids the plan-config
 * cache masking a mid-test change.
 */

const STAMP = Date.now();

type Plan = "free" | "club" | "pro";

async function seedTenant(plan: Plan, centralClubId: number) {
  const [tenant] = await db
    .insert(tenantsTable)
    .values({ slug: `ent-${plan}-${STAMP}`, centralClubId, name: `Ent ${plan}`, plan })
    .returning();
  const [admin] = await db
    .insert(adminsTable)
    .values({
      tenantId: tenant.id,
      username: `ent_admin_${plan}_${STAMP}`,
      displayName: `Ent ${plan}`,
      passwordHash: "x",
    })
    .returning();
  const cookie = `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
  return { id: tenant.id, adminId: admin.id, cookie };
}

describe("entitlement gating: paid admin mutations are plan-gated", () => {
  let free: Awaited<ReturnType<typeof seedTenant>>;
  let club: Awaited<ReturnType<typeof seedTenant>>;
  let pro: Awaited<ReturnType<typeof seedTenant>>;
  const billingBefore = process.env.BILLING_ENABLED;

  // Fire a representative mutation per feature as the given tenant. Empty bodies
  // keep these side-effect free: a passed gate 400s on validation (or 200s on the
  // no-op PATCH), a blocked gate 402s before the handler runs.
  const postPremiership = (t: { id: number; cookie: string }) =>
    request(app)
      .post("/api/premierships")
      .set("Cookie", t.cookie)
      .set("x-tenant-id", String(t.id))
      .send({});
  const postSponsor = (t: { id: number; cookie: string }) =>
    request(app)
      .post("/api/sponsors")
      .set("Cookie", t.cookie)
      .set("x-tenant-id", String(t.id))
      .send({});
  const patchHonourDisplay = (t: { id: number; cookie: string }) =>
    request(app)
      .patch("/api/honour-display-settings")
      .set("Cookie", t.cookie)
      .set("x-tenant-id", String(t.id))
      .send({});

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-for-entitlements";
    free = await seedTenant("free", 9201);
    club = await seedTenant("club", 9202);
    pro = await seedTenant("pro", 9203);
  });

  afterAll(async () => {
    if (billingBefore === undefined) delete process.env.BILLING_ENABLED;
    else process.env.BILLING_ENABLED = billingBefore;
    for (const t of [free, club, pro]) {
      await db.delete(adminsTable).where(eq(adminsTable.id, t.adminId));
      await db.delete(tenantsTable).where(eq(tenantsTable.id, t.id));
    }
  });

  describe("billing enabled — the tiers are enforced", () => {
    beforeAll(() => {
      process.env.BILLING_ENABLED = "true";
    });

    it("free plan is 402'd on curation, socialStudio and clubroomTv mutations", async () => {
      expect((await postPremiership(free)).status).toBe(402);
      expect((await postSponsor(free)).status).toBe(402);
      expect((await patchHonourDisplay(free)).status).toBe(402);
    });

    it("club plan passes curation + socialStudio but is still 402'd on clubroomTv", async () => {
      expect((await postPremiership(club)).status).not.toBe(402);
      expect((await postSponsor(club)).status).not.toBe(402);
      expect((await patchHonourDisplay(club)).status).toBe(402);
    });

    it("pro plan passes the clubroomTv gate", async () => {
      expect((await patchHonourDisplay(pro)).status).not.toBe(402);
    });
  });

  describe("billing dormant — every plan passes (pilot default)", () => {
    beforeAll(() => {
      delete process.env.BILLING_ENABLED;
    });

    it("a free tenant is not gated when BILLING_ENABLED is unset", async () => {
      expect((await postPremiership(free)).status).not.toBe(402);
      expect((await postSponsor(free)).status).not.toBe(402);
      expect((await patchHonourDisplay(free)).status).not.toBe(402);
    });
  });
});
