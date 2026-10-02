import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { inArray, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  playerIdMapTable,
  milestoneBoardSettingsTable,
  clubHistoryBatchesTable,
  clubHistoryBatchCoverageTable,
  clubHistoryRowsTable,
  clubHistoryBoundariesTable,
  CLUB_HISTORY_SUPPLEMENT_SOURCE,
} from "@workspace/db";
import { isSeniorAppGrade } from "@workspace/db/central-queries";
import { insertHistoryBatch, insertSupplementRows } from "../lib/history-import";
import { clearMilestonesCache } from "../lib/milestones-cache";

/**
 * SUPPLEMENT seasons on the real read path (Halls Head cut-over, 1 Oct 2026;
 * owner decision: keep hand-entered seasons as club history).
 *
 * One tiny central club. Player A (id 601) plays B Grade centrally in 2005/06
 * (30 runs) and A Grade in 2013/14 (60). The club's boundary is 2003/04 with a
 * B Grade override to 2004/05. Its club layer holds:
 *
 *   - a SUPPLEMENT batch (written through the explicit supplement path):
 *       B Grade 2013/14, 409 runs  -> central has no B Grade 2013/14 for A: COUNTS
 *       B Grade 2014/15, 182 runs  -> COUNTS
 *       B Grade 2005/06, 999 runs  -> central HAS that season: IGNORED
 *   - an ordinary batch with a row at B Grade 2015/16 (129 runs): at or after
 *     the boundary and NOT a supplement, so it never counts.
 *
 * Real-DB integration (CI's API job: DATABASE_URL and CENTRAL_DATABASE_URL are
 * the same throwaway Postgres). Central rows are written through the tenant
 * `db` with raw SQL, only when the database is local.
 */

const isLocalDb = (() => {
  try {
    const host = new URL(process.env.DATABASE_URL ?? "").hostname;
    const centralHost = new URL(process.env.CENTRAL_DATABASE_URL ?? "").hostname;
    const local = ["localhost", "127.0.0.1", "::1", "postgres"];
    return local.includes(host) && local.includes(centralHost);
  } catch {
    return false;
  }
})();

const STAMP = Date.now();
const CLUB = 9831;
const OPP = 9832;
const LINE_BASE = 9_830_000;
const A = "98300000-0000-4000-8000-00000000000a";
const O = "98300000-0000-4000-8000-0000000000ff";
const ID_A = 601;

/** (match n, season, grade, A's runs). */
const MATCHES: [number, string, string, number][] = [
  [1, "2005/06", "B Grade", 30],
  [2, "2013/14", "A Grade", 60],
];
const matchId = (n: number) => CLUB * 100 + n;

async function seedCentral(): Promise<void> {
  for (const [id, name] of [
    [CLUB, "Supplement Test CC"],
    [OPP, "Supplement Opp CC"],
  ] as const) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${id}, ${name}, ${`S${id}`}, '#123456', null, null, '2002/03', null)
    `);
  }
  for (const [id, name] of [
    [A, "Dan Supplement"],
    [O, "Olly Opp"],
  ] as const) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${id}, ${name}, 0, ${CLUB}, '2005/06', '2013/14', 2)
    `);
  }
  let id = LINE_BASE;
  for (const [n, season, grade, runs] of MATCHES) {
    const m = matchId(n);
    await db.execute(sql`
      insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
        status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
      values (${m}, ${`supplement-test-${m}`}, ${season}, ${grade}, 'g', 'One Day', ${String(n)},
        ${`${season.slice(0, 4)}-11-0${n}`}, 'Supplement Oval', 'Completed', ${CLUB}, ${OPP}, 'Home', 'Opp',
        '5/150', '10/120', ${CLUB}, ${CLUB}, 'won')
    `);
    await db.execute(sql`
      insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
        runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
      values (${id++}, ${m}, 1, ${CLUB}, 'x', 1, ${A}, 'x', ${runs}, ${runs}, 0, 0, 100, 'b Bowler', 'bowled', null)
    `);
    await db.execute(sql`
      insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
      values (${id++}, ${m}, ${CLUB}, 'x', ${A}, 'x')
    `);
    await db.execute(sql`
      insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
        runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
      values (${id++}, ${m}, 2, ${OPP}, 'x', 1, ${O}, 'x', 12, 12, 0, 0, 100, 'b Bowler', 'bowled', null)
    `);
  }
}

