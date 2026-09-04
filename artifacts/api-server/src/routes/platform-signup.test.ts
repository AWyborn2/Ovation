import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playerIdMapTable,
  provisioningExclusionsTable,
} from "@workspace/db";
import { findFoldedCentralClub } from "../lib/central-club.test-helpers";

/**
 * Self-serve signup E2E (Phase 2b). Picks a real available central club, claims a
 * subdomain, creates the first admin, and asserts the club then disappears from
 * the picker and the slug/club can't be claimed twice. Reserved slugs and an
 * SIGNUP_MODE=off kill-switch are rejected.
 *
 * Real-DB integration test: needs DATABASE_URL AND CENTRAL_DATABASE_URL (it reads
 * central.clubs and mints the player crosswalk), following the supertest pattern.
 */

const STAMP = Date.now();
const SLUG = `iso-signup-${STAMP}`.slice(0, 40);

// The signup limiter is 5 requests per IP per hour and its in-memory store
// spans this whole file, so give every signup attempt its own client address
// (trust proxy is 1, so X-Forwarded-For sets req.ip). The limiter itself is
// covered by rate-limit.test.ts.
let ipCounter = 0;
const uniqueIp = (): string => `10.77.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`;

describe("platform self-serve signup", () => {
  let createdTenantId: number | null = null;

  beforeAll(() => {
    process.env.SIGNUP_MODE = "pca";
  });

  afterEach(() => {
    process.env.SIGNUP_MODE = "pca";
  });

  afterAll(async () => {
    if (createdTenantId != null) {
      await db.delete(adminsTable).where(eq(adminsTable.tenantId, createdTenantId));
      await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, createdTenantId));
      await db.delete(tenantsTable).where(eq(tenantsTable.id, createdTenantId));
    }
    delete process.env.SIGNUP_MODE;
  });

  it("provisions a tenant from an available club and removes it from the picker", async () => {
    const before = await request(app).get("/api/platform/available-clubs");
    expect(before.status).toBe(200);
    expect(Array.isArray(before.body)).toBe(true);
    expect(before.body.length).toBeGreaterThan(0);

    const club = before.body[0];

    const signup = await request(app)
      .post("/api/platform/signup")
      .set("x-forwarded-for", uniqueIp())
      .send({
        centralClubId: club.centralClubId,
        slug: SLUG,
        adminEmail: `owner+${STAMP}@example.com`,
        password: "correct horse battery",
      });
    expect(signup.status).toBe(201);
    expect(signup.body.slug).toBe(SLUG);
    expect(signup.body.redirectUrl).toContain(`${SLUG}.`);
    createdTenantId = signup.body.tenantId;

    // Signup mints a session immediately (U1) — no separate login call needed.
    const setCookie = signup.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const sessionCookieHeader = (Array.isArray(setCookie) ? setCookie : [setCookie]).find(
      (c: string) => c.startsWith("ovation_session="),
    );
    expect(sessionCookieHeader).toBeDefined();

    // The cookie's domain is scoped to the shared apex, not just the request
    // host that set it, since the redirectUrl above sends the browser to a
    // different host (the new tenant's own subdomain).
    expect(sessionCookieHeader!.toLowerCase()).toContain("domain=");

    const sessionCookie = sessionCookieHeader!.split(";")[0];
    const me = await request(app)
      .get("/api/auth/me")
      .set("Cookie", sessionCookie)
      .set("x-tenant-id", String(createdTenantId));
    expect(me.status).toBe(200);
    expect(me.body.username).toBe(`owner+${STAMP}@example.com`);

    // The tenant exists, reads from central, and got its first admin.
    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, createdTenantId!));
    expect(tenant.readsFromCentral).toBe(true);
    expect(tenant.centralClubId).toBe(club.centralClubId);
    const admins = await db
      .select()
      .from(adminsTable)
      .where(eq(adminsTable.tenantId, createdTenantId!));
    expect(admins).toHaveLength(1);

    // The claimed club is no longer offered.
    const after = await request(app).get("/api/platform/available-clubs");
    expect(
      after.body.some((c: { centralClubId: number }) => c.centralClubId === club.centralClubId),
    ).toBe(false);
  });

  it.skipIf(process.env.CI_SKIP_DATA_TESTS)("rejects re-claiming the same slug (409)", async () => {
    const dup = await request(app)
      .post("/api/platform/signup")
      .set("x-forwarded-for", uniqueIp())
      .send({
        centralClubId: 999999, // irrelevant; slug check should fire
        slug: SLUG,
        adminEmail: `dupe+${STAMP}@example.com`,
        password: "correct horse battery",
      });
    expect(dup.status).toBe(409);
  });

  it("rejects a reserved slug (400)", async () => {
    const res = await request(app)
      .post("/api/platform/signup")
      .set("x-forwarded-for", uniqueIp())
      .send({
        centralClubId: 1,
        slug: "admin",
        adminEmail: `x+${STAMP}@example.com`,
        password: "correct horse battery",
      });
    expect(res.status).toBe(400);
  });

  it("excludes folded/renamed central clubs (activeTo set) from the picker and rejects direct signup", async () => {
    // Real-data test: finds an actual folded/renamed row in central.clubs
    // (active_to set) rather than asserting against a fabricated id, since the
    // available-clubs endpoint never exposes activeTo for us to fabricate
    // against. If this deployment's central DB happens to carry none (every
    // club still active_to = null), there's nothing to assert — skip cleanly
    // rather than failing on data the environment doesn't have.
    const folded = await findFoldedCentralClub();
    if (!folded) {
      console.warn(
        "platform-signup.test.ts: no folded/renamed club (activeTo set) found in " +
          "central.clubs — skipping the folded-club exclusion assertions.",
      );
      return;
    }

    const clubs = await request(app).get("/api/platform/available-clubs").expect(200);
    expect(
      clubs.body.some((c: { centralClubId: number }) => c.centralClubId === folded.clubId),
    ).toBe(false);

    const signup = await request(app)
      .post("/api/platform/signup")
      .set("x-forwarded-for", uniqueIp())
      .send({
        centralClubId: folded.clubId,
        slug: `folded-${STAMP}`,
        adminEmail: `folded+${STAMP}@example.com`,
        password: "correct horse battery",
      });
    expect(signup.status).toBe(400);
  });

  it.each(["everywhere", "self_serve_only"] as const)(
    "excludes a club with a %s provisioning exclusion from the picker and rejects direct signup",
    async (visibility) => {
      const before = await request(app).get("/api/platform/available-clubs").expect(200);
      expect(before.body.length).toBeGreaterThan(0);
      const club = before.body[0];

      const [exclusion] = await db
        .insert(provisioningExclusionsTable)
        .values({
          centralClubId: club.centralClubId,
          clubName: club.name,
          visibility,
          createdByPlatformAdminId: 1,
        })
        .returning();
      try {
        const after = await request(app).get("/api/platform/available-clubs").expect(200);
        expect(
          after.body.some((c: { centralClubId: number }) => c.centralClubId === club.centralClubId),
        ).toBe(false);

        const signup = await request(app)
          .post("/api/platform/signup")
          .set("x-forwarded-for", uniqueIp())
          .send({
            centralClubId: club.centralClubId,
            slug: `excl-${visibility}-${STAMP}`.slice(0, 40),
            adminEmail: `excl-${visibility}+${STAMP}@example.com`,
            password: "correct horse battery",
          });
        expect(signup.status).toBe(400);
      } finally {
        await db
          .delete(provisioningExclusionsTable)
          .where(eq(provisioningExclusionsTable.id, exclusion!.id));
      }
    },
  );

  it("is disabled when SIGNUP_MODE=off (403)", async () => {
    process.env.SIGNUP_MODE = "off";
    const clubs = await request(app).get("/api/platform/available-clubs");
    expect(clubs.status).toBe(403);
    const signup = await request(app)
      .post("/api/platform/signup")
      .set("x-forwarded-for", uniqueIp())
      .send({
        centralClubId: 1,
        slug: `off-${STAMP}`,
        adminEmail: `x@example.com`,
        password: "correct horse battery",
      });
    expect(signup.status).toBe(403);
  });
});
