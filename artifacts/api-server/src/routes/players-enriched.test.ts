import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  playerIdMapTable,
  playersTable,
  importsTable,
  matchesTable,
  matchPlayerLinesTable,
  playerGradeSeasonStatsTable,
  clubsTable,
} from "@workspace/db";
import { mintPlayerIdMap } from "@workspace/db/provision";

/**
 * Enriched per-match and per-season rows (stats analytics plan U3, KTD2) on
 * both read paths. Real-DB integration test (DATABASE_URL +
 * CENTRAL_DATABASE_URL, CI fixture from seed-ci-central-fixture.ts).
 *
 * Native: one line per match → at most one innings; isHome null; battedFirst
 * from hhcc_batted_first; opponentClubId is the app clubs register id; season
 * balls/maidens from the lines, null on the baseline row.
 *
 * Central fixture: club 2 (Mandurah) is AWAY in 1001 (batting innings 2, so it
 * batted second; opponent club 1) and HOME in 1002 (innings 1, batted first;
 * opponent club 3). Casey Fixture bats first for the side (20 runs in 1001,
 * 21 in 1002, balls = 2 x runs) and bowls 8 overs / 1 maiden in each.
 */

const STAMP = Date.now();
const MANDURAH = 2;
const CASEY = "33333333-3333-4333-8333-333333333333";
const GRADE = `U3 Test Grade ${STAMP}`;

type Innings = {
  runs: number | null;
  balls: number | null;
  notOut: boolean;
  dismissalType: string;
  dismissedBy: string | null;
  battingPos: number | null;
};
type MatchRow = {
  matchId: number;
  runs: number | null;
  isHome: boolean | null;
  battedFirst: boolean | null;
  opponentClubId: number | null;
  innings: Innings[];
};
type SeasonRow = {
  grade: string;
  season: number | null;
  ballsFaced: number | null;
  ballsBowled: number | null;
  maidens: number | null;
};

describe("native enriched player rows", () => {
  let playerId: number;
  let importId: number;
  let clubId: number;
  let firstMatchId: number;
  let secondMatchId: number;

  beforeAll(async () => {
    const [p] = await db
      .insert(playersTable)
      .values({ surname: `U3Native${STAMP}`, givenName: "Test" })
      .returning();
    playerId = p!.id;
    const [imp] = await db
      .insert(importsTable)
      .values({ filename: `u3-${STAMP}.xlsx`, kind: "match", grade: GRADE, season: 2023 })
      .returning();
    importId = imp!.id;
    const [club] = await db
      .insert(clubsTable)
      .values({ name: `U3 Opposition ${STAMP}` })
      .returning();
    clubId = club!.id;

    const [m1] = await db
      .insert(matchesTable)
      .values({
        importId,
        grade: GRADE,
        season: 2023,
        round: 1,
        opponent: "Opposition",
        opponentClubId: clubId,
        hhccBattedFirst: true,
      })
      .returning();
    const [m2] = await db
      .insert(matchesTable)
      .values({ importId, grade: GRADE, season: 2023, round: 2, opponent: "Opposition" })
      .returning();
    firstMatchId = m1!.id;
    secondMatchId = m2!.id;

    await db.insert(matchPlayerLinesTable).values([
      {
        matchId: firstMatchId,
        playerId,
        batted: true,
        battingPos: 3,
        runs: 42,
        balls: 60,
        notOut: false,
        dismissal: "c: A Smith b: J Nguyen",
        bowled: true,
        overs: "4.3",
        maidens: 1,
      },
      {
        matchId: secondMatchId,
        playerId,
        batted: false,
        bowled: true,
        overs: "6",
        maidens: 0,
      },
    ]);

    await db.insert(playerGradeSeasonStatsTable).values([
      { playerId, grade: GRADE, season: null, games: 50, runs: 900 },
      { importId, playerId, grade: GRADE, season: 2023, games: 2, innings: 1, runs: 42 },
    ]);
  });

  afterAll(async () => {
    if (importId) await db.delete(importsTable).where(eq(importsTable.id, importId));
    if (playerId) await db.delete(playersTable).where(eq(playersTable.id, playerId));
    if (clubId) await db.delete(clubsTable).where(eq(clubsTable.id, clubId));
  });

  it("adds innings[], isHome, battedFirst and opponentClubId to each match row", async () => {
    const res = await request(app).get(`/api/players/${playerId}/matches`).expect(200);
    const rows = res.body as MatchRow[];
    const m1 = rows.find((r) => r.matchId === firstMatchId)!;
    const m2 = rows.find((r) => r.matchId === secondMatchId)!;

    expect(m1).toMatchObject({
      isHome: null,
      battedFirst: true,
      opponentClubId: clubId,
      runs: 42, // existing collapsed fields unchanged
    });
    expect(m1.innings).toEqual([
      {
        runs: 42,
        balls: 60,
        notOut: false,
        dismissalType: "caught",
        dismissedBy: "nguyen",
        battingPos: 3,
      },
    ]);

    // Didn't bat → no innings; unknown batting order and opponent stay null.
    expect(m2).toMatchObject({ isHome: null, battedFirst: null, opponentClubId: null });
    expect(m2.innings).toEqual([]);
  });

  it("adds season balls faced / bowled and maidens, null on the baseline row", async () => {
    const res = await request(app).get(`/api/players/${playerId}/seasons`).expect(200);
    const rows = (res.body as SeasonRow[]).filter((r) => r.grade === GRADE);
    const baseline = rows.find((r) => r.season === null)!;
    const season = rows.find((r) => r.season === 2023)!;
    expect(baseline).toMatchObject({ ballsFaced: null, ballsBowled: null, maidens: null });
    // 4.3 overs = 27 balls, + 6 overs = 36 → 63.
    expect(season).toMatchObject({ ballsFaced: 60, ballsBowled: 63, maidens: 1 });
  });
});

