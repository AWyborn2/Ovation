import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playersTable,
  playerIdMapTable,
  playerCurationTable,
  awardsTable,
  awardWinnersTable,
  milestoneBoardSettingsTable,
} from "@workspace/db";
import { clearMilestonesCache } from "../lib/milestones-cache";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Confirmed merges fold on every central read (hybrid stats plan U6, KTD2).
 *
 * Seeds four tiny central clubs (one per test tenant — `tenants.central_club_id`
 * is unique). The same person appears in each under THREE PlayHQ GUIDs — A
 * (keeper), B and C, one match each — alongside a private GUID P, all against
 * an opposition player O at club 9702. The GUIDs are the same across the clubs
 * (a central player can play for several), so a merge made by one tenant can be
 * checked against another tenant reading the very same GUIDs. The tenants:
 *
 *   T1 (club 9701): B -> A confirmed (via the admin route); C -> A suggested,
 *                   then rejected
 *   T2 (club 9703): no merges — T1's merge must never reach it
 *   T4 (club 9704): A -> B -> C confirmed (a chain folds to C)
 *   T5 (club 9705): P -> A confirmed (a private GUID masks the whole group)
 *
 * Real-DB integration (runs in CI's API integration job, where DATABASE_URL and
 * CENTRAL_DATABASE_URL are the same throwaway Postgres). The central rows are
 * written through the TENANT `db` with raw SQL exactly like
 * maintenance/seed-ci-central-fixture.ts — and only when the database is local:
 * the app itself never writes central.
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
const CLUB_T1 = 9701;
const OPP = 9702;
const CLUB_T2 = 9703;
const CLUB_T4 = 9704;
const CLUB_T5 = 9705;
const CLUBS = [CLUB_T1, CLUB_T2, CLUB_T4, CLUB_T5];
/** Three matches per club: club * 100 + 11..13 (970111-970113 for 9701). */
const matchesOf = (club: number) => [1, 2, 3].map((n) => club * 100 + 10 + n);
const ALL_MATCHES = CLUBS.flatMap(matchesOf);
const LINE_BASE = 9_700_000;
const A = "97000000-0000-4000-8000-00000000000a";
const B = "97000000-0000-4000-8000-00000000000b";
const C = "97000000-0000-4000-8000-00000000000c";
const P = "97000000-0000-4000-8000-00000000000f";
const O = "97000000-0000-4000-8000-0000000000ff";
const GRADE = "A Grade";

/** (guid, match index, runs, wickets) for a club side. A/B/C are one person. */
const CLUB_LINES: [string, number, number, number][] = [
  [A, 0, 40, 2],
  [P, 0, 10, 0],
  [B, 1, 60, 3],
  [C, 2, 25, 1],
];

type Line = { guid: string; match: number; runs: number; wkts: number; club: number };

async function seedCentral(): Promise<void> {
  const clubRows: [number, string][] = [
    [CLUB_T1, "Merge Test One CC"],
    [OPP, "Merge Opp CC"],
    [CLUB_T2, "Merge Test Two CC"],
    [CLUB_T4, "Merge Test Four CC"],
    [CLUB_T5, "Merge Test Five CC"],
  ];
  for (const [id, name] of clubRows) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${id}, ${name}, ${`M${id}`}, '#123456', null, null, '2002/03', null)
    `);
  }
  const players: [string, string, number][] = [
    [A, "Ava Merge", 0],
    [B, "A Merge", 0],
    [C, "Av Merge", 0],
    [P, "Pat Private", 1],
    [O, "Olly Opp", 0],
  ];
  for (const [id, name, priv] of players) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${id}, ${name}, ${priv}, ${CLUB_T1}, '2024/25', '2024/25', 1)
    `);
  }

  const lines: Line[] = [];
  for (const club of CLUBS) {
    const clubName = clubRows.find(([id]) => id === club)![1];
    for (const [i, m] of matchesOf(club).entries()) {
      await db.execute(sql`
        insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
          status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
        values (${m}, ${`merge-test-${m}`}, '2024/25', ${GRADE}, 'grade-a', 'One Day', ${String(i + 1)}, ${`2024-11-0${i + 1}`},
          'Merge Oval', 'Completed', ${club}, ${OPP}, ${clubName}, 'Merge Opp CC', '5/150', '10/120', ${club}, ${club},
          ${`${clubName} won`})
      `);
      lines.push({ guid: O, match: m, runs: 12, wkts: 1, club: OPP });
    }
    for (const [guid, i, runs, wkts] of CLUB_LINES) {
      lines.push({ guid, match: matchesOf(club)[i]!, runs, wkts, club });
    }
  }

  let id = LINE_BASE;
  for (const { guid, match, runs, wkts, club } of lines) {
    const home = club !== OPP;
    await db.execute(sql`
      insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
        runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
      values (${id++}, ${match}, ${home ? 1 : 2}, ${club}, 'x', 1, ${guid}, 'x',
        ${runs}, ${runs}, 0, 0, 100, 'b Bowler', 'bowled', null)
    `);
    await db.execute(sql`
      insert into central.match_bowling (id, match_id, innings, club_id, team_name, participant_id, player_name,
        overs, maidens, runs, wickets, economy, wides, no_balls)
      values (${id++}, ${match}, ${home ? 2 : 1}, ${club}, 'x', ${guid}, 'x', 5, 0, 20, ${wkts}, 4, 0, 0)
    `);
    await db.execute(sql`
      insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
      values (${id++}, ${match}, ${club}, 'x', ${guid}, 'x')
    `);
  }
}

