import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, clubsTable, matchesTable, importsTable } from "@workspace/db";
import {
  getOpponentBrandsByAppClubId,
  getOpponentBrandsByCentralClubId,
  mergeOpponentBrand,
  invalidateClubBrandOverlayCache,
} from "../lib/club-brand";

/**
 * Opponent-brand overlay: a club that signed up as a tenant and uploaded its own
 * logo/colours should show THAT brand as the opponent on other tenants'
 * scorecards, overriding the PlayHQ-scraped register default (and supplying a
 * logo on the central path, whose register has none).
 *
 * The resolver + merge unit tests are hermetic (no central DB) and cover both
 * the app-club-id and central-club-id keying. The HTTP test covers the native
 * /matches/:id wiring; the central HTTP path needs the central DB (skipped in
 * CI like the other central-DB suites), but its keying + merge are proven by the
 * unit tests. Real-DB integration test (needs DATABASE_URL).
 */

const STAMP = Date.now();
const REGISTER_LOGO = `/objects/register/default-${STAMP}.png`;
const REGISTER_PRIMARY = "#111111";
const TENANT_LOGO = `/objects/uploads/brand-${STAMP}.png`;
const TENANT_PRIMARY = "#22cc88";
const TENANT_BG = "#003366";
const TENANT_SHORT = `OVR${STAMP % 1000}`;
const CENTRAL_CLUB_ID = 770000 + (STAMP % 1000);

