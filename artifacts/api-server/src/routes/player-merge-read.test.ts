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
 * Seeds a tiny central club (9701) whose one real player appears under THREE
 * PlayHQ GUIDs — A (keeper), B and C, one match each — plus a private GUID P
 * and an opposition player O at club 9702. Then walks the read surfaces as
 * central tenants with different curation:
 *
 *   T1: B -> A confirmed (via the admin route); C -> A suggested, then rejected
 *   T2: no merges (same central club — a merge never crosses tenants)
 *   T4: A -> B -> C confirmed (a chain folds to C)
 *   T5: P -> A confirmed (a private GUID masks the whole group)
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
const CLUB = 9701;
const OPP = 9702;
const MATCHES = [970001, 970002, 970003];
const LINE_BASE = 9_700_000;
const A = "97000000-0000-4000-8000-00000000000a";
const B = "97000000-0000-4000-8000-00000000000b";
const C = "97000000-0000-4000-8000-00000000000c";
const P = "97000000-0000-4000-8000-00000000000f";
const O = "97000000-0000-4000-8000-0000000000ff";
const GRADE = "A Grade";

// (guid, match, runs, wickets) for the club side. A/B/C are one person.
const CLUB_LINES: [string, number, number, number][] = [
  [A, MATCHES[0]!, 40, 2],
  [P, MATCHES[0]!, 10, 0],
  [B, MATCHES[1]!, 60, 3],
  [C, MATCHES[2]!, 25, 1],
];

async function seedCentral(): Promise<void> {
  await db.execute(sql`
    insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
    values (${CLUB}, 'Merge Test CC', 'MTCC', '#123456', null, null, '2002/03', null),
           (${OPP}, 'Merge Opp CC', 'MOCC', '#654321', null, null, '2002/03', null)
  `);
  const players: [string, string, number, number][] = [
    [A, "Ava Merge", 0, CLUB],
    [B, "A Merge", 0, CLUB],
    [C, "Av Merge", 0, CLUB],
    [P, "Pat Private", 1, CLUB],
    [O, "Olly Opp", 0, OPP],
  ];
  for (const [id, name, priv, club] of players) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${id}, ${name}, ${priv}, ${club}, '2024/25', '2024/25', 1)
    `);
  }
  for (const [i, m] of MATCHES.entries()) {
    await db.execute(sql`
      insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
        status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
      values (${m}, ${`merge-test-${m}`}, '2024/25', ${GRADE}, 'grade-a', 'One Day', ${String(i + 1)}, ${`2024-11-0${i + 1}`},
        'Merge Oval', 'Completed', ${CLUB}, ${OPP}, 'Merge Test CC', 'Merge Opp CC', '5/150', '10/120', ${CLUB}, ${CLUB},
        'Merge Test CC won')
    `);
  }
  let id = LINE_BASE;
  const lines: [string, number, number, number, number, string, string][] = [
    ...CLUB_LINES.map(
      ([g, m, r, w]) =>
        [g, m, r, w, CLUB, "Merge Test CC", g] as [
          string,
          number,
          number,
          number,
          number,
          string,
          string,
        ],
    ),
    ...MATCHES.map(
      (m) =>
        [O, m, 12, 1, OPP, "Merge Opp CC", O] as [
          string,
          number,
          number,
          number,
          number,
          string,
          string,
        ],
    ),
  ];
  for (const [guid, m, runs, wkts, club, team] of lines) {
    await db.execute(sql`
      insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
        runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
      values (${id++}, ${m}, ${club === CLUB ? 1 : 2}, ${club}, ${team}, 1, ${guid}, 'x',
        ${runs}, ${runs}, 0, 0, 100, 'b Bowler', 'bowled', null)
    `);
    await db.execute(sql`
      insert into central.match_bowling (id, match_id, innings, club_id, team_name, participant_id, player_name,
        overs, maidens, runs, wickets, economy, wides, no_balls)
      values (${id++}, ${m}, ${club === CLUB ? 2 : 1}, ${club}, ${team}, ${guid}, 'x', 5, 0, 20, ${wkts}, 4, 0, 0)
    `);
    await db.execute(sql`
      insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
      values (${id++}, ${m}, ${club}, ${team}, ${guid}, 'x')
    `);
  }
}

async function cleanCentral(): Promise<void> {
  const guids = [A, B, C, P, O];
  await db.execute(
    sql`delete from central.match_batting where id >= ${LINE_BASE} and id < ${LINE_BASE + 1000}`,
  );
  await db.execute(
    sql`delete from central.match_bowling where id >= ${LINE_BASE} and id < ${LINE_BASE + 1000}`,
  );
  await db.execute(
    sql`delete from central.match_rosters where id >= ${LINE_BASE} and id < ${LINE_BASE + 1000}`,
  );
  await db.execute(
    sql`delete from central.matches where match_id in (${sql.join(
      MATCHES.map((m) => sql`${m}`),
      sql`, `,
    )})`,
  );
  await db.execute(
    sql`delete from central.players where participant_id in (${sql.join(
      guids.map((g) => sql`${g}`),
      sql`, `,
    )})`,
  );
  await db.execute(sql`delete from central.clubs where club_id in (${CLUB}, ${OPP})`);
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

  async function makeTenant(label: string): Promise<number> {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `merge-read-${label}-${STAMP}`,
        centralClubId: CLUB,
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

    t1 = await makeTenant("t1");
    t2 = await makeTenant("t2");
    t4 = await makeTenant("t4");
    t5 = await makeTenant("t5");
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

  it("a merge never crosses tenants: the same club without merges sees two players", async () => {
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