async function cleanCentral(): Promise<void> {
  const inList = (xs: (number | string)[]) =>
    sql.join(
      xs.map((x) => sql`${x}`),
      sql`, `,
    );
  const range = sql`id >= ${LINE_BASE} and id < ${LINE_BASE + 10_000}`;
  await db.execute(sql`delete from central.match_batting where ${range}`);
  await db.execute(sql`delete from central.match_bowling where ${range}`);
  await db.execute(sql`delete from central.match_rosters where ${range}`);
  await db.execute(sql`delete from central.matches where match_id in (${inList(ALL_MATCHES)})`);
  await db.execute(
    sql`delete from central.players where participant_id in (${inList([A, B, C, P, O])})`,
  );
  await db.execute(sql`delete from central.clubs where club_id in (${inList([...CLUBS, OPP])})`);
}

describe.skipIf(!isLocalDb)("confirmed merges fold on every central read", () => {
  const tenantIds: number[] = [];
  let t1: number;
  let t2: number;
  let t4: number;
  let t5: number;
  let adminId: number;
  let adminCookie: string;
  /** Native player rows whose ids serve as crosswalk ints (award winners FK them). */
  const idOf: Record<string, number> = {};
  let awardId: number;
  let prevTtl: string | undefined;

  const asTenant = (tenantId: number) => ({ "x-tenant-id": String(tenantId) });
  const get = (tenantId: number, path: string) =>
    request(app).get(`/api${path}`).set(asTenant(tenantId));

  async function makeTenant(label: string, club: number): Promise<number> {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `merge-read-${label}-${STAMP}`,
        centralClubId: club,
        name: `Merge Read ${label}`,
        readsFromCentral: true,
      })
      .returning();
    tenantIds.push(t.id);
    await db
      .insert(playerIdMapTable)
      .values([A, B, C, P].map((g) => ({ tenantId: t.id, participantId: g, playerId: idOf[g]! })));
    await db.insert(milestoneBoardSettingsTable).values({
      tenantId: t.id,
      gamesTiers: [2],
      runsTiers: [100000],
      wicketsTiers: [100000],
    });
    return t.id;
  }

  async function merge(tenantId: number, from: string, to: string, status = "confirmed") {
    await db.insert(playerCurationTable).values({
      tenantId,
      participantId: from,
      mergedIntoParticipantId: to,
      mergeStatus: status as "confirmed",
    });
  }

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-merge-read";
    prevTtl = process.env.CENTRAL_CACHE_TTL_MS;
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    await cleanCentral();
    await seedCentral();

    for (const g of [A, B, C, P]) {
      const [p] = await db
        .insert(playersTable)
        .values({ surname: `Mergeread${STAMP}`, givenName: g.slice(-2) })
        .returning();
      idOf[g] = p.id;
    }

    t1 = await makeTenant("t1", CLUB_T1);
    t2 = await makeTenant("t2", CLUB_T2);
    t4 = await makeTenant("t4", CLUB_T4);
    t5 = await makeTenant("t5", CLUB_T5);
    await merge(t4, A, B);
    await merge(t4, B, C);
    await merge(t5, P, A);

    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId: t1,
        username: `merge_read_admin_${STAMP}`,
        displayName: "Merge Read Admin",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;

    // T1's merge goes through the admin route (the happy path of the guard).
    await request(app)
      .put(`/api/player-curation/${B}`)
      .set(asTenant(t1))
      .set("Cookie", adminCookie)
      .send({ mergedIntoParticipantId: A })
      .expect(200);

    // An award recorded against the merged-away id.
    const [award] = await db
      .insert(awardsTable)
      .values({
        tenantId: t1,
        key: `merge-read-award-${STAMP}`,
        title: "Merge Read Medal",
        published: true,
      })
      .returning();
    awardId = award.id;
    await db.insert(awardWinnersTable).values({
      tenantId: t1,
      awardId,
      season: 2024,
      playerId: idOf[B]!,
      name: "A Merge",
      published: true,
    });
  });

  afterAll(async () => {
    await db.delete(awardWinnersTable).where(eq(awardWinnersTable.awardId, awardId));
    await db.delete(awardsTable).where(eq(awardsTable.id, awardId));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
    await db.delete(playerCurationTable).where(inArray(playerCurationTable.tenantId, tenantIds));
    await db.delete(playerIdMapTable).where(inArray(playerIdMapTable.tenantId, tenantIds));
    await db
      .delete(milestoneBoardSettingsTable)
      .where(inArray(milestoneBoardSettingsTable.tenantId, tenantIds));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
    await db.delete(playersTable).where(inArray(playersTable.id, Object.values(idOf)));
    await cleanCentral();
    if (prevTtl === undefined) delete process.env.CENTRAL_CACHE_TTL_MS;
    else process.env.CENTRAL_CACHE_TTL_MS = prevTtl;
    clearMilestonesCache();
  });

  beforeEach(() => clearMilestonesCache());

  type DirRow = { id: number; totalRuns: number; totalWickets: number; totalGames: number };
  const directory = async (tenantId: number): Promise<DirRow[]> => {
    const res = await get(tenantId, `/players?limit=100`).expect(200);
    const mine = new Set(Object.values(idOf));
    return (res.body.players as DirRow[]).filter((p) => mine.has(p.id));
  };

  describe("a confirmed pair is one career on every surface", () => {
    it("directory: one row under the keeper with summed games, runs and wickets", async () => {
      const rows = await directory(t1);
      const keeper = rows.find((r) => r.id === idOf[A]);
      expect(keeper).toMatchObject({ totalGames: 2, totalRuns: 100, totalWickets: 5 });
      expect(rows.find((r) => r.id === idOf[B])).toBeUndefined();
      // C's merge is not confirmed, so C stays its own player.
      expect(rows.find((r) => r.id === idOf[C])).toMatchObject({ totalRuns: 25 });
    });

    it("player detail: the keeper's career covers both GUIDs", async () => {
      const res = await get(t1, `/players/${idOf[A]}`).expect(200);
      expect(res.body).toMatchObject({
        id: idOf[A],
        totalGames: 2,
        totalRuns: 100,
        totalWickets: 5,
      });
    });

    it("a merged-away id resolves to the keeper", async () => {
      const res = await get(t1, `/players/${idOf[B]}`).expect(200);
      expect(res.body).toMatchObject({ id: idOf[A], totalRuns: 100 });
      const matches = await get(t1, `/players/${idOf[B]}/matches`).expect(200);
      expect(matches.body).toHaveLength(2);
      const seasons = await get(t1, `/players/${idOf[A]}/seasons`).expect(200);
      expect(seasons.body).toEqual([expect.objectContaining({ grade: GRADE, runs: 100 })]);
    });

    it("an award linked to the merged-away id shows under the keeper", async () => {
      const res = await get(t1, `/players/${idOf[A]}`).expect(200);
      expect(res.body.awards).toEqual([
        expect.objectContaining({ title: "Merge Read Medal", season: 2024 }),
      ]);
    });

    it("grade leaderboard: one row for the pair", async () => {
      const res = await get(t1, `/grades/${encodeURIComponent(GRADE)}/leaderboard`).expect(200);
      const rows = (Array.isArray(res.body) ? res.body : res.body.items) as {
        playerId: number;
        runs: number;
        games: number;
      }[];
      expect(rows.filter((r) => r.playerId === idOf[A])).toEqual([
        expect.objectContaining({ runs: 100, games: 2 }),
      ]);
      expect(rows.some((r) => r.playerId === idOf[B])).toBe(false);
    });

    it("records: the pair's combined runs hold the record", async () => {
      const res = await get(t1, `/records`).expect(200);
      expect(res.body.mostRuns).toMatchObject({ playerId: idOf[A], value: 100 });
      const leaders = await get(t1, `/records/leaders?metric=runs`).expect(200);
      expect(leaders.body.entries[0]).toMatchObject({ playerId: idOf[A], value: 100 });
      expect(
        (leaders.body.entries as { playerId: number }[]).some((e) => e.playerId === idOf[B]),
      ).toBe(false);
    });

    it("milestones: the combined career crosses a games tier once, under the keeper", async () => {
      const res = await get(t1, `/milestones`).expect(200);
      const games = (
        res.body.items as { kind: string; boardKey: string | null; playerId: number }[]
      ).filter((i) => i.kind === "career" && i.boardKey === "games");
      expect(games).toEqual([expect.objectContaining({ playerId: idOf[A], threshold: 2 })]);
    });

    it("head-to-head: one row for the pair against the opponent", async () => {
      const res = await get(t1, `/players/vs-club?opponentClubId=${OPP}&minInnings=1`).expect(200);
      const batting = res.body.batting as { playerId: number; runs: number; innings: number }[];
      expect(batting.filter((r) => r.playerId === idOf[A])).toEqual([
        expect.objectContaining({ runs: 100, innings: 2 }),
      ]);
      expect(batting.some((r) => r.playerId === idOf[B])).toBe(false);
    });
  });

  it("a merge never crosses tenants: another tenant reading the same GUIDs sees two players", async () => {
    const rows = await directory(t2);
    expect(rows.find((r) => r.id === idOf[A])).toMatchObject({ totalRuns: 40, totalGames: 1 });
    expect(rows.find((r) => r.id === idOf[B])).toMatchObject({ totalRuns: 60, totalGames: 1 });
    const milestones = await get(t2, `/milestones`).expect(200);
    expect(
      (milestones.body.items as { kind: string }[]).filter((i) => i.kind === "career"),
    ).toEqual([]);
  });

  it("a chain A -> B -> C folds all three into C", async () => {
    const rows = await directory(t4);
    expect(rows.filter((r) => [idOf[A], idOf[B], idOf[C]].includes(r.id))).toEqual([
      expect.objectContaining({ id: idOf[C], totalGames: 3, totalRuns: 125, totalWickets: 6 }),
    ]);
  });

  it("a private GUID merged into a public keeper masks the combined player", async () => {
    const rows = await directory(t5);
    expect(rows.find((r) => r.id === idOf[A])).toBeUndefined();
    await get(t5, `/players/${idOf[A]}`).expect(404);
    await get(t5, `/players/${idOf[P]}`).expect(404);
    const lb = await get(t5, `/grades/${encodeURIComponent(GRADE)}/leaderboard`).expect(200);
    const rowsLb = (Array.isArray(lb.body) ? lb.body : lb.body.items) as {
      playerId: number;
      givenName: string;
      surname: string;
    }[];
    const masked = rowsLb.find((r) => r.playerId === idOf[A]);
    expect(masked).toMatchObject({ givenName: "Private", surname: "Player" });
  });

  describe("suggested and rejected merges leave the pair separate", () => {
    const putC = (mergeStatus: string) =>
      request(app)
        .put(`/api/player-curation/${C}`)
        .set(asTenant(t1))
        .set("Cookie", adminCookie)
        .send({ mergedIntoParticipantId: A, mergeStatus });

    it("suggested", async () => {
      const res = await putC("suggested").expect(200);
      expect(res.body.mergeStatus).toBe("suggested");
      const rows = await directory(t1);
      expect(rows.find((r) => r.id === idOf[C])).toMatchObject({ totalRuns: 25 });
      expect(rows.find((r) => r.id === idOf[A])).toMatchObject({ totalRuns: 100 });
    });

    it("rejected", async () => {
      const res = await putC("rejected").expect(200);
      expect(res.body.mergeStatus).toBe("rejected");
      const rows = await directory(t1);
      expect(rows.find((r) => r.id === idOf[C])).toMatchObject({ totalRuns: 25 });
    });
  });

  describe("the curation route refuses unsafe merges", () => {
    const put = (from: string, body: Record<string, unknown>) =>
      request(app)
        .put(`/api/player-curation/${from}`)
        .set(asTenant(t1))
        .set("Cookie", adminCookie)
        .send(body);

    it("a GUID from another club", async () => {
      await put(O, { mergedIntoParticipantId: A }).expect(400);
      await put(A, { mergedIntoParticipantId: O }).expect(400);
    });

    it("a private GUID", async () => {
      await put(P, { mergedIntoParticipantId: A }).expect(400);
      await put(C, { mergedIntoParticipantId: P }).expect(400);
    });

    it("an A -> B -> A cycle", async () => {
      // B -> A is confirmed for T1; A -> B would loop.
      await put(A, { mergedIntoParticipantId: B }).expect(400);
    });

    it("nothing refused was stored", async () => {
      const rows = await db
        .select({ participantId: playerCurationTable.participantId })
        .from(playerCurationTable)
        .where(eq(playerCurationTable.tenantId, t1));
      expect(rows.map((r) => r.participantId).sort()).toEqual([B, C].sort());
    });
  });
});
