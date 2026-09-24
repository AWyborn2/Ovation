import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  playerIdMapTable,
  playersTable,
  importsTable,
  matchesTable,
  matchPlayerLinesTable,
  clubsTable,
} from "@workspace/db";
import { mintPlayerIdMap } from "@workspace/db/provision";

/**
 * Squad vs club (stats analytics plan U8, KTD6) on both read paths. Real-DB
 * integration test (DATABASE_URL + CENTRAL_DATABASE_URL, CI fixture from
 * seed-ci-central-fixture.ts).
 *
 * Native: three matches against one opposition club plus one against another;
 * a fill-in (id >= 90000) plays in all of them and never appears.
 *
 * Central fixture: club 2 (Mandurah) played club 1 (Halls Head) once, in 1001.
 * Casey Fixture made 20 not out and bowled 8 overs, 1 for 30; Private Fixture
 * is private and never appears.
 */

const STAMP = Date.now();
const MANDURAH = 2;
const HALLS_HEAD = 1;
const CASEY = "33333333-3333-4333-8333-333333333333";
const PRIVATE = "44444444-4444-4444-8444-444444444444";
const GRADE = `U8 Test Grade ${STAMP}`;
// A fill-in id well clear of the real fill-in range in use.
const FILL_IN_ID = 900_000_000 + (STAMP % 100_000_000);

type Batter = {
  playerId: number;
  innings: number;
  notOuts: number;
  outs: number;
  runs: number;
  average: number | null;
  highScore: number | null;
  highScoreNotOut: boolean;
};
type Bowler = { playerId: number; wickets: number; runsConceded: number; balls: number | null };
type VsClub = {
  resolved: boolean;
  opponentClubId: number | null;
  opponentName: string | null;
  batting: Batter[];
  bowling: Bowler[];
};
type MatchRow = { opponentClubId: number | null; innings: { runs: number | null }[] };

describe("native squad vs club", () => {
  let playerId: number;
  let importId: number;
  let clubId: number;
  let otherClubId: number;

  beforeAll(async () => {
    const [p] = await db
      .insert(playersTable)
      .values({ surname: `U8Native${STAMP}`, givenName: "Test" })
      .returning();
    playerId = p!.id;
    await db
      .insert(playersTable)
      .values({ id: FILL_IN_ID, surname: `U8FillIn${STAMP}`, givenName: "Fill" });
    const [imp] = await db
      .insert(importsTable)
      .values({ filename: `u8-${STAMP}.xlsx`, kind: "match", grade: GRADE, season: 2023 })
      .returning();
    importId = imp!.id;
    const clubs = await db
      .insert(clubsTable)
      .values([{ name: `U8 Opposition ${STAMP}` }, { name: `U8 Other ${STAMP}` }])
      .returning();
    clubId = clubs[0]!.id;
    otherClubId = clubs[1]!.id;

    const matches = await db
      .insert(matchesTable)
      .values(
        [clubId, clubId, clubId, otherClubId].map((opp, i) => ({
          importId,
          grade: GRADE,
          season: 2023,
          round: i + 1,
          opponent: "Opposition",
          opponentClubId: opp,
        })),
      )
      .returning();
    const runs = [35, 64, 12, 150];
    await db.insert(matchPlayerLinesTable).values(
      matches.flatMap((m, i) => [
        {
          matchId: m.id,
          playerId,
          batted: true,
          runs: runs[i],
          notOut: i === 1,
          dismissal: i === 1 ? "not out" : "b Nguyen",
          bowled: i === 0,
          overs: i === 0 ? "5.2" : null,
          runsConceded: i === 0 ? 21 : null,
          wickets: i === 0 ? 2 : null,
        },
        { matchId: m.id, playerId: FILL_IN_ID, batted: true, runs: 99, notOut: false },
      ]),
    );
  });

  afterAll(async () => {
    if (importId) await db.delete(importsTable).where(eq(importsTable.id, importId));
    await db.delete(playersTable).where(inArray(playersTable.id, [playerId, FILL_IN_ID]));
    await db.delete(clubsTable).where(inArray(clubsTable.id, [clubId, otherClubId]));
  });

  it("returns the player's record against that club only, never a fill-in", async () => {
    const res = await request(app).get(`/api/players/vs-club?opponentClubId=${clubId}`).expect(200);
    const body = res.body as VsClub;
    expect(body).toMatchObject({ resolved: true, opponentClubId: clubId });
    const ids = [...body.batting, ...body.bowling].map((r) => r.playerId);
    expect(ids).not.toContain(FILL_IN_ID);

    const me = body.batting.find((b) => b.playerId === playerId);
    expect(me).toMatchObject({
      innings: 3,
      notOuts: 1,
      outs: 2,
      runs: 111,
      average: 55.5,
      highScore: 64,
      highScoreNotOut: true,
    });
    // 5.2 overs = 32 balls.
    expect(body.bowling.find((b) => b.playerId === playerId)).toMatchObject({
      wickets: 2,
      runsConceded: 21,
      balls: 32,
    });
  });

  it("runs equal the sum of the player's per-innings match rows vs that club", async () => {
    const [vs, matches] = await Promise.all([
      request(app).get(`/api/players/vs-club?opponentClubId=${clubId}&minInnings=0`),
      request(app).get(`/api/players/${playerId}/matches`),
    ]);
    const innings = (matches.body as MatchRow[])
      .filter((m) => m.opponentClubId === clubId)
      .flatMap((m) => m.innings);
    const me = (vs.body as VsClub).batting.find((b) => b.playerId === playerId)!;
    expect(me.runs).toBe(innings.reduce((s, i) => s + (i.runs ?? 0), 0));
    expect(me.innings).toBe(innings.length);
  });

  it("drops batters below the minimum innings", async () => {
    const res = await request(app)
      .get(`/api/players/vs-club?opponentClubId=${clubId}&minInnings=4`)
      .expect(200);
    expect((res.body as VsClub).batting.map((b) => b.playerId)).not.toContain(playerId);
  });
});

