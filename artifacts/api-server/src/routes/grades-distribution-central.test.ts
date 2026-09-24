import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import { db, tenantsTable, playerIdMapTable } from "@workspace/db";
import { mintPlayerIdMap } from "@workspace/db/provision";

/**
 * GET /grades/:grade/distribution against a real central schema (the CI
 * fixture, seed-ci-central-fixture.ts) — proves the central aggregate SQL runs
 * on Postgres and the route resolves identity through the crosswalk.
 * Real-DB integration test (DATABASE_URL + CENTRAL_DATABASE_URL); skipped when
 * no database is configured.
 *
 * Fixture: central club 2 (Mandurah) played A Grade 2024/25 matches 1001 and
 * 1002 with Casey Fixture (public) and Private Fixture (private). Casey batted
 * 20 (40 balls) and 21 (42 balls) and bowled 8 overs, 1 maiden, 1/30 in each.
 */

const MANDURAH = 2;
const CASEY = "33333333-3333-4333-8333-333333333333";
const STAMP = Date.now();

describe.skipIf(!process.env.DATABASE_URL)("central grade distribution", () => {
  let tenantId: number;

  beforeAll(async () => {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `dist-man-${STAMP}`,
        centralClubId: MANDURAH,
        name: `dist-man-${STAMP}`,
        readsFromCentral: true,
        plan: "club",
      })
      .returning();
    tenantId = t!.id;
    await mintPlayerIdMap(tenantId, MANDURAH);
  });

  afterAll(async () => {
    if (!tenantId) return;
    await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, tenantId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  });

  const get = (qs: string) =>
    request(app)
      .get(`/api/grades/A%20Grade/distribution${qs}`)
      .set("x-tenant-id", String(tenantId))
      .expect(200);

  it("aggregates by GUID, crosswalks the id, omits the private player", async () => {
    const [mapped] = await db
      .select({ playerId: playerIdMapTable.playerId })
      .from(playerIdMapTable)
      .where(eq(playerIdMapTable.participantId, CASEY));
    const res = await get("?minInnings=1&minOvers=1");

    expect(res.body.players).toHaveLength(1);
    const [p] = res.body.players;
    expect(p.playerId).toBeGreaterThan(0);
    expect(p.playerId).toBe(mapped!.playerId);
    expect(p).toMatchObject({ givenName: "Casey", surname: "Fixture", games: 2 });
    expect(p.batting).toMatchObject({ innings: 2, runs: 41, highScore: 21, ballsFaced: 82 });
    // 41 off 82 balls is below the 120-ball floor for a strike rate (MIN_STRIKE_RATE_BALLS).
    expect(p.batting.strikeRate).toBeNull();
    // 2 × 8 decimal overs = 96 balls; economy per six balls, SR balls per wicket.
    expect(p.bowling).toMatchObject({
      overs: "16",
      ballsBowled: 96,
      maidens: 2,
      wickets: 2,
      runsConceded: 60,
      average: 30,
      economy: 3.75,
      strikeRate: 48,
    });
    expect(res.body.best).toMatchObject({ runs: 41, wickets: 2, economy: 3.75 });
  });

  it("applies the default qualifiers and the season span", async () => {
    // Two innings and 16 overs are below the 10-innings / 50-over defaults.
    expect((await get("")).body.players).toEqual([]);
    expect((await get("?fromSeason=2024&toSeason=2024&minInnings=1")).body.players).toHaveLength(1);
    expect((await get("?fromSeason=2025&minInnings=1&minOvers=1")).body.players).toEqual([]);
  });
});