async function cleanCentral(): Promise<void> {
  const range = sql`id >= ${LINE_BASE} and id < ${LINE_BASE + 10_000}`;
  await db.execute(sql`delete from central.match_batting where ${range}`);
  await db.execute(sql`delete from central.match_rosters where ${range}`);
  await db.execute(
    sql`delete from central.matches where match_id in (${matchId(1)}, ${matchId(2)})`,
  );
  await db.execute(sql`delete from central.players where participant_id in (${A}, ${O})`);
  await db.execute(sql`delete from central.clubs where club_id in (${CLUB}, ${OPP})`);
}

describe.skipIf(!isLocalDb)("supplement seasons on the central read path", () => {
  let t = 0;
  let supplementBatchId = 0;
  let prevTtl: string | undefined;

  const get = (path: string) =>
    request(app)
      .get(`/api${path}`)
      .set({ "x-tenant-id": String(t) });

  const BOUNDARIES = [
    { grade: null, startSeason: 2003 },
    { grade: "B Grade", startSeason: 2004 },
  ];
  const figures = {
    notOuts: null,
    highScore: null,
    highScoreNotOut: null,
    ballsFaced: null,
    fours: null,
    sixes: null,
    fifties: null,
    hundreds: null,
    ballsBowled: null,
    maidens: null,
    runsConceded: null,
    wickets: null,
    bestBowlingWickets: null,
    bestBowlingRuns: null,
    fiveWickets: null,
    catches: null,
    stumpings: null,
    runOuts: null,
  };
  const season = (year: number, games: number, runs: number) => ({
    ...figures,
    playerId: ID_A,
    grade: "B Grade",
    season: year,
    grain: "season" as const,
    games,
    innings: games,
    runs,
  });

  beforeAll(async () => {
    prevTtl = process.env.CENTRAL_CACHE_TTL_MS;
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    await cleanCentral();
    await seedCentral();
    const [row] = await db
      .insert(tenantsTable)
      .values({
        slug: `overlay-supplement-${STAMP}`,
        centralClubId: CLUB,
        name: "Overlay Supplement",
        readsFromCentral: true,
      })
      .returning();
    t = row!.id;
    await db.insert(playerIdMapTable).values({ tenantId: t, participantId: A, playerId: ID_A });
    // 591 supplement runs + 30 + 60 central = 681 crosses 650 at the 2013/14
    // match; without the supplement the total (90) never gets there.
    await db.insert(milestoneBoardSettingsTable).values({
      tenantId: t,
      gamesTiers: [100000],
      runsTiers: [650],
      wicketsTiers: [100000],
    });
    await db
      .insert(clubHistoryBoundariesTable)
      .values(BOUNDARIES.map((b) => ({ ...b, tenantId: t })));

    // The supplement batch, through the explicit supplement path.
    supplementBatchId = await db.transaction(async (tx) => {
      const id = await insertHistoryBatch(tx, {
        tenantId: t,
        source: CLUB_HISTORY_SUPPLEMENT_SOURCE,
        label: `hand-entered seasons ${STAMP}`,
        createdBy: "test",
      });
      await insertSupplementRows(
        tx,
        t,
        id,
        [season(2013, 12, 409), season(2014, 9, 182), season(2005, 5, 999)],
        { boundaries: BOUNDARIES, isSeniorGrade: isSeniorAppGrade },
      );
      return id;
    });

    // An ordinary batch holding a row at or after the boundary: never counted.
    const [plain] = await db
      .insert(clubHistoryBatchesTable)
      .values({ tenantId: t, source: "test", label: `ordinary ${STAMP}` })
      .returning();
    await db.insert(clubHistoryRowsTable).values({
      tenantId: t,
      batchId: plain!.id,
      playerId: ID_A,
      grade: "B Grade",
      season: 2015,
      grain: "season",
      games: 8,
      innings: 7,
      runs: 129,
    });
  });

  afterAll(async () => {
    if (t) {
      const ids = [t];
      await db
        .delete(clubHistoryBatchesTable)
        .where(inArray(clubHistoryBatchesTable.tenantId, ids));
      await db
        .delete(clubHistoryBoundariesTable)
        .where(inArray(clubHistoryBoundariesTable.tenantId, ids));
      await db.delete(playerIdMapTable).where(inArray(playerIdMapTable.tenantId, ids));
      await db
        .delete(milestoneBoardSettingsTable)
        .where(inArray(milestoneBoardSettingsTable.tenantId, ids));
      await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
    }
    await cleanCentral();
    if (prevTtl === undefined) delete process.env.CENTRAL_CACHE_TTL_MS;
    else process.env.CENTRAL_CACHE_TTL_MS = prevTtl;
    clearMilestonesCache();
  });

  beforeEach(() => clearMilestonesCache());

  it("the supplement batch holds its rows and no coverage", async () => {
    const coverage = await db
      .select()
      .from(clubHistoryBatchCoverageTable)
      .where(inArray(clubHistoryBatchCoverageTable.batchId, [supplementBatchId]));
    expect(coverage).toEqual([]);
  });

  it("a supplement season counts only where central has no bucket for that grade and season", async () => {
    type Season = { grade: string; season: number; games: number | null; runs: number | null };
    const res = await get(`/players/${ID_A}/seasons`).expect(200);
    expect((res.body as Season[]).map((s) => [s.grade, s.season, s.games, s.runs])).toEqual([
      ["A Grade", 2013, 1, 60], // central
      ["B Grade", 2005, 1, 30], // central — the 999-run supplement is ignored
      ["B Grade", 2013, 12, 409], // supplement
      ["B Grade", 2014, 9, 182], // supplement
      // B Grade 2015/16 (129): an ordinary row past the boundary never counts.
    ]);
  });

  it("career, leaderboard and record leaders agree — nothing is counted twice", async () => {
    const player = await get(`/players/${ID_A}`).expect(200);
    expect(player.body).toMatchObject({
      id: ID_A,
      totalGames: 1 + 1 + 12 + 9,
      totalRuns: 60 + 30 + 409 + 182,
    });
    const board = await get(`/grades/${encodeURIComponent("B Grade")}/leaderboard`).expect(200);
    expect(board.body).toEqual([
      expect.objectContaining({ playerId: ID_A, games: 22, runs: 30 + 409 + 182 }),
    ]);
    const leaders = await get(`/records/leaders?metric=runs`).expect(200);
    expect(leaders.body.entries[0]).toMatchObject({ playerId: ID_A, value: 681 });
  });

  it("milestones carry the supplement seasons into the career total", async () => {
    const res = await get(`/milestones`).expect(200);
    const runs = (
      res.body.items as { kind: string; boardKey: string | null; matchId: number }[]
    ).filter((i) => i.kind === "career" && i.boardKey === "runs");
    expect(runs.map((i) => i.matchId)).toEqual([matchId(2)]);
  });

  it("undoing the supplement batch puts the numbers back to central alone", async () => {
    const saved = await db
      .select()
      .from(clubHistoryRowsTable)
      .where(inArray(clubHistoryRowsTable.batchId, [supplementBatchId]));
    await db
      .delete(clubHistoryRowsTable)
      .where(inArray(clubHistoryRowsTable.batchId, [supplementBatchId]));
    try {
      const player = await get(`/players/${ID_A}`).expect(200);
      expect(player.body).toMatchObject({ totalGames: 2, totalRuns: 90 });
    } finally {
      await db.insert(clubHistoryRowsTable).values(saved);
    }
  });
});
