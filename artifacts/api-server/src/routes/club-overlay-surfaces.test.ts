import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  playerIdMapTable,
  centuriesTable,
  socialDraftsTable,
  clubHistoryBatchesTable,
  clubHistoryBatchCoverageTable,
  clubHistoryRowsTable,
  clubHistoryBoundariesTable,
  clubCorrectionsTable,
  coverageOf,
} from "@workspace/db";
import { loadCentralMatchDetail } from "../lib/match-detail";

/**
 * The club overlay on the surfaces U10 left out (hybrid stats plan U10
 * follow-up; KTD1, KTD5, KTD7, KTD8): player match log, match scorecard and
 * list, dashboard / club totals, grade summaries, grade distribution,
 * head-to-head, centuries and five-wicket hauls, record progression and the
 * player-detail fielding — on the real read path.
 *
 * Two tiny central clubs with IDENTICAL lines, one per tenant:
 *
 *   T  (club 9821): boundary 2003/04 with a B Grade override to 2004/05, club
 *                   history (a 2003/04 B Grade season, a 2002/03 B Grade MATCH
 *                   from the scorebook, an A Grade career row, plus fill-in
 *                   and junior rows), a curated pre-digital century, and four
 *                   corrections — runs 95 -> 105 (adds a century), runs
 *                   104 -> 94 (removes one), wickets 4 -> 5 (adds a five-for)
 *                   and a stale one (recorded 31, central 30).
 *   U  (club 9823): no club layer — every surface must read exactly as it
 *                   does without the overlay.
 *
 * Central matches (each club, vs 9822 unless noted), player A = id 501:
 *   1  2003/04 B Grade   A 70            (before T's B Grade boundary)
 *   2  2004/05 B Grade   A 95, 4/20      B (id 502) 60
 *   3  2005/06 B Grade   A 104, 2 catches (one written "ct")   R (503) team sheet only
 *   4  2004/05 Under 15  A 200           (juniors never count)
 *   5  2005/06 B Grade   A 30  vs 9824   B bowls 2/15 — no batting line, no team sheet
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
const CLUB_T = 9821;
const OPP = 9822;
const CLUB_U = 9823;
const OPP2 = 9824;
const CLUBS = [CLUB_T, CLUB_U];
const LINE_BASE = 9_820_000;
const A = "98200000-0000-4000-8000-00000000000a";
const B = "98200000-0000-4000-8000-00000000000b";
const R = "98200000-0000-4000-8000-00000000000c";
const O = "98200000-0000-4000-8000-0000000000ff";
const ID_A = 501;
const ID_B = 502;
const ID_R = 503;

/** (match n, season, grade, opponent) per club; match id = club * 100 + n. */
const MATCHES: [number, string, string, number][] = [
  [1, "2003/04", "B Grade", OPP],
  [2, "2004/05", "B Grade", OPP],
  [3, "2005/06", "B Grade", OPP],
  [4, "2004/05", "Under 15", OPP],
  [5, "2005/06", "B Grade", OPP2],
];
const matchId = (club: number, n: number) => club * 100 + n;
const phq = (club: number, n: number) => `overlay-surfaces-${matchId(club, n)}`;
/** A's batting per match n. */
const A_RUNS: Record<number, number> = { 1: 70, 2: 95, 3: 104, 4: 200, 5: 30 };

