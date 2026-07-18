import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  playersTable,
  playerGradeStatsTable,
  playerGradeSeasonStatsTable,
} from "@workspace/db";

/**
 * Central-tenant leakage regression (Phase 2). The reported production bug was a
 * reads-from-central tenant (Mandurah) seeing Halls Head players in Top
 * Performers, because a stats endpoint skipped the shouldReadCentral branch and
 * read the native (Halls-Head-only) tables. This suite pins the invariant: a
 * central tenant must NEVER receive native data from the stats/player/junior
 * read surface.
 *
 * It seeds a distinctively-named native player (native tables belong to the demo
 * tenant), then walks the endpoints as a central tenant and asserts the name
 * never appears. Tenant 1 (native) is checked on the same endpoint as a positive
 * control, so a future endpoint that silently returns nothing can't pass by
 * accident. The central DB in CI is empty, so central reads legitimately return
 * empty — the point is that native rows never bleed through.
 *
 * Real-DB integration test (needs DATABASE_URL; CENTRAL_DATABASE_URL must point
 * at a reachable DB, empty central schema is fine).
 */

const STAMP = Date.now();
const NATIVE_SURNAME = `Leakcheck${STAMP}`;
const NATIVE_GIVEN = "Zznative";
const SEASON = 2099;
const GRADE = "A Grade";

describe("central tenant never receives native (Halls Head) data", () => {
  let centralTenantId: number;
  let nativePlayerId: number;

  beforeAll(async () => {
    const [central] = await db
      .insert(tenantsTable)
      .values({
        slug: `iso-central-leak-${STAMP}`,
        centralClubId: 999999, // no such central club → central reads are empty
        readsFromCentral: true,
        name: "Iso Central Leak Tenant",
        plan: "pilot",
      })
      .returning();
    centralTenantId = central.id;

    const [player] = await db
      .insert(playersTable)
      .values({
        surname: NATIVE_SURNAME,
        givenName: NATIVE_GIVEN,
        totalRuns: 99999,
        totalWickets: 999,
        totalGames: 50,
      })
      .returning();
    nativePlayerId = player.id;

    await db.insert(playerGradeSeasonStatsTable).values({
      playerId: nativePlayerId,
      grade: GRADE,
      season: SEASON,
      games: 50,
      runs: 99999,
      wickets: 999,
    });
    await db.insert(playerGradeStatsTable).values({
      playerId: nativePlayerId,
      surname: NATIVE_SURNAME,
      givenName: NATIVE_GIVEN,
      grade: GRADE,
      season: SEASON,
      games: 50,
      runs: 99999,
      wickets: 999,
    });
  });

  afterAll(async () => {
    await db
      .delete(playerGradeSeasonStatsTable)
      .where(eq(playerGradeSeasonStatsTable.playerId, nativePlayerId));
    await db
      .delete(playerGradeStatsTable)
      .where(eq(playerGradeStatsTable.playerId, nativePlayerId));
    await db.delete(playersTable).where(eq(playersTable.id, nativePlayerId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, centralTenantId));
  });

  it("positive control: tenant 1 (native) DOES see the native player in Top Performers", async () => {
    const res = await request(app)
      .get(`/api/overview/top-performers?season=${SEASON}`)
      .set("x-tenant-id", "1")
      .expect(200);
    const names = [...res.body.topRunScorers, ...res.body.topWicketTakers].map(
      (p: { surname: string }) => p.surname,
    );
    expect(names).toContain(NATIVE_SURNAME);
  });

  it("/overview/top-performers: a central tenant never sees the native player", async () => {
    const res = await request(app)
      .get(`/api/overview/top-performers?season=${SEASON}`)
      .set("x-tenant-id", String(centralTenantId))
      .expect(200);
    const names = [...res.body.topRunScorers, ...res.body.topWicketTakers].map(
      (p: { surname: string }) => p.surname,
    );
    expect(names).not.toContain(NATIVE_SURNAME);
  });

  it("/overview/top-performers?allTime: a central tenant never sees the native player", async () => {
    const res = await request(app)
      .get(`/api/overview/top-performers?allTime=true`)
      .set("x-tenant-id", String(centralTenantId))
      .expect(200);
    const names = [...res.body.topRunScorers, ...res.body.topWicketTakers].map(
      (p: { surname: string }) => p.surname,
    );
    expect(names).not.toContain(NATIVE_SURNAME);
  });

  it("/stats: a central tenant's stats list never contains the native player", async () => {
    const res = await request(app)
      .get(`/api/stats?search=${NATIVE_SURNAME}`)
      .set("x-tenant-id", String(centralTenantId))
      .expect(200);
    const surnames = res.body.stats.map((s: { surname: string }) => s.surname);
    expect(surnames).not.toContain(NATIVE_SURNAME);
  });

  it("/players/:id/seasons: 404 for a central tenant using the native id (no crosswalk row)", async () => {
    await request(app)
      .get(`/api/players/${nativePlayerId}/seasons`)
      .set("x-tenant-id", String(centralTenantId))
      .expect(404);
  });

  it("/players/:id/matches: 404 for a central tenant using the native id (no crosswalk row)", async () => {
    await request(app)
      .get(`/api/players/${nativePlayerId}/matches`)
      .set("x-tenant-id", String(centralTenantId))
      .expect(404);
  });

  it("/juniors/top-performers: a central tenant gets the empty shape, no native juniors", async () => {
    const res = await request(app)
      .get(`/api/juniors/top-performers`)
      .set("x-tenant-id", String(centralTenantId))
      .expect(200);
    expect(res.body.topRunScorers).toEqual([]);
    expect(res.body.topWicketTakers).toEqual([]);
  });
});