describe("central enriched player rows", () => {
  let tenantId: number | undefined;
  let caseyId: number;

  beforeAll(async () => {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `u3-central-${STAMP}`,
        centralClubId: MANDURAH,
        name: "U3 Central",
        readsFromCentral: true,
        plan: "club",
      })
      .returning();
    tenantId = t!.id;
    await mintPlayerIdMap(tenantId, MANDURAH);
    const map = await db
      .select()
      .from(playerIdMapTable)
      .where(eq(playerIdMapTable.tenantId, tenantId));
    const casey = map.find((m) => m.participantId === CASEY);
    expect(casey, "fixture player should be in the crosswalk").toBeDefined();
    caseyId = casey!.playerId;
  });

  afterAll(async () => {
    if (!tenantId) return;
    await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, tenantId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  });

  it("derives isHome, battedFirst (innings order) and the central opponent id", async () => {
    const res = await request(app)
      .get(`/api/players/${caseyId}/matches`)
      .set("x-tenant-id", String(tenantId))
      .expect(200);
    const rows = res.body as MatchRow[];
    const away = rows.find((r) => r.matchId === 1001)!;
    const home = rows.find((r) => r.matchId === 1002)!;

    expect(away).toMatchObject({ isHome: false, battedFirst: false, opponentClubId: 1 });
    expect(home).toMatchObject({ isHome: true, battedFirst: true, opponentClubId: 3 });

    for (const [row, runs] of [
      [away, 20],
      [home, 21],
    ] as const) {
      expect(row.innings).toHaveLength(1);
      expect(row.innings[0]).toMatchObject({ runs, balls: runs * 2, battingPos: 1 });
      // Raw central fields never leak into the API shape.
      expect(row).not.toHaveProperty("inningsLines");
    }
  });

  it("returns season balls faced / bowled and maidens from the central lines", async () => {
    const res = await request(app)
      .get(`/api/players/${caseyId}/seasons`)
      .set("x-tenant-id", String(tenantId))
      .expect(200);
    const [row] = res.body as SeasonRow[];
    // 2 matches: balls faced 40 + 42; 8 overs (48 balls) and 1 maiden each.
    expect(row).toMatchObject({
      grade: "A Grade",
      season: 2024,
      ballsFaced: 82,
      ballsBowled: 96,
      maidens: 2,
    });
  });
});
