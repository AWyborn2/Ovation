import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  lifeMembersTable,
  honourBoardsTable,
  sponsorsTable,
  juniorParticipantsTable,
  adminsTable,
  cardThemesTable,
  socialSettingsTable,
  captionTemplatesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Tenant-isolation suite (Phase 0 step 6) — the proof that one tenant never sees
 * another's curated data. Seeds a synthetic tenant 2 with a handful of curated
 * rows (life member, honour board, sponsor, junior participant), then asserts:
 *   - x-tenant-id: 1 requests never return tenant 2's rows, and vice versa,
 *     across a representative endpoint per curated table family;
 *   - writes land with the caller's tenant_id (POST as tenant 2 → tenant_id 2,
 *     visible only to tenant 2);
 *   - everything is cleaned up afterwards.
 *
 * Real-DB integration test (needs DATABASE_URL), following the existing pattern.
 * Tenant 1 = Halls Head (the seeded default); tenant 2 is created here.
 */

const STAMP = Date.now();
const T2_HB_KEY = `iso_board_t2_${STAMP}`;
const T2_LM_NAME = `Iso LifeMember T2 ${STAMP}`;
const T2_SPONSOR_NAME = `Iso Sponsor T2 ${STAMP}`;
const T2_PARTICIPANT_ID = `iso-participant-t2-${STAMP}`;
const T2_PARTICIPANT_NAME = `Iso Junior T2 ${STAMP}`;
const T2_THEME_NAME = `Iso Theme T2 ${STAMP}`;