describe("opponent-brand overlay: uploaded brands show as opponent branding", () => {
  let registerClubId: number;
  let brandedTenantId: number;
  let plainTenantId: number;
  let importId: number;
  let matchId: number;

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-opponent-brand";

    // A shared clubs-register row (the PlayHQ-scraped opponent default).
    const [club] = await db
      .insert(clubsTable)
      .values({
        name: `Overlay Register Club ${STAMP}`,
        logoUrl: REGISTER_LOGO,
        logoUrl128: REGISTER_LOGO,
        primaryColour: REGISTER_PRIMARY,
        shortName: "REG",
      })
      .returning();
    registerClubId = club.id;

    // A tenant that IS that club and has uploaded its own brand.
    const [branded] = await db
      .insert(tenantsTable)
      .values({
        slug: `ovl-branded-${STAMP}`,
        centralClubId: CENTRAL_CLUB_ID,
        appClubId: registerClubId,
        name: "Overlay Branded Club",
        plan: "pilot",
        shortName: TENANT_SHORT,
        logoUrl: TENANT_LOGO,
        backgroundColour: TENANT_BG,
        primaryColour: TENANT_PRIMARY,
      })
      .returning();
    brandedTenantId = branded.id;

    // A tenant with NO uploaded brand — must never produce an overlay.
    const [plain] = await db
      .insert(tenantsTable)
      .values({
        slug: `ovl-plain-${STAMP}`,
        centralClubId: CENTRAL_CLUB_ID + 1,
        appClubId: null,
        name: "Overlay Plain Club",
        plan: "pilot",
      })
      .returning();
    plainTenantId = plain.id;

    // A native match (viewed by the demo tenant #1) whose opponent is the
    // branded club, to prove the native /matches/:id wiring.
    const [imp] = await db
      .insert(importsTable)
      .values({ filename: `ovl-${STAMP}.csv` })
      .returning();
    importId = imp.id;
    const [match] = await db
      .insert(matchesTable)
      .values({
        importId,
        grade: "A Grade",
        season: 2099,
        opponent: "Overlay Register Club",
        opponentClubId: registerClubId,
      })
      .returning();
    matchId = match.id;

    invalidateClubBrandOverlayCache();
  });

  afterAll(async () => {
    await db.delete(matchesTable).where(eq(matchesTable.id, matchId));
    await db.delete(importsTable).where(eq(importsTable.id, importId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, brandedTenantId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, plainTenantId));
    await db.delete(clubsTable).where(eq(clubsTable.id, registerClubId));
    invalidateClubBrandOverlayCache();
  });

  // ---- resolver + merge (hermetic; covers app + central keying) ----

  it("resolves an overlay for a branded tenant by app club id", async () => {
    const map = await getOpponentBrandsByAppClubId([registerClubId]);
    const overlay = map.get(registerClubId);
    expect(overlay).toBeDefined();
    expect(overlay!.logoUrl).toBe(TENANT_LOGO);
    expect(overlay!.logoUrl128).toBe(TENANT_LOGO);
    expect(overlay!.primaryColour).toBe(TENANT_PRIMARY);
    expect(overlay!.backgroundColour).toBe(TENANT_BG);
    expect(overlay!.shortName).toBe(TENANT_SHORT);
  });

  it("resolves an overlay by central club id (the central path's logo source)", async () => {
    const map = await getOpponentBrandsByCentralClubId([CENTRAL_CLUB_ID]);
    const overlay = map.get(CENTRAL_CLUB_ID);
    expect(overlay).toBeDefined();
    expect(overlay!.logoUrl).toBe(TENANT_LOGO);
  });

  it("overlay carries ONLY cosmetic brand fields (no id/name/private data)", async () => {
    const map = await getOpponentBrandsByAppClubId([registerClubId]);
    const overlay = map.get(registerClubId)!;
    expect(Object.keys(overlay).sort()).toEqual(
      ["backgroundColour", "logoUrl", "logoUrl128", "primaryColour", "shortName"].sort(),
    );
  });

  it("merges the tenant brand over a native register default (tenant wins per-field)", async () => {
    const overlay = (await getOpponentBrandsByAppClubId([registerClubId])).get(registerClubId);
    const registerOpp = {
      id: registerClubId,
      name: "Overlay Register Club",
      shortName: "REG",
      logoUrl: REGISTER_LOGO,
      logoUrl128: REGISTER_LOGO,
      backgroundColour: null as string | null,
      primaryColour: REGISTER_PRIMARY,
    };
    const merged = mergeOpponentBrand(registerOpp, overlay);
    expect(merged.logoUrl).toBe(TENANT_LOGO);
    expect(merged.primaryColour).toBe(TENANT_PRIMARY);
    expect(merged.backgroundColour).toBe(TENANT_BG);
    // Non-brand fields pass through untouched.
    expect(merged.id).toBe(registerClubId);
    expect(merged.name).toBe("Overlay Register Club");
  });

  it("supplies a logo when merging over a central opponent that has none", async () => {
    const overlay = (await getOpponentBrandsByCentralClubId([CENTRAL_CLUB_ID])).get(
      CENTRAL_CLUB_ID,
    );
    const centralOpp = {
      id: CENTRAL_CLUB_ID,
      name: "Overlay Branded Club",
      shortName: null as string | null,
      logoUrl: null as string | null,
      logoUrl128: null as string | null,
      primaryColour: "#999999" as string | null,
      secondaryColour: null as string | null,
    };
    const merged = mergeOpponentBrand(centralOpp, overlay);
    expect(merged.logoUrl).toBe(TENANT_LOGO);
    expect(merged.logoUrl128).toBe(TENANT_LOGO);
    expect(merged.primaryColour).toBe(TENANT_PRIMARY);
    // A field the central shape doesn't have is never introduced.
    expect("backgroundColour" in merged).toBe(false);
  });

  it("returns no overlay for a club with no uploaded brand, or an unknown id", async () => {
    const none = await getOpponentBrandsByAppClubId([registerClubId + 987654]);
    expect(none.size).toBe(0);
    // mergeOpponentBrand with no overlay is an identity.
    const opp = {
      id: 1,
      name: "x",
      shortName: null as string | null,
      logoUrl: "reg.png" as string | null,
      logoUrl128: null as string | null,
      primaryColour: null as string | null,
      backgroundColour: null as string | null,
    };
    expect(mergeOpponentBrand(opp, undefined)).toEqual(opp);
  });

  // ---- native HTTP wiring ----

  it("GET /matches/:id shows the opponent's uploaded brand, not the register default", async () => {
    const res = await request(app)
      .get(`/api/matches/${matchId}`)
      .set("x-tenant-id", "1")
      .expect(200);
    expect(res.body.opponentClub).toBeTruthy();
    expect(res.body.opponentClub.id).toBe(registerClubId);
    expect(res.body.opponentClub.logoUrl).toBe(TENANT_LOGO);
    expect(res.body.opponentClub.primaryColour).toBe(TENANT_PRIMARY);
    expect(res.body.opponentClub.backgroundColour).toBe(TENANT_BG);
  });
});
