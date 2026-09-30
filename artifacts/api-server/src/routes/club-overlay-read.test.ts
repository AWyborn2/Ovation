import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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
  clubCorrectionsTable,
  coverageOf,
} from "@workspace/db";
import { clearMilestonesCache } from "../lib/milestones-cache";

/**
 * The club overlay on the real read path (hybrid stats plan U10; AE1, AE4,
 * R7, R8, R12, R15).
 *
 * Two tiny central clubs with IDENTICAL lines, one per tenant:
 *
 *   T  (club 9811): boundary 2003/04 with a B Grade override to 2004/05, club
 *                   history (a 2003/04 B Grade season, an A Grade career row, a
 *                   fill-in row and a junior row) and two corrections — one
 *                   current (runs 40 -> 45), one stale (recorded 31, central 30).
 *   U  (club 9813): no club layer — must read exactly as before.
 *
 * Player A (id 501) plays B Grade in 2003/04 (70, before B's boundary),
 * 2004/05 (40) and 2005/06 (30), plus an Under 15 match (200 — juniors never
 * count). R (id 502) is only on the 2005/06 team sheet.
 *
 * Real-DB integration (CI's API job: DATABASE_URL and CENTRAL_DATABASE_URL are
 * the same throwaway Postgres, migrations applied). The central rows are
 * written through the TENANT `db` with raw SQL, only when the database is
 * local — the app itself never writes central.
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
const CLUB_T = 9811;
const OPP = 9812;
const CLUB_U = 9813;
const CLUBS = [CLUB_T, CLUB_U];
const LINE_BASE = 9_810_000;
const A = "98100000-0000-4000-8000-00000000000a";
const R = "98100000-0000-4000-8000-00000000000b";
const O = "98100000-0000-4000-8000-0000000000ff";
const ID_A = 501;
const ID_R = 502;

/** (match n, season, grade) per club; match id = club * 100 + n. */
const MATCHES: [number, string, string][] = [
  [1, "2003/04", "B Grade"],
  [2, "2004/05", "B Grade"],
  [3, "2005/06", "B Grade"],
  [4, "2004/05", "Under 15"],
];
const matchId = (club: number, n: number) => club * 100 + n;
const phq = (club: number, n: number) => `overlay-test-${matchId(club, n)}`;
/** A's batting per match n. */
const A_RUNS: Record<number, number> = { 1: 70, 2: 40, 3: 30, 4: 200 };

async function seedCentral(): Promise<void> {
  const clubRows: [number, string][] = [
    [CLUB_T, "Overlay Test CC"],
    [OPP, "Overlay Opp CC"],
    [CLUB_U, "Overlay Control CC"],
  ];
  for (const [id, name] of clubRows) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${id}, ${name}, ${`O${id}`}, '#123456', null, null, '2002/03', null)
    `);
  }
  for (const [id, name] of [
    [A, "Ann Overlay"],
    [R, "Rosa Roster"],
    [O, "Olly Opp"],
  ] as const) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${id}, ${name}, 0, ${CLUB_T}, '2003/04', '2005/06', 3)
    `);
  }
  let id = LINE_BASE;
  for (const club of CLUBS) {
    for (const [n, season, grade] of MATCHES) {
      const m = matchId(club, n);
      await db.execute(sql`
        insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
          status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
        values (${m}, ${phq(club, n)}, ${season}, ${grade}, 'g', 'One Day', ${String(n)},
          ${`${season.slice(0, 4)}-11-0${n}`}, 'Overlay Oval', 'Completed', ${club}, ${OPP}, 'Overlay', 'Opp',
          '5/150', '10/120', ${club}, ${club}, 'won')
      `);
      await db.execute(sql`
        insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
          runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
        values (${id++}, ${m}, 1, ${club}, 'x', 1, ${A}, 'x', ${A_RUNS[n]!}, ${A_RUNS[n]!}, 0, 0, 100, 'b Bowler', 'bowled', null)
      `);
      await db.execute(sql`
        insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
        values (${id++}, ${m}, ${club}, 'x', ${A}, 'x')
      `);
      await db.execute(sql`
        insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
          runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
        values (${id++}, ${m}, 2, ${OPP}, 'x', 1, ${O}, 'x', 12, 12, 0, 0, 100, 'b Bowler', 'bowled', null)
      `);
      if (n === 3) {
        // R is on the team sheet only: no batting, no bowling (R7).
        await db.execute(sql`
          insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
          values (${id++}, ${m}, ${club}, 'x', ${R}, 'x')
        `);
      }
    }
  }
}