async function seedCentral(): Promise<void> {
  const clubRows: [number, string][] = [
    [CLUB_T, "Surfaces Test CC"],
    [OPP, "Surfaces Opp CC"],
    [CLUB_U, "Surfaces Control CC"],
    [OPP2, "Surfaces Other CC"],
  ];
  for (const [id, name] of clubRows) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${id}, ${name}, ${`S${id}`}, '#123456', null, null, '2002/03', null)
    `);
  }
  for (const [id, name] of [
    [A, "Ann Overlay"],
    [B, "Bea Bat"],
    [R, "Rosa Roster"],
    [O, "Olly Opp"],
  ] as const) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${id}, ${name}, 0, ${CLUB_T}, '2003/04', '2005/06', 3)
    `);
  }
  let id = LINE_BASE;
  const bat = (m: number, club: number, innings: number, guid: string, runs: number) =>
    db.execute(sql`
      insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
        runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
      values (${id++}, ${m}, ${innings}, ${club}, 'x', 1, ${guid}, 'x', ${runs}, ${runs}, 0, 0, 100, 'b Bowler', 'bowled', null)
    `);
  const bowl = (m: number, club: number, guid: string, overs: number, runs: number, wkts: number) =>
    db.execute(sql`
      insert into central.match_bowling (id, match_id, innings, club_id, team_name, participant_id, player_name,
        overs, maidens, runs, wickets, economy, wides, no_balls)
      values (${id++}, ${m}, 2, ${club}, 'x', ${guid}, 'x', ${overs}, 0, ${runs}, ${wkts}, 5, 0, 0)
    `);
  const roster = (m: number, club: number, guid: string) =>
    db.execute(sql`
      insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
      values (${id++}, ${m}, ${club}, 'x', ${guid}, 'x')
    `);
  const field = (m: number, club: number, guid: string, kind: string) =>
    db.execute(sql`
      insert into central.fielding (id, match_id, club_id, participant_id, player_name, kind)
      values (${id++}, ${m}, ${club}, ${guid}, 'x', ${kind})
    `);
  for (const club of CLUBS) {
    for (const [n, season, grade, opp] of MATCHES) {
      const m = matchId(club, n);
      await db.execute(sql`
        insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
          status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
        values (${m}, ${phq(club, n)}, ${season}, ${grade}, 'g', 'One Day', ${String(n)},
          ${`${season.slice(0, 4)}-11-0${n}`}, 'Surfaces Oval', 'Completed', ${club}, ${opp}, 'Surfaces', 'Opp',
          '5/150', '10/120', ${club}, ${club}, 'won')
      `);
      await bat(m, club, 1, A, A_RUNS[n]!);
      await roster(m, club, A);
      await bat(m, opp, 2, O, 12);
      if (n === 2) {
        await bat(m, club, 1, B, 60);
        await roster(m, club, B);
        await bowl(m, club, A, 4, 20, 4);
      }
      if (n === 3) {
        // R is on the team sheet only; A takes two catches, one written "ct".
        await roster(m, club, R);
        await field(m, club, A, "caught");
        await field(m, club, A, "ct");
      }
      // R7: B bowled in match 5 but has no batting line and no team-sheet row.
      if (n === 5) await bowl(m, club, B, 3, 15, 2);
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
  await db.execute(sql`delete from central.match_bowling where ${range}`);
  await db.execute(sql`delete from central.match_rosters where ${range}`);
  await db.execute(sql`delete from central.fielding where ${range}`);
  const ids = CLUBS.flatMap((c) => MATCHES.map(([n]) => matchId(c, n)));
  await db.execute(sql`delete from central.matches where match_id in (${list(ids)})`);
  await db.execute(
    sql`delete from central.players where participant_id in (${list([A, B, R, O])})`,
  );
  await db.execute(
    sql`delete from central.clubs where club_id in (${list([...CLUBS, OPP, OPP2])})`,
  );
}

describe.skipIf(!isLocalDb)("the club overlay on the remaining central read surfaces", () => {
  const tenantIds: number[] = [];
  let t: number;
  let u: number;
  /** runs 95 -> 105 on match 2 (adds a century). */
  let addCenturyId: number;
  let historyMatchRowId: number;
  let prevTtl: string | undefined;

  const get = (tenantId: number, path: string) =>
    request(app)
      .get(`/api${path}`)
      .set({ "x-tenant-id": String(tenantId) });

  async function makeTenant(label: string, club: number): Promise<number> {
    const [row] = await db
      .insert(tenantsTable)
      .values({
        slug: `overlay-surfaces-${label}-${STAMP}`,
        centralClubId: club,
        name: `Overlay Surfaces ${label}`,
        readsFromCentral: true,
      })
      .returning();
    tenantIds.push(row.id);
    await db.insert(playerIdMapTable).values([
      { tenantId: row.id, participantId: A, playerId: ID_A },
      { tenantId: row.id, participantId: B, playerId: ID_B },
      { tenantId: row.id, participantId: R, playerId: ID_R },
    ]);
    // Both tenants hold the same curated centuries: a pre-digital one and one
    // central already supplies. Only an ACTIVE overlay reads them.
    await db.insert(centuriesTable).values([
      {
        tenantId: row.id,
        playerId: ID_A,
        grade: "A Grade",
        batsman: "Ann Overlay",
        score: "134*",
        season: "1998/99",
      },
      {
        tenantId: row.id,
        playerId: ID_A,
        grade: "A Grade",
        batsman: "Ann Overlay",
        score: "111",
        season: "2010/11",
      },
    ]);
    return row.id;
  }

  /** Retire a correction for the duration of `fn` (AE4: removal reverts). */
  async function withoutCorrection(id: number, fn: () => Promise<void>): Promise<void> {
    await db
      .update(clubCorrectionsTable)
      .set({ removedAt: new Date(), removedBy: "test" })
      .where(and(eq(clubCorrectionsTable.id, id), isNull(clubCorrectionsTable.removedAt)));
    try {
      await fn();
    } finally {
      await db
        .update(clubCorrectionsTable)
        .set({ removedAt: null, removedBy: null })
        .where(eq(clubCorrectionsTable.id, id));
    }
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
    const [batch] = await db
      .insert(clubHistoryBatchesTable)
      .values({ tenantId: t, source: "test", label: `overlay-surfaces ${STAMP}` })
      .returning();
    const own = { tenantId: t, batchId: batch.id, playerId: ID_A };
    const historyRows = [
      // 2003/04 B Grade from the club's season book (central's 70 is dropped).
      {
        ...own,
        grade: "B Grade",
        season: 2003,
        grain: "season" as const,
        games: 8,
        innings: 8,
        runs: 300,
        highScore: 88,
        catches: 4,
      },
      // Career grain: counted once in career totals, never a season or a match.
      {
        ...own,
        grade: "A Grade",
        season: null,
        grain: "career" as const,
        games: 20,
        innings: 20,
        runs: 1000,
        highScore: 150,
        catches: 6,
      },
      // Juniors never count (R8).
      {
        ...own,
        grade: "Under 15",
        season: null,
        grain: "career" as const,
        games: 30,
        innings: 30,
        runs: 777,
      },
      // A fill-in's history never counts (R8).
      {
        ...own,
        playerId: 90001,
        grade: "B Grade",
        season: 2002,
        grain: "season" as const,
        games: 5,
        runs: 5000,
      },
    ];
    await db.insert(clubHistoryRowsTable).values(historyRows);
    // One MATCH from the 2002/03 scorebook: 100 not out and 6/25.
    const [matchRow] = await db
      .insert(clubHistoryRowsTable)
      .values({
        ...own,
        grade: "B Grade",
        season: 2002,
        grain: "match" as const,
        matchDate: "2002-12-07",
        opponent: "Old Rivals",
        round: "7",
        runs: 100,
        notOuts: 1,
        ballsBowled: 60,
        runsConceded: 25,
        wickets: 6,
        catches: 1,
      })
      .returning();
    historyMatchRowId = matchRow.id;
    await db.insert(clubHistoryBatchCoverageTable).values(
      coverageOf([...historyRows, { grade: "B Grade", season: 2002 }]).map((c) => ({
        ...c,
        tenantId: t,
        batchId: batch.id,
      })),
    );

    const fix = (n: number, field: "runs" | "wickets", previousValue: number, newValue: number) =>
      db
        .insert(clubCorrectionsTable)
        .values({
          tenantId: t,
          playhqMatchId: phq(CLUB_T, n),
          participantId: A,
          field,
          previousValue,
          newValue,
          createdBy: "test",
        })
        .returning();
    addCenturyId = (await fix(2, "runs", 95, 105))[0]!.id;
    await fix(3, "runs", 104, 94);
    await fix(2, "wickets", 4, 5);
    await fix(5, "runs", 31, 35); // stale: central says 30
  });

  afterAll(async () => {
    await db.delete(clubCorrectionsTable).where(inArray(clubCorrectionsTable.tenantId, tenantIds));
    await db
      .delete(clubHistoryBatchesTable)
      .where(inArray(clubHistoryBatchesTable.tenantId, tenantIds));
    await db
      .delete(clubHistoryBoundariesTable)
      .where(inArray(clubHistoryBoundariesTable.tenantId, tenantIds));
    await db.delete(centuriesTable).where(inArray(centuriesTable.tenantId, tenantIds));
    await db.delete(playerIdMapTable).where(inArray(playerIdMapTable.tenantId, tenantIds));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
    await cleanCentral();
    if (prevTtl === undefined) delete process.env.CENTRAL_CACHE_TTL_MS;
    else process.env.CENTRAL_CACHE_TTL_MS = prevTtl;
  });

  // ── Player match log ──────────────────────────────────────────────────────

  type LogRow = {
    matchId: number;
    season: number;
    runs: number | null;
    wickets: number | null;
    opponent: string | null;
    isHome: boolean | null;
    innings: { runs: number | null; notOut: boolean }[];
  };
  const matchLog = async (tenantId: number) =>
    (await get(tenantId, `/players/${ID_A}/matches`).expect(200)).body as LogRow[];
  const logSummary = (rows: LogRow[]) => rows.map((r) => [r.season, r.matchId, r.runs]);

  describe("player match log", () => {
    it("boundary split, corrections applied, and the scorebook match for a pre-boundary season", async () => {
      const rows = await matchLog(t);
      expect(logSummary(rows)).toEqual([
        [2005, matchId(CLUB_T, 5), 30], // the stale correction (31 -> 35) is skipped
        [2005, matchId(CLUB_T, 3), 94], // corrected from 104
        [2004, matchId(CLUB_T, 2), 105], // corrected from 95
        [2002, -historyMatchRowId, 100], // club history: a match, so it is listed
      ]);
      // Match 1 (2003/04, before B Grade's boundary) and the junior match are gone.
      const corrected = rows.find((r) => r.matchId === matchId(CLUB_T, 2))!;
      expect(corrected.innings).toEqual([expect.objectContaining({ runs: 105 })]);
      expect(corrected.wickets).toBe(5);
      expect(rows[3]).toMatchObject({ opponent: "Old Rivals", isHome: null, wickets: 6 });
      expect(rows[3]!.innings).toEqual([expect.objectContaining({ runs: 100, notOut: true })]);
    });

    it("career- and season-grain history is never shown as a match", async () => {
      const rows = await matchLog(t);
      // 8-game 2003/04 season and the 20-game A Grade career add no rows.
      expect(rows).toHaveLength(4);
      expect(rows.filter((r) => r.matchId < 0)).toHaveLength(1);
    });

    it("AE4: removing the correction reverts the match to central's 95", async () => {
      await withoutCorrection(addCenturyId, async () => {
        const rows = await matchLog(t);
        expect(rows.find((r) => r.matchId === matchId(CLUB_T, 2))!.runs).toBe(95);
      });
    });

    it("the control tenant reads the plain central log", async () => {
      expect(logSummary(await matchLog(u))).toEqual([
        [2005, matchId(CLUB_U, 5), 30],
        [2005, matchId(CLUB_U, 3), 104],
        [2004, matchId(CLUB_U, 2), 95],
        [2003, matchId(CLUB_U, 1), 70],
      ]);
    });
  });

  // ── Match scorecard and list ──────────────────────────────────────────────

  type CardLine = { playerId: number; runs: number | null; wickets: number | null };
  const cardLine = async (tenantId: number, club: number, n: number) => {
    const res = await get(tenantId, `/matches/${matchId(club, n)}`).expect(200);
    return (res.body.lines as CardLine[]).find((l) => l.playerId === ID_A)!;
  };

  describe("match scorecard and match list", () => {
    it("the scorecard shows the corrected line; another player's line is untouched", async () => {
      expect(await cardLine(t, CLUB_T, 2)).toMatchObject({ runs: 105, wickets: 5 });
      const res = await get(t, `/matches/${matchId(CLUB_T, 2)}`).expect(200);
      const bea = (res.body.lines as CardLine[]).find((l) => l.playerId === ID_B)!;
      expect(bea.runs).toBe(60);
      expect(await cardLine(t, CLUB_T, 3)).toMatchObject({ runs: 94 });
    });

    it("a match before the boundary is not served from central", async () => {
      await get(t, `/matches/${matchId(CLUB_T, 1)}`).expect(404);
      const list = (await get(t, `/matches`).expect(200)).body as { id: number }[];
      expect(list.map((m) => m.id)).toEqual([
        matchId(CLUB_T, 5),
        matchId(CLUB_T, 3),
        matchId(CLUB_T, 2),
      ]);
      // Paging happens after the boundary filter.
      const page = (await get(t, `/matches?limit=1&offset=1`).expect(200)).body as { id: number }[];
      expect(page.map((m) => m.id)).toEqual([matchId(CLUB_T, 3)]);
    });

    it("AE4: removing the correction reverts the scorecard", async () => {
      await withoutCorrection(addCenturyId, async () => {
        expect((await cardLine(t, CLUB_T, 2)).runs).toBe(95);
      });
    });

    it("the control tenant serves every match with central's figures", async () => {
      expect(await cardLine(u, CLUB_U, 2)).toMatchObject({ runs: 95, wickets: 4 });
      expect(await cardLine(u, CLUB_U, 1)).toMatchObject({ runs: 70 });
      const list = (await get(u, `/matches`).expect(200)).body as { id: number }[];
      expect(list.map((m) => m.id)).toEqual([5, 3, 2, 1].map((n) => matchId(CLUB_U, n)));
    });
  });

  // ── Dashboard, club totals and grade summaries ────────────────────────────

  describe("dashboard, club totals and grade summaries", () => {
    // A: central 105 + 94 + 30, history 300 + 100 + 1000. B: 60.
    const RUNS = 105 + 94 + 30 + 300 + 100 + 1000 + 60;
    // A: 3 central + 8 + 1 + 20. B: 2 (one bowling only). R: 1 (team sheet only).
    const GAMES = 3 + 8 + 1 + 20 + 2 + 1;
    const B_GRADE = {
      grade: "B Grade",
      players: 3,
      games: 15,
      innings: 13,
      runs: 689,
      wickets: 13,
      catches: 7,
      stumpings: 0,
      runOuts: 0,
    };

    it("the dashboard adds history to corrected central and names the right leaders", async () => {
      const res = await get(t, `/dashboard`).expect(200);
      expect(res.body).toMatchObject({
        totalPlayers: 3,
        totalGames: GAMES,
        totalRuns: RUNS,
        totalWickets: 5 + 6 + 2,
        gradesCount: 2,
        topRunScorer: { id: ID_A, value: RUNS - 60 },
        topWicketTaker: { id: ID_A, value: 11 },
        topFielder: { id: ID_A, value: 2 + 4 + 1 + 6 },
      });
      expect(res.body.gradeSummaries).toEqual([
        expect.objectContaining({
          grade: "A Grade",
          players: 1,
          games: 20,
          runs: 1000,
          catches: 6,
        }),
        expect.objectContaining(B_GRADE),
      ]);
    });

    it("the home overview totals and the grade cards agree with the dashboard", async () => {
      const overview = await get(t, `/overview`).expect(200);
      expect(overview.body.totals).toEqual({
        players: 3,
        games: GAMES,
        runs: RUNS,
        wickets: 13,
        grades: 2,
      });
      const grades = await get(t, `/grades`).expect(200);
      expect(grades.body).toEqual([
        expect.objectContaining({ grade: "A Grade", games: 20 }),
        expect.objectContaining(B_GRADE),
      ]);
    });

    it("AE4: removing the correction takes its 10 runs back off the club total", async () => {
      await withoutCorrection(addCenturyId, async () => {
        expect((await get(t, `/dashboard`).expect(200)).body.totalRuns).toBe(RUNS - 10);
      });
    });

    it("the control tenant's dashboard, overview and grade cards are the plain central ones", async () => {
      const res = await get(u, `/dashboard`).expect(200);
      expect(res.body).toMatchObject({
        totalPlayers: 3,
        totalGames: 6, // team-sheet lines: A 4, B 1, R 1
        totalRuns: 70 + 95 + 104 + 30 + 60,
        totalWickets: 6,
        gradesCount: 1,
        topRunScorer: { id: ID_A, value: 299 },
        topWicketTaker: { id: ID_A, value: 4 },
      });
      const overview = await get(u, `/overview`).expect(200);
      expect(overview.body.totals).toEqual({
        players: 3,
        games: 6,
        runs: 359,
        wickets: 6,
        grades: 1,
      });
      const grades = await get(u, `/grades`).expect(200);
      expect(grades.body).toEqual([
        expect.objectContaining({ grade: "B Grade", players: 3, games: 4, innings: 5, runs: 359 }),
      ]);
    });
  });

  // ── Player detail fielding ────────────────────────────────────────────────

  it("player detail shows fielding per grade, club history included", async () => {
    const res = await get(t, `/players/${ID_A}`).expect(200);
    const catches = (res.body.stats as { grade: string; catches: number | null }[]).map((s) => [
      s.grade,
      s.catches,
    ]);
    expect(catches).toEqual([
      ["A Grade", 6], // career-grain history: was blank
      ["B Grade", 2 + 4 + 1],
    ]);
  });

  // ── Grade distribution ────────────────────────────────────────────────────

  type DistPlayer = {
    playerId: number;
    games: number;
    catches: number;
    batting: { innings: number; runs: number; highScore: number | null } | null;
  };
  const distribution = async (tenantId: number, query = "") =>
    (
      (
        await get(
          tenantId,
          `/grades/${encodeURIComponent("B Grade")}/distribution?minInnings=1&minOvers=1${query}`,
        ).expect(200)
      ).body.players as DistPlayer[]
    ).find((p) => p.playerId === ID_A)!;

  describe("grade distribution", () => {
    it("a career span is history before the boundary plus corrected central from it", async () => {
      expect(await distribution(t)).toMatchObject({
        games: 3 + 8 + 1,
        catches: 7,
        batting: { innings: 12, runs: 105 + 94 + 30 + 300 + 100, highScore: 105 },
      });
    });

    it("a season span takes each season from its one source", async () => {
      // 2003/04 is the club's season book (8 games), never central's single match.
      expect(await distribution(t, "&fromSeason=2003&toSeason=2003")).toMatchObject({
        games: 8,
        batting: { runs: 300, highScore: 88 },
      });
      expect(await distribution(t, "&fromSeason=2004")).toMatchObject({
        games: 3,
        batting: { runs: 229, highScore: 105 },
      });
    });

    it("the control tenant reads plain central", async () => {
      expect(await distribution(u)).toMatchObject({
        games: 4,
        batting: { innings: 4, runs: 299, highScore: 104 },
      });
    });
  });

  // ── Head-to-head ──────────────────────────────────────────────────────────

  type VsRow = { playerId: number; matches: number; innings?: number; runs?: number };
  const vsClub = async (tenantId: number) =>
    (await get(tenantId, `/players/vs-club?opponentClubId=${OPP}&minInnings=1`).expect(200))
      .body as {
      resolved: boolean;
      batting: (VsRow & { highScore: number | null })[];
      bowling: (VsRow & { wickets: number })[];
    };

  describe("head-to-head", () => {
    it("drops the pre-boundary meeting and uses the corrected figures", async () => {
      const res = await vsClub(t);
      expect(res.resolved).toBe(true);
      expect(res.batting.find((r) => r.playerId === ID_A)).toMatchObject({
        matches: 2,
        innings: 2,
        runs: 105 + 94,
        highScore: 105,
      });
      expect(res.bowling.find((r) => r.playerId === ID_A)).toMatchObject({ wickets: 5 });
    });

    it("AE4: removing the correction reverts the head-to-head", async () => {
      await withoutCorrection(addCenturyId, async () => {
        const res = await vsClub(t);
        expect(res.batting.find((r) => r.playerId === ID_A)).toMatchObject({
          runs: 95 + 94,
          highScore: 95,
        });
      });
    });

    it("the control tenant counts every meeting", async () => {
      const res = await vsClub(u);
      expect(res.batting.find((r) => r.playerId === ID_A)).toMatchObject({
        matches: 3,
        innings: 3,
        runs: 70 + 95 + 104,
        highScore: 104,
      });
      expect(res.bowling.find((r) => r.playerId === ID_A)).toMatchObject({ wickets: 4 });
    });
  });

  // ── Centuries and five-wicket hauls ───────────────────────────────────────

  type Honour = { playerId: number | null; grade: string; season: string };
  const centuries = async (tenantId: number) =>
    ((await get(tenantId, `/centuries`).expect(200)).body as (Honour & { score: string })[]).map(
      (c) => [c.grade, c.season, c.score, c.playerId],
    );
  const fiveFors = async (tenantId: number) =>
    (
      (await get(tenantId, `/five-wicket-hauls`).expect(200)).body as (Honour & {
        figures: string;
      })[]
    ).map((c) => [c.grade, c.season, c.figures, c.playerId]);

  describe("centuries and five-wicket hauls", () => {
    it("a correction adds one century and removes another; history supplies the pre-boundary ones", async () => {
      expect(await centuries(t)).toEqual([
        ["A Grade", "1998/99", "134*", ID_A], // curated, before the boundary
        ["B Grade", "2004/05", "105", ID_A], // 95 corrected to 105
        ["B Grade", "2002/03", "100*", ID_A], // the scorebook match
      ]);
      // Gone: 104 corrected to 94; the junior 200; the curated 2010/11 row
      // (central supplies that season); the 8-game season and 20-game career.
    });

    it("AE4: removing the correction removes the century it made", async () => {
      await withoutCorrection(addCenturyId, async () => {
        expect(await centuries(t)).toEqual([
          ["A Grade", "1998/99", "134*", ID_A],
          ["B Grade", "2002/03", "100*", ID_A],
        ]);
      });
    });

    it("a correction can make a five-for, and the scorebook's counts", async () => {
      expect(await fiveFors(t)).toEqual([
        ["B Grade", "2004/05", "5/20", ID_A],
        ["B Grade", "2002/03", "6/25", ID_A],
      ]);
    });

    it("the control tenant lists exactly central's (its curated rows are not read)", async () => {
      expect(await centuries(u)).toEqual([["B Grade", "2005/06", "104", ID_A]]);
      expect(await fiveFors(u)).toEqual([]);
    });
  });

  // ── Record progression ────────────────────────────────────────────────────

  type Point = { value: string; season: number | null; matchId: number | null; dated: boolean };
  const progression = async (tenantId: number) =>
    (
      (await get(tenantId, `/records/progression?kind=highScore`).expect(200)).body
        .points as Point[]
    ).map((p) => [p.value, p.season, p.matchId, p.dated]);

  describe("record progression", () => {
    it("starts in club history, takes the corrected match and ends at the career record", async () => {
      expect(await progression(t)).toEqual([
        ["100*", 2002, null, true], // the scorebook match (season level)
        ["105", 2004, matchId(CLUB_T, 2), true], // 95 corrected to 105
        ["150", null, null, false], // the A Grade career row's high score
      ]);
    });

    it("AE4: removing the correction takes its point out of the series", async () => {
      await withoutCorrection(addCenturyId, async () => {
        expect((await progression(t)).map((p) => p[0])).toEqual(["100*", "150"]);
      });
    });

    it("the control tenant walks plain central", async () => {
      expect((await progression(u)).map((p) => p[0])).toEqual(["70", "95", "104"]);
    });
  });

  // ── Rule differences resolved (every club, club layer or not) ─────────────

  describe("rules that now hold on every central read", () => {
    it("R7: a match a player only bowled in is a game on the grade leaderboard too", async () => {
      for (const tenantId of [t, u]) {
        const board = (
          await get(tenantId, `/grades/${encodeURIComponent("B Grade")}/leaderboard`).expect(200)
        ).body as { playerId: number; games: number }[];
        expect(board.find((r) => r.playerId === ID_B)?.games).toBe(2);
        const dir = await get(tenantId, `/players?limit=100`).expect(200);
        const bea = (dir.body.players as { id: number; totalGames: number }[]).find(
          (p) => p.id === ID_B,
        );
        expect(bea?.totalGames).toBe(2);
      }
    });

    it("most catches: one classifier — the record, the leaders and the top fielder agree", async () => {
      // A's two catches, one written "ct": the season rows already counted both.
      const seasons = (await get(u, `/players/${ID_A}/seasons`).expect(200)).body as {
        season: number;
        catches: number | null;
      }[];
      expect(seasons.find((s) => s.season === 2005)?.catches).toBe(2);
      const records = await get(u, `/records`).expect(200);
      expect(records.body.mostCatches).toMatchObject({ playerId: ID_A, value: 2 });
      const leaders = await get(u, `/records/leaders?metric=catches`).expect(200);
      expect(leaders.body.entries[0]).toMatchObject({ playerId: ID_A, value: 2 });
      const dash = await get(u, `/dashboard`).expect(200);
      expect(dash.body.topFielder).toMatchObject({ id: ID_A, value: 2 });
      expect(dash.body.gradeSummaries[0]).toMatchObject({ catches: 2 });
    });
  });

  // ── KTD8: drafting never sees the club layer ──────────────────────────────

  describe("the Social Studio drafting paths are untouched", () => {
    it("the drafters' match read is plain central: uncorrected, and not boundary-filtered", async () => {
      const source = { tenantId: t, clubId: CLUB_T };
      const corrected = await loadCentralMatchDetail(source, matchId(CLUB_T, 2));
      expect(corrected!.lines.find((l) => l.playerId === ID_A)).toMatchObject({
        runs: 95,
        wickets: 4,
      });
      const preBoundary = await loadCentralMatchDetail(source, matchId(CLUB_T, 1));
      expect(preBoundary!.lines.find((l) => l.playerId === ID_A)).toMatchObject({ runs: 70 });
    });

    it("reading every overlaid surface drafts nothing", async () => {
      const drafts = await db
        .select({ id: socialDraftsTable.id })
        .from(socialDraftsTable)
        .where(inArray(socialDraftsTable.tenantId, tenantIds));
      expect(drafts).toEqual([]);
    });
  });
});
