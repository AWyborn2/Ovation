import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  platformAdminsTable,
  tenantsTable,
  adminsTable,
  playerIdMapTable,
} from "@workspace/db";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";
import { findFoldedCentralClub } from "../lib/central-club.test-helpers";

/**
 * Platform-admin tenant oversight + management (Phase 2e). A platform admin can
 * list every tenant and change a tenant's plan; a club-admin session must never
 * reach these routes; concierge provisioning mints a tenant + player crosswalk.
 *
 * Real-DB integration test: list/plan need DATABASE_URL; the provision case also
 * needs CENTRAL_DATABASE_URL (reads central.clubs and mints the crosswalk).
 */

const STAMP = Date.now();
const EMAIL = `super-tenants+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";

describe("platform-admin tenant management", () => {
  let platformCookie: string;
  let clubAdminCookie: string;
  let throwawayTenantId: number;
  let provisionedTenantId: number | null = null;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-platform-tenants";
    process.env.SIGNUP_MODE = "pca";

    const passwordHash = await hashPassword(PASSWORD);
    await db
      .insert(platformAdminsTable)
      .values({ email: EMAIL, displayName: "Super", passwordHash });
    const login = await request(app)
      .post("/api/platform/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    platformCookie = String(login.headers["set-cookie"][0]).split(";")[0];

    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `pa-throwaway-${STAMP}`,
        centralClubId: 9201,
        name: "PA Throwaway",
        plan: "free",
      })
      .returning();
    throwawayTenantId = t.id;

    // A club admin in the throwaway tenant — its session must NOT reach platform
    // routes (cross-surface isolation).
    const [ca] = await db
      .insert(adminsTable)
      .values({
        tenantId: throwawayTenantId,
        username: "owner",
        displayName: "Club",
        passwordHash,
      })
      .returning();
    clubAdminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: ca.id, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, throwawayTenantId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, throwawayTenantId));
    if (provisionedTenantId != null) {
      await db.delete(adminsTable).where(eq(adminsTable.tenantId, provisionedTenantId));
      await db
        .delete(playerIdMapTable)
        .where(eq(playerIdMapTable.tenantId, provisionedTenantId));
      await db.delete(tenantsTable).where(eq(tenantsTable.id, provisionedTenantId));
    }
    await db.delete(platformAdminsTable).where(eq(platformAdminsTable.email, EMAIL));
    delete process.env.SIGNUP_MODE;
  });

  it("lists every tenant for a platform admin", async () => {
    const res = await request(app)
      .get("/api/platform/admin/tenants")
      .set("Cookie", platformCookie)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((t: { id: number }) => t.id === throwawayTenantId)).toBe(true);
  });

  it("rejects the list without a platform session (401)", async () => {
    await request(app).get("/api/platform/admin/tenants").expect(401);
  });

  it("rejects a club-admin session on platform routes (cross-surface)", async () => {
    await request(app)
      .get("/api/platform/admin/tenants")
      .set("Cookie", clubAdminCookie)
      .expect(401);
  });

  it("updates a tenant's plan", async () => {
    const res = await request(app)
      .patch(`/api/platform/admin/tenants/${throwawayTenantId}`)
      .set("Cookie", platformCookie)
      .send({ plan: "club" })
      .expect(200);
    expect(res.body.plan).toBe("club");

    const [row] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, throwawayTenantId));
    expect(row.plan).toBe("club");
  });

  it("rejects setting a custom domain on a non-Pro tenant, even with BILLING_ENABLED unset (402)", async () => {
    // Tenant is "club" tier from the previous test — club doesn't include
    // customDomain, and this gate stays enforced regardless of the dormant flag.
    delete process.env.BILLING_ENABLED;
    const res = await request(app)
      .patch(`/api/platform/admin/tenants/${throwawayTenantId}`)
      .set("Cookie", platformCookie)
      .send({ customDomain: `not-allowed-${STAMP}.example.com` })
      .expect(402);
    expect(res.body.feature).toBe("customDomain");
    expect(res.body.plan).toBe("club");

    const [row] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, throwawayTenantId));
    expect(row.customDomain).toBeNull();
  });

  it("allows a single PATCH to grant Pro and set a custom domain together (effective-plan evaluation)", async () => {
    const domain = `allowed-${STAMP}.example.com`;
    const res = await request(app)
      .patch(`/api/platform/admin/tenants/${throwawayTenantId}`)
      .set("Cookie", platformCookie)
      .send({ plan: "pro", customDomain: domain })
      .expect(200);
    expect(res.body.plan).toBe("pro");
    expect(res.body.customDomain).toBe(domain);
  });

  it("downgrading a tenant's plan away from Pro clears its existing custom domain", async () => {
    // Guards against the gate only firing when customDomain is being SET --
    // a plan-only downgrade must not leave a stale customDomain the tenant is
    // no longer entitled to keep serving on.
    const res = await request(app)
      .patch(`/api/platform/admin/tenants/${throwawayTenantId}`)
      .set("Cookie", platformCookie)
      .send({ plan: "free" })
      .expect(200);
    expect(res.body.plan).toBe("free");
    expect(res.body.customDomain).toBeNull();

    const [row] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, throwawayTenantId));
    expect(row.customDomain).toBeNull();
  });

  it("returns 404 for a customDomain-only PATCH to a nonexistent tenant, not a 402", async () => {
    const res = await request(app)
      .patch(`/api/platform/admin/tenants/999999999`)
      .set("Cookie", platformCookie)
      .send({ customDomain: `ghost-${STAMP}.example.com` })
      .expect(404);
    expect(res.status).toBe(404);
  });

  it("does not widen enforcement of curation/socialStudio for Free tenants", async () => {
    // Regression guard for KTD4's scope: only customDomain is always-enforced;
    // everything else stays fully unlocked while BILLING_ENABLED is unset.
    const [row] = await db
      .select({ plan: tenantsTable.plan })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, throwawayTenantId));
    expect(row.plan).toBe("free"); // sanity: previous test's downgrade landed
    const { entitlementsFor, planFromString } = await import("../lib/entitlements");
    const free = entitlementsFor(planFromString("free"));
    expect(free.curation).toBe(true);
    expect(free.socialStudio).toBe(true);
    expect(free.customDomain).toBe(false);
  });

  it("concierge-provisions a tenant from an available central club", async () => {
    const clubs = await request(app).get("/api/platform/available-clubs").expect(200);
    expect(clubs.body.length).toBeGreaterThan(0);
    const club = clubs.body[0];

    const res = await request(app)
      .post("/api/platform/admin/tenants")
      .set("Cookie", platformCookie)
      .send({
        centralClubId: club.centralClubId,
        slug: `pa-prov-${STAMP}`.slice(0, 40),
        adminEmail: `owner+${STAMP}@example.com`,
        password: "correct horse battery",
      })
      .expect(201);
    provisionedTenantId = res.body.id;
    expect(res.body.readsFromCentral).toBe(true);
    expect(res.body.centralClubId).toBe(club.centralClubId);
    expect(res.body.adminCount).toBe(1);
  });

  it("rejects concierge-provisioning a folded/renamed central club (activeTo set)", async () => {
    // Real-data test, mirrors the equivalent self-serve assertion in
    // platform-signup.test.ts: skips cleanly if this deployment's central DB
    // happens to carry no folded/renamed row.
    const folded = await findFoldedCentralClub();
    if (!folded) {
      console.warn(
        "platform-admin-tenants.test.ts: no folded/renamed club found in " +
          "central.clubs — skipping the concierge folded-club rejection assertion.",
      );
      return;
    }

    const res = await request(app)
      .post("/api/platform/admin/tenants")
      .set("Cookie", platformCookie)
      .send({
        centralClubId: folded.clubId,
        slug: `pa-folded-${STAMP}`.slice(0, 40),
      })
      .expect(400);
    expect(res.body.error).toBeTruthy();
  });
});