async function cleanCentral(): Promise<void> {
  const list = (xs: (number | string)[]) =>
    sql.join(
      xs.map((x) => sql`${x}`),
      sql`, `,
    );
  const range = sql`id >= ${LINE_BASE} and id < ${LINE_BASE + 10_000}`;
  await db.execute(sql`delete from central.match_batting where ${range}`);
  await db.execute(sql`delete from central.match_rosters where ${range}`);
  const ids = CLUBS.flatMap((c) => MATCHES.map(([n]) => matchId(c, n)));
  await db.execute(sql`delete from central.matches where match_id in (${list(ids)})`);
  await db.execute(sql`delete from central.players where participant_id in (${list([A, R, O])})`);
  await db.execute(sql`delete from central.clubs where club_id in (${list([...CLUBS, OPP])})`);
}

describe.skipIf(!isLocalDb)("the club overlay on the central read path", () => {
  const tenantIds: number[] = [];
  let t: number;
  let u: number;
  let staleId: number;
  let liveId: number;
  let prevTtl: string | undefined;

  const get = (tenantId: number, path: string) =>
    request(app)
      .get(`/api${path}`)
      .set({ "x-tenant-id": String(tenantId) });

  async function makeTenant(label: string, club: number): Promise<number> {
    const [row] = await db
      .insert(tenantsTable)
      .values({
        slug: `overlay-read-${label}-${STAMP}`,
        centralClubId: club,
        name: `Overlay Read ${label}`,
        readsFromCentral: true,
      })
      .returning();
    tenantIds.push(row.id);
    await db.insert(playerIdMapTable).values([
      { tenantId: row.id, participantId: A, playerId: ID_A },
      { tenantId: row.id, participantId: R, playerId: ID_R },
    ]);
    // History 1,300 + corrected 45 = 1,345 crosses 1,342 at 2004/05; without
    // the correction (1,340) it waits for 2005/06.
    await db.insert(milestoneBoardSettingsTable).values({
      tenantId: row.id,
      gamesTiers: [100000],
      runsTiers: [1342],
      wicketsTiers: [100000],
    });
    return row.id;
  }

  beforeAll(async () => {
    prevTtl = process.env.CENTRAL_CACHE_TTL_MS;
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    await cleanCentral();
    await seedCentral();
    t = await makeTenant("t", CLUB_T);
    u = await makeTenant("u", CLUB_U);

    await db.insert(clubHistoryBoundariesTable).values([
      { tenantId: t, grade: null, startSeason: 2003 },
      { tenantId: t, grade: "B Grade", startSeason: 2004 },
    ]);
    const historyRows = [
      // AE1: 2003/04 B Grade from club history (central's 70 is dropped).
      { grade: "B Grade", season: 2003, grain: "season" as const, games: 8, innings: 8, runs: 300 },
      // Career grain: added once to the career, never to a season.
      {
        grade: "A Grade",
        season: null,
        grain: "career" as const,
        games: 20,
        innings: 20,
        runs: 1000,
      },
      // Overlaps central (B's boundary season): central wins, this is ignored.
      { grade: "B Grade", season: 2004, grain: "season" as const, games: 9, innings: 9, runs: 999 },
      // Juniors never count (R8).
      {
        grade: "Under 15",
        season: null,
        grain: "career" as const,
        games: 30,
        innings: 30,
        runs: 777,
      },
    ];
    const [batch] = await db
      .insert(clubHistoryBatchesTable)
      .values({ tenantId: t, source: "test", label: `overlay-read ${STAMP}` })
      .returning();
    await db.insert(clubHistoryRowsTable).values([
      ...historyRows.map((r) => ({ ...r, tenantId: t, batchId: batch.id, playerId: ID_A })),
      // A fill-in's history never counts (R8).
      {
        tenantId: t,
        batchId: batch.id,
        playerId: 90001,
        grade: "B Grade",
        season: 2002,
        grain: "season" as const,
        games: 5,
        runs: 5000,
      },
    ]);
    await db
      .insert(clubHistoryBatchCoverageTable)
      .values(coverageOf(historyRows).map((c) => ({ ...c, tenantId: t, batchId: batch.id })));

    const [live] = await db
      .insert(clubCorrectionsTable)
      .values({
        tenantId: t,
        playhqMatchId: phq(CLUB_T, 2),
        participantId: A,
        field: "runs",
        previousValue: 40,
        newValue: 45,
        createdBy: "test",
      })
      .returning();
    liveId = live.id;
    const [stale] = await db
      .insert(clubCorrectionsTable)
      .values({
        tenantId: t,
        playhqMatchId: phq(CLUB_T, 3),
        participantId: A,
        field: "runs",
        previousValue: 31, // central says 30
        newValue: 35,
        createdBy: "test",
      })
      .returning();
    staleId = stale.id;
  });

  afterAll(async () => {
    await db.delete(clubCorrectionsTable).where(inArray(clubCorrectionsTable.tenantId, tenantIds));
    await db
      .delete(clubHistoryBatchesTable)
      .where(inArray(clubHistoryBatchesTable.tenantId, tenantIds));
    await db
      .delete(clubHistoryBoundariesTable)
      .where(inArray(clubHistoryBoundariesTable.tenantId, tenantIds));
    await db.delete(playerIdMapTable).where(inArray(playerIdMapTable.tenantId, tenantIds));
    await db
      .delete(milestoneBoardSettingsTable)
      .where(inArray(milestoneBoardSettingsTable.tenantId, tenantIds));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
    await cleanCentral();
    if (prevTtl === undefined) delete process.env.CENTRAL_CACHE_TTL_MS;
    else process.env.CENTRAL_CACHE_TTL_MS = prevTtl;
    clearMilestonesCache();
  });

  beforeEach(() => clearMilestonesCache());

  type Season = { grade: string; season: number; games: number | null; runs: number | null };
  const seasons = async (
    tenantId: number,
  ): Promise<[string, number, number | null, number | null][]> =>
    ((await get(tenantId, `/players/${ID_A}/seasons`).expect(200)).body as Season[]).map((s) => [
      s.grade,
      s.season,
      s.games,
      s.runs,
    ]);

  it("AE1 + AE4: B Grade 2003/04 from history, 2004/05 (corrected) and 2005/06 from central", async () => {
    expect(await seasons(t)).toEqual([
      ["B Grade", 2003, 8, 300],
      ["B Grade", 2004, 1, 45],
      ["B Grade", 2005, 1, 30], // the stale correction (31 -> 35) is skipped
    ]);
  });

  it("career totals add the career-grain row once; juniors and fill-ins never count", async () => {
    const res = await get(t, `/players/${ID_A}`).expect(200);
    expect(res.body).toMatchObject({
      id: ID_A,
      totalGames: 8 + 1 + 1 + 20,
      totalRuns: 300 + 45 + 30 + 1000,
    });
    expect((res.body.gradesPlayed as string).split(",").sort()).toEqual(["A Grade", "B Grade"]);
    const dir = await get(t, `/players?limit=100`).expect(200);
    const ids = (dir.body.players as { id: number }[]).map((p) => p.id);
    expect(ids).not.toContain(90001);
  });

  it("R7: a rostered appearance with no batting or bowling counts as a game", async () => {
    const dir = await get(t, `/players?limit=100`).expect(200);
    const r = (dir.body.players as { id: number; totalGames: number }[]).find((p) => p.id === ID_R);
    expect(r?.totalGames).toBe(1);
  });

  it("leaderboards and records read the overlay", async () => {
    const b = await get(t, `/grades/${encodeURIComponent("B Grade")}/leaderboard`).expect(200);
    expect(b.body).toEqual([expect.objectContaining({ playerId: ID_A, runs: 375, games: 10 })]);
    const a = await get(t, `/grades/${encodeURIComponent("A Grade")}/leaderboard`).expect(200);
    expect(a.body).toEqual([expect.objectContaining({ playerId: ID_A, runs: 1000 })]);
    const leaders = await get(t, `/records/leaders?metric=runs`).expect(200);
    expect(leaders.body.entries[0]).toMatchObject({ playerId: ID_A, value: 1375 });
  });

  it("milestones start from the history totals and use the corrected figure", async () => {
    const res = await get(t, `/milestones`).expect(200);
    const runs = (
      res.body.items as {
        kind: string;
        boardKey: string | null;
        matchId: number;
        playerId: number;
      }[]
    ).filter((i) => i.kind === "career" && i.boardKey === "runs");
    expect(runs).toEqual([
      expect.objectContaining({ playerId: ID_A, matchId: matchId(CLUB_T, 2) }),
    ]);
  });

  it("the control tenant (no club layer) reads exactly today's central numbers", async () => {
    expect(await seasons(u)).toEqual([
      ["B Grade", 2003, 1, 70],
      ["B Grade", 2004, 1, 40],
      ["B Grade", 2005, 1, 30],
    ]);
    const res = await get(u, `/players/${ID_A}`).expect(200);
    expect(res.body).toMatchObject({ totalGames: 3, totalRuns: 140 });
    const ms = await get(u, `/milestones`).expect(200);
    expect((ms.body.items as { kind: string }[]).filter((i) => i.kind === "career")).toEqual([]);
  });

  it("AE4: removing the correction reverts to the central 40", async () => {
    await db
      .update(clubCorrectionsTable)
      .set({ removedAt: new Date(), removedBy: "test" })
      .where(and(eq(clubCorrectionsTable.id, liveId), isNull(clubCorrectionsTable.removedAt)));
    try {
      expect((await seasons(t))[1]).toEqual(["B Grade", 2004, 1, 40]);
      const res = await get(t, `/milestones`).expect(200);
      const runs = (
        res.body.items as { kind: string; boardKey: string | null; matchId: number }[]
      ).filter((i) => i.kind === "career" && i.boardKey === "runs");
      expect(runs.map((i) => i.matchId)).toEqual([matchId(CLUB_T, 3)]);
    } finally {
      await db
        .update(clubCorrectionsTable)
        .set({ removedAt: null, removedBy: null })
        .where(eq(clubCorrectionsTable.id, liveId));
    }
    expect(staleId).toBeGreaterThan(0);
  });
});
