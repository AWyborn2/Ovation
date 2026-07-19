import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  clubsTable,
  matchesTable,
  importsTable,
  juniorMatchesTable,
} from "@workspace/db";
import {
  overlayNativeOpponents,
  overlayCentralOpponents,
  invalidateClubBrandOverlayCache,
} from "../lib/club-brand";

/**
 * Opponent-brand overlay on the recent-matches and junior surfaces (follow-up to
 * the scorecard/match-list overlay). Senior social cards already inherit the
 * overlay via GET /matches/:id (buildScorecard reads its opponentClub); this
 * covers the home-page recent-matches chips (/overview) and the junior match
 * detail that feeds junior match-summary cards. Real-DB integration test.
 */

const STAMP = Date.now();
const REGISTER_LOGO = `/objects/register/surf-${STAMP}.png`;
const TENANT_LOGO = `/objects/uploads/surf-brand-${STAMP}.png`;
const TENANT_PRIMARY = "#7733ff";
const GRADE = `Overlay Grade ${STAMP}`;
const CENTRAL_CLUB_ID = 780000 + (STAMP % 1000);
const JUNIOR_MATCH_ID = 900000000 + (STAMP % 100000000);

describe("opponent-brand overlay: recent-matches + junior surfaces", () => {
  let registerClubId: number;
  let tenantId: number;
  let importId: number;
  let seniorMatchId: number;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-opponent-surfaces";

    const [club] = await db
      .insert(clubsTable)
      .values({
        name: `Surf Register Club ${STAMP}`,
        logoUrl: REGISTER_LOGO,
        logoUrl128: REGISTER_LOGO,
        primaryColour: "#111111",
        shortName: "SRF",
      })
      .returning();
    registerClubId = club.id;

    const [tenant] = await db
      .insert(tenantsTable)
      .values({
        slug: `surf-branded-${STAMP}`,
        centralClubId: CENTRAL_CLUB_ID,
        appClubId: registerClubId,
        name: "Surf Branded Club",
        plan: "pilot",
        logoUrl: TENANT_LOGO,
        primaryColour: TENANT_PRIMARY,
      })
      .returning();
    tenantId = tenant.id;

    const [imp] = await db
      .insert(importsTable)
      .values({ filename: `surf-${STAMP}.csv` })
      .returning();
    importId = imp.id;

    // Senior match: latest season (2099) + a unique grade + a result so it
    // survives the not-empty-fixture filter and is the representative for its
    // grade in the /overview recent-matches list.
    const [match] = await db
      .insert(matchesTable)
      .values({
        importId,
        grade: GRADE,
        season: 2099,
        opponent: "Surf Register Club",
        opponentClubId: registerClubId,
        result: "Won by 5 wickets",
      })
      .returning();
    seniorMatchId = match.id;

    // Junior match vs the same club (feeds junior match-summary cards).
    await db.insert(juniorMatchesTable).values({
      id: JUNIOR_MATCH_ID,
      season: "2099/00",
      seasonStartYear: 2099,
      ageGroup: "U12",
      opponentName: "Surf Register Club",
      opponentClubId: registerClubId,
    });

    invalidateClubBrandOverlayCache();
  });

  afterAll(async () => {
    await db.delete(juniorMatchesTable).where(eq(juniorMatchesTable.id, JUNIOR_MATCH_ID));
    await db.delete(matchesTable).where(eq(matchesTable.id, seniorMatchId));
    await db.delete(importsTable).where(eq(importsTable.id, importId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
    await db.delete(clubsTable).where(eq(clubsTable.id, registerClubId));
    invalidateClubBrandOverlayCache();
  });

  // ---- batch helpers (hermetic) ----

  it("overlayNativeOpponents merges matched clubs and passes null/unmatched through", async () => {
    const out = await overlayNativeOpponents([
      { id: registerClubId, name: "reg", shortName: "SRF", logoUrl: REGISTER_LOGO, logoUrl128: REGISTER_LOGO, backgroundColour: null, primaryColour: "#111111" },
      null,
      { id: registerClubId + 555111, name: "other", shortName: null, logoUrl: "keep.png", logoUrl128: null, backgroundColour: null, primaryColour: null },
    ]);
    expect(out[0]!.logoUrl).toBe(TENANT_LOGO); // matched → overlaid
    expect(out[0]!.primaryColour).toBe(TENANT_PRIMARY);
    expect(out[1]).toBeNull(); // null passes through
    expect(out[2]!.logoUrl).toBe("keep.png"); // unmatched → register default kept
  });

  it("overlayCentralOpponents merges by central club id", async () => {
    const out = await overlayCentralOpponents([
      { id: CENTRAL_CLUB_ID, name: "c", shortName: null, logoUrl: null, logoUrl128: null, primaryColour: "#999999", secondaryColour: null },
    ]);
    expect(out[0]!.logoUrl).toBe(TENANT_LOGO);
    expect(out[0]!.primaryColour).toBe(TENANT_PRIMARY);
  });

  // ---- wiring (native, CI-safe) ----

  it("/overview recent-matches shows the opponent's uploaded brand", async () => {
    const res = await request(app)
      .get("/api/overview")
      .set("x-tenant-id", "1")
      .expect(200);
    const mine = (res.body.recentMatches as Array<{ grade: string; opponentClub: { logoUrl: string; primaryColour: string } | null }>).find(
      (m) => m.grade === GRADE,
    );
    expect(mine).toBeTruthy();
    expect(mine!.opponentClub).toBeTruthy();
    expect(mine!.opponentClub!.logoUrl).toBe(TENANT_LOGO);
    expect(mine!.opponentClub!.primaryColour).toBe(TENANT_PRIMARY);
  });

  it("/juniors/matches/:id shows the opponent's uploaded brand", async () => {
    const res = await request(app)
      .get(`/api/juniors/matches/${JUNIOR_MATCH_ID}`)
      .set("x-tenant-id", "1")
      .expect(200);
    expect(res.body.opponentClub).toBeTruthy();
    expect(res.body.opponentClub.logoUrl).toBe(TENANT_LOGO);
    expect(res.body.opponentClub.primaryColour).toBe(TENANT_PRIMARY);
  });
});
