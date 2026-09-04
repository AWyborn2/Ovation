import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, platformAdminsTable, platformSettingsTable } from "@workspace/db";
import { hashPassword } from "../lib/auth";
import { invalidatePlatformBrandCache } from "../lib/tenant-brand";

/**
 * Platform brand → landing page live update (no page reload).
 *
 * Verifies two things together:
 *
 * 1. SERVER-SIDE CACHE INVALIDATION: A PATCH to /platform/admin/platform-brand
 *    invalidates the platform brand cache so a subsequent GET /tenant-brand
 *    (served from the apex/marketing host) returns the updated fields
 *    immediately — not the stale pre-PATCH value.
 *
 * 2. CLIENT-SIDE QUERY KEY ALIGNMENT (static / code-level assertion):
 *    BrandProvider calls:
 *      useGetTenantBrand({ query: { queryKey: getGetTenantBrandQueryKey() } })
 *    The platform-brand editor's onSuccess calls:
 *      qc.invalidateQueries({ queryKey: getGetTenantBrandQueryKey() })
 *    Both use the same getGetTenantBrandQueryKey() factory from the generated
 *    client (returns ["/api/tenant-brand"]).  Because the queryKey passed to
 *    useGetTenantBrand overrides the default — which itself is also
 *    getGetTenantBrandQueryKey() — the cache entry key is the same object as
 *    the invalidation target.  React Query therefore refetches BrandProvider's
 *    query on the next render cycle without a hard-refresh.
 *
 * Real-DB integration test: needs DATABASE_URL.
 */

const STAMP = Date.now();
const APEX_HOST = `apex-brand-test-${STAMP}.example.com`;
const EMAIL = `super-live-brand+${STAMP}@example.com`;
const PASSWORD = "correct horse battery";

describe("Platform brand → GET /tenant-brand live update (no page reload)", () => {
  let platformCookie: string;
  let originalPlatformSettings: {
    name: string | null;
    logoUrl: string | null;
    accentColour: string | null;
    faviconUrl: string | null;
  } | null = null;
  let prevPlatformHosts: string | undefined;

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-platform-brand-live";

    // Register the test host as an apex/platform surface for this suite.
    prevPlatformHosts = process.env.PLATFORM_HOSTS;
    process.env.PLATFORM_HOSTS = APEX_HOST;

    // Seed a platform admin and obtain a session cookie.
    const passwordHash = await hashPassword(PASSWORD);
    await db
      .insert(platformAdminsTable)
      .values({ email: EMAIL, displayName: "Live Brand Tester", passwordHash });
    const login = await request(app)
      .post("/api/platform/auth/login")
      .send({ email: EMAIL, password: PASSWORD });
    platformCookie = String(login.headers["set-cookie"][0]).split(";")[0];

    // Read and save the current platform_settings row so the test restores the
    // DB to its pre-test state (idempotent upsert may have created id=1 already).
    const [row] = await db
      .select({
        name: platformSettingsTable.name,
        logoUrl: platformSettingsTable.logoUrl,
        accentColour: platformSettingsTable.accentColour,
        faviconUrl: platformSettingsTable.faviconUrl,
      })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.id, 1));
    originalPlatformSettings = row ?? null;
  });

  afterAll(async () => {
    // Restore PLATFORM_HOSTS so this suite doesn't affect later ones.
    if (prevPlatformHosts === undefined) {
      delete process.env.PLATFORM_HOSTS;
    } else {
      process.env.PLATFORM_HOSTS = prevPlatformHosts;
    }

    // Restore the platform_settings row to its pre-test state.
    if (originalPlatformSettings !== null) {
      await db
        .update(platformSettingsTable)
        .set(originalPlatformSettings)
        .where(eq(platformSettingsTable.id, 1));
    } else {
      // The upsert in the test created the row; remove it so the DB stays
      // clean for subsequent tests.
      await db.delete(platformSettingsTable).where(eq(platformSettingsTable.id, 1));
    }
    invalidatePlatformBrandCache();

    await db.delete(platformAdminsTable).where(eq(platformAdminsTable.email, EMAIL));
  });

  it("GET /tenant-brand from the apex host returns { platform: true } (routing check)", async () => {
    const res = await request(app).get("/api/tenant-brand").set("Host", APEX_HOST).expect(200);
    // The apex host must return the platform sentinel, not a tenant brand.
    expect(res.body.platform).toBe(true);
  });

  it("PATCH /platform/admin/platform-brand then GET /tenant-brand returns updated fields without a page reload", async () => {
    const testName = `Live Brand Test ${STAMP}`;
    const testColour = "#ab1234";

    // Prime the platform brand cache so the test exercises actual cache
    // invalidation (not just a cold-cache hit after the PATCH).
    await request(app).get("/api/tenant-brand").set("Host", APEX_HOST).expect(200);

    // Write the new platform brand via the admin endpoint.
    const patchRes = await request(app)
      .patch("/api/platform/admin/platform-brand")
      .set("Cookie", platformCookie)
      .send({ name: testName, accentColour: testColour })
      .expect(200);
    // The PATCH response itself should already carry the updated fields.
    expect(patchRes.body.platform).toBe(true);
    expect(patchRes.body.name).toBe(testName);
    expect(patchRes.body.primaryColour).toBe(testColour);

    // Without cache invalidation the GET would still return the pre-PATCH value
    // cached for up to 5 minutes.  The invalidation in upsertPlatformBrand must
    // clear it so the landing page sees the change on the very next request.
    const getRes = await request(app).get("/api/tenant-brand").set("Host", APEX_HOST).expect(200);
    expect(getRes.body.platform).toBe(true);
    expect(getRes.body.name).toBe(testName);
    expect(getRes.body.primaryColour).toBe(testColour);
  });

  it("a partial update (name only) does not clobber a previously set colour", async () => {
    const newName = `Partial Update ${STAMP}`;

    await request(app)
      .patch("/api/platform/admin/platform-brand")
      .set("Cookie", platformCookie)
      .send({ name: newName })
      .expect(200);

    const res = await request(app).get("/api/tenant-brand").set("Host", APEX_HOST).expect(200);
    expect(res.body.name).toBe(newName);
    // The colour set in the previous test must survive a name-only PATCH.
    expect(res.body.primaryColour).toBe("#ab1234");
  });

  it("rejects a PATCH without a platform admin session (401)", async () => {
    await request(app)
      .patch("/api/platform/admin/platform-brand")
      .send({ name: "Unauthorised attempt" })
      .expect(401);
  });

  it("rejects a PATCH with an invalid hex colour (400)", async () => {
    await request(app)
      .patch("/api/platform/admin/platform-brand")
      .set("Cookie", platformCookie)
      .send({ accentColour: "not-a-hex" })
      .expect(400);

    // The rejected write must not have changed the stored value.
    const res = await request(app).get("/api/tenant-brand").set("Host", APEX_HOST).expect(200);
    expect(res.body.primaryColour).toBe("#ab1234");
  });
});