describe("tenant isolation: curated tables never leak across tenants", () => {
  let tenant2Id: number;
  let adminId: number;
  let adminCookie: string;
  let adminT1Id: number;
  let adminT1Cookie: string;
  let sponsorId: number;
  let themeId: number;
  const createdLifeMemberIds: number[] = [];

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-for-tenant-isolation";

    const [tenant2] = await db
      .insert(tenantsTable)
      .values({
        slug: `iso-tenant-2-${STAMP}`,
        centralClubId: 999,
        appClubId: null,
        name: "Iso Test Tenant 2",
        plan: "pilot",
      })
      .returning();
    tenant2Id = tenant2.id;

    await db
      .insert(lifeMembersTable)
      .values({ tenantId: tenant2Id, name: T2_LM_NAME, inductionYear: 2099 });
    await db.insert(honourBoardsTable).values({
      tenantId: tenant2Id,
      key: T2_HB_KEY,
      label: "Iso Board",
      title: "Iso Board",
    });
    const [sponsor] = await db
      .insert(sponsorsTable)
      .values({
        tenantId: tenant2Id,
        name: T2_SPONSOR_NAME,
        logoUrl: "https://example.com/iso.png",
      })
      .returning();
    sponsorId = sponsor.id;
    const [theme] = await db
      .insert(cardThemesTable)
      .values({ tenantId: tenant2Id, name: T2_THEME_NAME })
      .returning();
    themeId = theme.id;
    await db.insert(juniorParticipantsTable).values({
      participantId: T2_PARTICIPANT_ID,
      tenantId: tenant2Id,
      displayName: T2_PARTICIPANT_NAME,
      isPrivate: false,
    });

    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenant2Id,
        username: `iso_admin_${STAMP}`,
        displayName: "Iso Admin",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;

    // A tenant-1-scoped admin, used to prove tenant 1 cannot touch tenant 2's
    // resources even with a validly tenant-matched session (not just an
    // unauthenticated/mismatched-tenant request).
    const [adminT1] = await db
      .insert(adminsTable)
      .values({
        tenantId: 1,
        username: `iso_admin_t1_${STAMP}`,
        displayName: "Iso Admin T1",
        passwordHash: "x",
      })
      .returning();
    adminT1Id = adminT1.id;
    adminT1Cookie = `${SESSION_COOKIE}=${encodeSession({ adminId: adminT1Id, issuedAt: Date.now() })}`;
  });

  afterAll(async () => {
    for (const id of createdLifeMemberIds) {
      await db.delete(lifeMembersTable).where(eq(lifeMembersTable.id, id));
    }
    await db.delete(lifeMembersTable).where(eq(lifeMembersTable.tenantId, tenant2Id));
    await db.delete(honourBoardsTable).where(eq(honourBoardsTable.tenantId, tenant2Id));
    await db.delete(sponsorsTable).where(eq(sponsorsTable.tenantId, tenant2Id));
    await db.delete(cardThemesTable).where(eq(cardThemesTable.tenantId, tenant2Id));
    await db
      .delete(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.tenantId, tenant2Id));
    // Rows this suite never inserts but a READ creates: GET /social-settings
    // calls ensureSettings, which lazily provisions the tenant's settings
    // singleton and seeds its default caption templates. Both FK to tenants, so
    // leaving them behind makes the tenant delete below fail — and the failure
    // surfaces as an opaque teardown error, not as a named test.
    await db
      .delete(captionTemplatesTable)
      .where(eq(captionTemplatesTable.tenantId, tenant2Id));
    await db
      .delete(socialSettingsTable)
      .where(eq(socialSettingsTable.tenantId, tenant2Id));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminT1Id));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenant2Id));
  });

  // ---- Reads: tenant 1 must not see tenant 2's rows, and vice versa ----------

  it("life-members: tenant 2's row is hidden from tenant 1 and visible to tenant 2", async () => {
    const asT1 = await request(app)
      .get("/api/life-members")
      .set("x-tenant-id", "1")
      .expect(200);
    expect(asT1.body.some((r: { name: string }) => r.name === T2_LM_NAME)).toBe(false);

    const asT2 = await request(app)
      .get("/api/life-members")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.some((r: { name: string }) => r.name === T2_LM_NAME)).toBe(true);
  });

  it("honour-boards: tenant 2's board is hidden from tenant 1 and visible to tenant 2", async () => {
    const asT1 = await request(app)
      .get("/api/honour-boards")
      .set("x-tenant-id", "1")
      .expect(200);
    expect(asT1.body.some((r: { key: string }) => r.key === T2_HB_KEY)).toBe(false);

    const asT2 = await request(app)
      .get("/api/honour-boards")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.some((r: { key: string }) => r.key === T2_HB_KEY)).toBe(true);
  });

  it("sponsors: tenant 2's sponsor is hidden from tenant 1 and visible to tenant 2", async () => {
    const asT1 = await request(app)
      .get("/api/sponsors")
      .set("x-tenant-id", "1")
      .expect(200);
    expect(asT1.body.some((r: { name: string }) => r.name === T2_SPONSOR_NAME)).toBe(false);

    const asT2 = await request(app)
      .get("/api/sponsors")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.some((r: { name: string }) => r.name === T2_SPONSOR_NAME)).toBe(true);
  });

  /**
   * Regression: `/social-settings` carries `activeSponsors`, which every share
   * card and the honour-board kiosk render from. `loadActiveSponsors` filtered
   * on the sponsor's active-date window ALONE — no tenant predicate — so every
   * tenant received the union of every tenant's sponsors: another club's logos
   * on your cards, and another club's name on the "presented by" line.
   *
   * The `/api/sponsors` case above did not catch it because that endpoint was
   * correctly scoped; the leak was only on the bundle's read path.
   */
  it("social settings: activeSponsors never carries another tenant's sponsor", async () => {
    const asT1 = await request(app)
      .get("/api/social-settings")
      .set("x-tenant-id", "1")
      .expect(200);
    expect(
      asT1.body.activeSponsors.some((s: { name: string }) => s.name === T2_SPONSOR_NAME),
    ).toBe(false);

    const asT2 = await request(app)
      .get("/api/social-settings")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(
      asT2.body.activeSponsors.some((s: { name: string }) => s.name === T2_SPONSOR_NAME),
    ).toBe(true);
  });

  // Phase 3 U2 regression: PATCH/DELETE on sponsors/card-themes previously had
  // NO tenant filter at all (only GET/POST were scoped) — tenant 1's admin
  // could edit or delete tenant 2's rows just by knowing/guessing an id.
  it("sponsors: PATCH/DELETE cannot touch another tenant's sponsor", async () => {
    await request(app)
      .patch(`/api/sponsors/${sponsorId}`)
      .set("Cookie", adminT1Cookie)
      .set("x-tenant-id", "1")
      .send({ name: "Hijacked" })
      .expect(404);
    await request(app)
      .delete(`/api/sponsors/${sponsorId}`)
      .set("Cookie", adminT1Cookie)
      .set("x-tenant-id", "1")
      .expect(404);

    const [row] = await db.select().from(sponsorsTable).where(eq(sponsorsTable.id, sponsorId));
    expect(row).toBeDefined();
    expect(row.name).toBe(T2_SPONSOR_NAME);
  });

  it("card-themes: tenant 2's theme is hidden from tenant 1 and visible to tenant 2", async () => {
    const asT1 = await request(app)
      .get("/api/card-themes")
      .set("x-tenant-id", "1")
      .expect(200);
    expect(asT1.body.some((r: { name: string }) => r.name === T2_THEME_NAME)).toBe(false);

    const asT2 = await request(app)
      .get("/api/card-themes")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.some((r: { name: string }) => r.name === T2_THEME_NAME)).toBe(true);
  });

  it("card-themes: PATCH/DELETE cannot touch another tenant's theme", async () => {
    await request(app)
      .patch(`/api/card-themes/${themeId}`)
      .set("Cookie", adminT1Cookie)
      .set("x-tenant-id", "1")
      .send({ name: "Hijacked" })
      .expect(404);
    await request(app)
      .delete(`/api/card-themes/${themeId}`)
      .set("Cookie", adminT1Cookie)
      .set("x-tenant-id", "1")
      .expect(404);

    const [row] = await db.select().from(cardThemesTable).where(eq(cardThemesTable.id, themeId));
    expect(row).toBeDefined();
    expect(row.name).toBe(T2_THEME_NAME);
  });

  it("juniors players: tenant 2's participant is hidden from tenant 1 and visible to tenant 2", async () => {
    const asT1 = await request(app)
      .get("/api/juniors/players")
      .set("x-tenant-id", "1")
      .expect(200);
    expect(
      asT1.body.some((r: { displayName?: string }) => r.displayName === T2_PARTICIPANT_NAME),
    ).toBe(false);

    const asT2 = await request(app)
      .get("/api/juniors/players")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(
      asT2.body.some((r: { displayName?: string }) => r.displayName === T2_PARTICIPANT_NAME),
    ).toBe(true);
  });

  // ---- Writes: a row lands with the CALLER's tenant_id -----------------------

  it("writes land with the caller's tenant_id (POST as tenant 2)", async () => {
    const name = `Iso Write LM ${STAMP}`;
    const created = await request(app)
      .post("/api/life-members")
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenant2Id))
      .send({ name, inductionYear: 2098 })
      .expect(201);
    createdLifeMemberIds.push(created.body.id);

    // Stored tenant_id is the caller's, regardless of body.
    const [row] = await db
      .select()
      .from(lifeMembersTable)
      .where(eq(lifeMembersTable.id, created.body.id));
    expect(row.tenantId).toBe(tenant2Id);

    // Visible to tenant 2, invisible to tenant 1.
    const asT1 = await request(app).get("/api/life-members").set("x-tenant-id", "1").expect(200);
    expect(asT1.body.some((r: { name: string }) => r.name === name)).toBe(false);
    const asT2 = await request(app)
      .get("/api/life-members")
      .set("x-tenant-id", String(tenant2Id))
      .expect(200);
    expect(asT2.body.some((r: { name: string }) => r.name === name)).toBe(true);
  });

  it("a write cannot smuggle another tenant's id via the body", async () => {
    const name = `Iso NoSmuggle LM ${STAMP}`;
    const created = await request(app)
      .post("/api/life-members")
      .set("Cookie", adminCookie)
      .set("x-tenant-id", String(tenant2Id))
      // Attempt to force tenant 1 via the body — must be ignored.
      .send({ name, inductionYear: 2097, tenantId: 1 })
      .expect(201);
    createdLifeMemberIds.push(created.body.id);

    const [row] = await db
      .select()
      .from(lifeMembersTable)
      .where(eq(lifeMembersTable.id, created.body.id));
    expect(row.tenantId).toBe(tenant2Id);
  });
});
