import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  honourDisplaySettingsTable,
  playerGradeStatsTable,
  playerIdMapTable,
  playersTable,
  tenantsTable,
} from "@workspace/db";
import { mintPlayerIdMap } from "@workspace/db/provision";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Honour display tenant isolation (hybrid stats plan U1, R1).
 *
 * The by-grade records boards and the Most Games board used to read the
 * native (Halls Head) stats tables for every tenant, so a central club's
 * clubroom display listed Halls Head players. Both builders now take the
 * request's DataSource: native keeps today's query, central builds the boards
 * from the tenant's central club, mapped through its crosswalk.
 *
 * Real-DB integration test (DATABASE_URL + CENTRAL_DATABASE_URL, with the CI
 * central fixture from seed-ci-central-fixture.ts); skipped without a database.
 *
 * Fixture facts used below: central club 2 (Mandurah) played A Grade 2024/25
 * matches 1001 and 1002 with Casey Fixture (public) and Private Fixture
 * (private). Casey batted 20 and 21 and took 1 wicket in each. Central club 4
 * (the folded club) has no matches at all.
 */

type Entry = { primaryText: string; detail?: string | null; playerId?: number | null };
type Board = { id: string; category: string; title: string; entries: Entry[] };
type Bundle = { boards: Board[] };

const STAMP = Date.now();
const MANDURAH = 2;
const FOLDED_CLUB = 4;
const CASEY = "33333333-3333-4333-8333-333333333333";
// A native (tenant 1) player and grade no real row can collide with.
const NATIVE_SURNAME = `Leakcheck${STAMP}`;
const NATIVE_GRADE = `Leak Grade ${STAMP}`;