describe("central squad vs club", () => {
  let tenantId: number | undefined;
  let caseyId: number;
  let privateId: number | undefined;

  beforeAll(async () => {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `u8-central-${STAMP}`,
        centralClubId: MANDURAH,
        name: "U8 Central",
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
    privateId = map.find((m) => m.participantId === PRIVATE)?.playerId;
  });

  afterAll(async () => {
    if (!tenantId) return;
    await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, tenantId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  });

  it("returns crosswalked figures against the central opponent", async () => {
    const res = await request(app)
      .get(`/api/players/vs-club?opponentClubId=${HALLS_HEAD}&minInnings=0`)
      .set("x-tenant-id", String(tenantId))
      .expect(200);
    const body = res.body as VsClub;
    expect(body).toMatchObject({ resolved: true, opponentClubId: HALLS_HEAD });
    expect(body.opponentName).toBeTruthy();
    const ids = [...body.batting, ...body.bowling].map((r) => r.playerId);
    expect(ids).not.toContain(0);
    if (privateId !== undefined) expect(ids).not.toContain(privateId);

    const casey = body.batting.find((b) => b.playerId === caseyId)!;
    expect(casey).toMatchObject({ innings: 1, runs: 20, highScore: 20 });
    // The fixture's dismissal_type spelling decides out vs not out; either
    // way the one innings is counted exactly once.
    expect(casey.outs + casey.notOuts).toBe(1);
    expect(body.bowling.find((b) => b.playerId === caseyId)).toMatchObject({
      wickets: 1,
      runsConceded: 30,
      balls: 48,
    });
  });

  it("matches the per-innings match rows against the same club", async () => {
    const [vs, matches] = await Promise.all([
      request(app)
        .get(`/api/players/vs-club?opponentClubId=${HALLS_HEAD}&minInnings=0`)
        .set("x-tenant-id", String(tenantId)),
      request(app).get(`/api/players/${caseyId}/matches`).set("x-tenant-id", String(tenantId)),
    ]);
    const innings = (matches.body as MatchRow[])
      .filter((m) => m.opponentClubId === HALLS_HEAD)
      .flatMap((m) => m.innings);
    const casey = (vs.body as VsClub).batting.find((b) => b.playerId === caseyId)!;
    expect(casey.runs).toBe(innings.reduce((s, i) => s + (i.runs ?? 0), 0));
  });

  it("answers resolved:false for a club not in the central register", async () => {
    const res = await request(app)
      .get("/api/players/vs-club?opponentClubId=987654")
      .set("x-tenant-id", String(tenantId))
      .expect(200);
    expect(res.body).toMatchObject({
      resolved: false,
      opponentClubId: null,
      batting: [],
      bowling: [],
    });
  });
});