describe.skipIf(!process.env.DATABASE_URL)("honour display: stats boards are tenant-scoped", () => {
  let centralTenantId: number;
  let emptyTenantId: number;
  let nativePlayerId: number;
  const adminIds: number[] = [];
  const cookies = new Map<number, string>();

  async function adminFor(tenantId: number): Promise<void> {
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId,
        username: `hd_iso_${tenantId}_${STAMP}`,
        displayName: "HD Iso Admin",
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin!.id);
    cookies.set(
      tenantId,
      `${SESSION_COOKIE}=${encodeSession({ adminId: admin!.id, issuedAt: Date.now() })}`,
    );
  }

  async function bundleFor(tenantId: number): Promise<Bundle> {
    const res = await request(app)
      .get("/api/honour-display")
      .set("x-tenant-id", String(tenantId))
      .set("Cookie", cookies.get(tenantId)!)
      .expect(200);
    return res.body as Bundle;
  }

  const statsBoards = (b: Bundle) =>
    b.boards.filter((x) => x.category === "records_by_grade" || x.category === "most_games");

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-hd-isolation";

    const [central] = await db
      .insert(tenantsTable)
      .values({
        slug: `hd-iso-man-${STAMP}`,
        centralClubId: MANDURAH,
        name: `hd-iso-man-${STAMP}`,
        readsFromCentral: true,
        plan: "club",
      })
      .returning();
    centralTenantId = central!.id;
    await mintPlayerIdMap(centralTenantId, MANDURAH);

    const [empty] = await db
      .insert(tenantsTable)
      .values({
        slug: `hd-iso-empty-${STAMP}`,
        centralClubId: FOLDED_CLUB,
        name: `hd-iso-empty-${STAMP}`,
        readsFromCentral: true,
        plan: "club",
      })
      .returning();
    emptyTenantId = empty!.id;

    // A native Halls Head player who tops both native boards.
    const [p] = await db
      .insert(playersTable)
      .values({ surname: NATIVE_SURNAME, givenName: "Native", totalGames: 987654 })
      .returning();
    nativePlayerId = p!.id;
    await db.insert(playerGradeStatsTable).values({
      playerId: nativePlayerId,
      surname: NATIVE_SURNAME,
      givenName: "Native",
      grade: NATIVE_GRADE,
      games: 321,
      runs: 4321,
      wickets: 123,
      highScore: "150*",
      bestBowling: "7/20",
      catches: 45,
    });

    await adminFor(1);
    await adminFor(centralTenantId);
    await adminFor(emptyTenantId);
  });

  afterAll(async () => {
    if (nativePlayerId) {
      await db
        .delete(playerGradeStatsTable)
        .where(eq(playerGradeStatsTable.playerId, nativePlayerId));
      await db.delete(playersTable).where(eq(playersTable.id, nativePlayerId));
    }
    if (adminIds.length) await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
    for (const tenantId of [centralTenantId, emptyTenantId]) {
      if (!tenantId) continue;
      await db
        .delete(honourDisplaySettingsTable)
        .where(eq(honourDisplaySettingsTable.tenantId, tenantId));
      await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, tenantId));
      await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
    }
  });

  it("a central tenant's by-grade and most-games boards show no Halls Head players", async () => {
    const bundle = await bundleFor(centralTenantId);
    // Nowhere in the whole bundle, not just the two stats boards.
    expect(JSON.stringify(bundle)).not.toContain(NATIVE_SURNAME);
    expect(bundle.boards.find((b) => b.id === `records_grade:${NATIVE_GRADE}`)).toBeUndefined();
    for (const b of statsBoards(bundle)) {
      for (const e of b.entries) expect(e.playerId).not.toBe(nativePlayerId);
    }
  });

  it("a central tenant's boards come from its own central club, crosswalked, private excluded", async () => {
    const [casey] = await db
      .select({ playerId: playerIdMapTable.playerId })
      .from(playerIdMapTable)
      .where(
        and(
          eq(playerIdMapTable.tenantId, centralTenantId),
          eq(playerIdMapTable.participantId, CASEY),
        ),
      );
    expect(casey?.playerId).toBeGreaterThan(0);

    const bundle = await bundleFor(centralTenantId);
    expect(JSON.stringify(statsBoards(bundle))).not.toContain("Private");

    const mostGames = bundle.boards.find((b) => b.id === "most_games");
    expect(mostGames).toBeDefined();
    expect(mostGames!.entries).toEqual([
      expect.objectContaining({
        primaryText: "Casey Fixture",
        detail: "2 games",
        playerId: casey!.playerId,
      }),
    ]);

    const aGrade = bundle.boards.find((b) => b.id === "records_grade:A Grade");
    expect(aGrade).toBeDefined();
    expect(aGrade!.category).toBe("records_by_grade");
    const byLabel = new Map(aGrade!.entries.map((e) => [e.primaryText, e]));
    expect(byLabel.get("Most Games")?.detail).toBe("2 — Casey Fixture");
    expect(byLabel.get("Most Runs")?.detail).toBe("41 — Casey Fixture");
    expect(byLabel.get("Most Wickets")?.detail).toBe("2 — Casey Fixture");
    // Every holder is Casey (the only public Mandurah player), linked by the
    // tenant's crosswalk id.
    for (const e of aGrade!.entries) {
      expect(e.detail).toMatch(/ — Casey Fixture$/);
      expect(e.playerId).toBe(casey!.playerId);
    }
  });

  it("a central tenant with no matches gets empty stats boards, not an error", async () => {
    const bundle = await bundleFor(emptyTenantId);
    expect(statsBoards(bundle)).toEqual([]);
    expect(JSON.stringify(bundle)).not.toContain(NATIVE_SURNAME);
  });

  it("Halls Head (native) keeps its boards from the native tables", async () => {
    const bundle = await bundleFor(1);
    const mostGames = bundle.boards.find((b) => b.id === "most_games");
    expect(mostGames!.entries[0]).toMatchObject({
      primaryText: `Native ${NATIVE_SURNAME}`,
      detail: "987654 games",
      playerId: nativePlayerId,
    });

    const grade = bundle.boards.find((b) => b.id === `records_grade:${NATIVE_GRADE}`);
    expect(grade).toBeDefined();
    expect(grade!.entries.map((e) => [e.primaryText, e.detail])).toEqual([
      ["Most Games", `321 — Native ${NATIVE_SURNAME}`],
      ["Most Runs", `4321 — Native ${NATIVE_SURNAME}`],
      ["Highest Score", `150* — Native ${NATIVE_SURNAME}`],
      ["Most Wickets", `123 — Native ${NATIVE_SURNAME}`],
      ["Best Bowling", `7/20 — Native ${NATIVE_SURNAME}`],
      ["Most Catches", `45 — Native ${NATIVE_SURNAME}`],
    ]);
    for (const e of grade!.entries) expect(e.playerId).toBe(nativePlayerId);
  });
});
