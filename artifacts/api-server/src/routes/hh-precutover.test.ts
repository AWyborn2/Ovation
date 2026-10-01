import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  capRegisterTable,
  clubHistoryBoundariesTable,
  playerIdMapTable,
  playersTable,
  tenantsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { invalidateTenantConfigCache } from "../lib/tenant";
import { clearMilestonesCache } from "../lib/milestones-cache";

/**
 * Halls Head pre-cut-over fixes on the real read path (cut-over preview,
 * 1 Oct 2026).
 *
 * CAP-ONLY PLAYERS. Halls Head's cap register links 42 caps to "cap-only"
 * native players (ids in the 95001+ range: a cap number, no stats). Today the
 * cap register links each to `/players/<id>`, which shows the player's name, an
 * empty career and the "A Grade Cap #N" note. After cut-over the hybrid read
 * resolves players through the crosswalk, where these ids never are (ids >=
 * 90000 are excluded from every stat derivation) — so the link was a 404 and
 * the cap could no longer be re-linked. This suite pins that the page, its
 * season and match reads and the cap link behave EXACTLY as they do today, and
 * that the player still never appears in a directory, leaderboard or count.
 *
 * Real-DB integration (CI's API job: DATABASE_URL and CENTRAL_DATABASE_URL are
 * the same throwaway Postgres). Tenant 1 is flipped to central reads for the
 * second half of the suite and restored afterwards; the central rows are
 * written through the tenant `db` with raw SQL, only when the database is
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
const T1 = 1;
const CLUB_HH = 9821; // tenant 1's central club while the suite runs
const CLUB_T2 = 9823;
const OPP = 9822;
const CLUBS = [CLUB_HH, CLUB_T2];
const LINE_BASE = 9_820_000;
const G = "98200000-0000-4000-8000-00000000000a"; // a real player with central lines
const O = "98200000-0000-4000-8000-0000000000ff";
const SURNAME = `Capper${STAMP}`;
const matchId = (club: number) => club * 100 + 1;

async function seedCentral(): Promise<void> {
  for (const [id, name] of [
    [CLUB_HH, "Precutover Test CC"],
    [OPP, "Precutover Opp CC"],
    [CLUB_T2, "Precutover Other CC"],
  ] as const) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${id}, ${name}, ${`P${id}`}, '#123456', null, null, '2002/03', null)
    `);
  }
  for (const [id, name] of [
    [G, "Greta Realplayer"],
    [O, "Olly Opp"],
  ] as const) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${id}, ${name}, 0, ${CLUB_HH}, '2010/11', '2010/11', 1)
    `);
  }
  let id = LINE_BASE;
  for (const club of CLUBS) {
    const m = matchId(club);
    await db.execute(sql`
      insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
        status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
      values (${m}, ${`precutover-test-${m}`}, '2010/11', 'A Grade', 'g', 'One Day', '1',
        '2010-11-01', 'Precutover Oval', 'Completed', ${club}, ${OPP}, 'Home', 'Opp',
        '5/150', '10/120', ${club}, ${club}, 'won')
    `);
    await db.execute(sql`
      insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
        runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
      values (${id++}, ${m}, 1, ${club}, 'x', 1, ${G}, 'x', 55, 60, 0, 0, 90, 'b Bowler', 'bowled', null)
    `);
    await db.execute(sql`
      insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
      values (${id++}, ${m}, ${club}, 'x', ${G}, 'x')
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
    sql`delete from central.matches where match_id in (${matchId(CLUB_HH)}, ${matchId(CLUB_T2)})`,
  );
  await db.execute(sql`delete from central.players where participant_id in (${G}, ${O})`);
  await db.execute(
    sql`delete from central.clubs where club_id in (${CLUB_HH}, ${OPP}, ${CLUB_T2})`,
  );
}

describe.skipIf(!isLocalDb)("Halls Head pre-cut-over: cap-only players", () => {
  let capOnlyId = 0;
  let fillInId = 0;
  let realId = 0;
  let capRowId = 0;
  let t2 = 0;
  let t2CapRowId = 0;
  let adminId = 0;
  let admin2Id = 0;
  let cookie = "";
  let cookie2 = "";
  let prevTenant: { centralClubId: number | null; readsFromCentral: boolean };
  let prevTtl: string | undefined;
  const capNumber = 900_000 + (STAMP % 90_000);

  const get = (tenantId: number, path: string) =>
    request(app)
      .get(`/api${path}`)
      .set({ "x-tenant-id": String(tenantId) });
  const patchCap = (tenantId: number, id: number, body: object, session: string) =>
    request(app)
      .patch(`/api/caps/${id}`)
      .set({ "x-tenant-id": String(tenantId) })
      .set("Cookie", session)
      .send(body);

  /** What the site shows today for the cap-only player (tenant 1 reading native). */
  const today: { player?: unknown; seasons?: unknown; matches?: unknown } = {};

  async function setTenant1(centralClubId: number | null, readsFromCentral: boolean) {
    await db
      .update(tenantsTable)
      .set({ centralClubId, readsFromCentral })
      .where(eq(tenantsTable.id, T1));
    invalidateTenantConfigCache();
    clearMilestonesCache();
  }
  const cutOver = () => setTenant1(CLUB_HH, true);

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-hh-precutover";
    prevTtl = process.env.CENTRAL_CACHE_TTL_MS;
    process.env.CENTRAL_CACHE_TTL_MS = "0";

    const [t1] = await db
      .select({
        centralClubId: tenantsTable.centralClubId,
        readsFromCentral: tenantsTable.readsFromCentral,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, T1));
    prevTenant = { centralClubId: t1!.centralClubId, readsFromCentral: t1!.readsFromCentral };
    // The first half pins today's behaviour: tenant 1 reads native.
    expect(prevTenant.readsFromCentral).toBe(false);

    await cleanCentral();
    await seedCentral();

    // Native players: a cap-only player (95001+ range), a fill-in (90001+
    // range) and an ordinary player the crosswalk maps.
    const nextIn = async (from: number, to: number): Promise<number> => {
      const [{ maxId }] = (
        await db.execute(
          sql`select coalesce(max(id), ${from})::int as "maxId" from players where id >= ${from} and id < ${to}`,
        )
      ).rows as { maxId: number }[];
      return maxId + 1;
    };
    capOnlyId = await nextIn(95_000, 99_000);
    fillInId = await nextIn(90_000, 94_000);
    await db.insert(playersTable).values([
      { id: capOnlyId, surname: SURNAME, givenName: "Colin", deceased: true, isCapOnly: true },
      { id: fillInId, surname: SURNAME, givenName: "Fill-in", isFillIn: true },
    ]);
    const [real] = await db
      .insert(playersTable)
      .values({ surname: `Real${STAMP}`, givenName: "Greta" })
      .returning();
    realId = real!.id;
    await db.insert(playerIdMapTable).values({ tenantId: T1, participantId: G, playerId: realId });

    const [cap] = await db
      .insert(capRegisterTable)
      .values({
        tenantId: T1,
        capNumber,
        category: "male",
        name: `Colin ${SURNAME}`,
        deceased: true,
        playerId: capOnlyId,
      })
      .returning();
    capRowId = cap!.id;

    // Another club (central reads) with its own cap and its own id space.
    const [tenant2] = await db
      .insert(tenantsTable)
      .values({
        slug: `precutover-t2-${STAMP}`,
        centralClubId: CLUB_T2,
        readsFromCentral: true,
        name: "Precutover Tenant 2",
        plan: "pilot",
      })
      .returning();
    t2 = tenant2!.id;
    await db.insert(playerIdMapTable).values({ tenantId: t2, participantId: G, playerId: 1 });
    const [cap2] = await db
      .insert(capRegisterTable)
      .values({ tenantId: t2, capNumber: 1, category: "male", name: "Other Club Cap" })
      .returning();
    t2CapRowId = cap2!.id;

    const [a1] = await db
      .insert(adminsTable)
      .values({
        tenantId: T1,
        username: `precutover_admin_t1_${STAMP}`,
        displayName: "Precutover Admin T1",
        passwordHash: "x",
      })
      .returning();
    adminId = a1!.id;
    const [a2] = await db
      .insert(adminsTable)
      .values({
        tenantId: t2,
        username: `precutover_admin_t2_${STAMP}`,
        displayName: "Precutover Admin T2",
        passwordHash: "x",
      })
      .returning();
    admin2Id = a2!.id;
    cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
    cookie2 = `${SESSION_COOKIE}=${encodeSession({ adminId: admin2Id, issuedAt: Date.now() })}`;
    invalidateTenantConfigCache();
  });

  afterAll(async () => {
    // Tenant 1 goes back to exactly how the suite found it, whatever happened.
    if (prevTenant) await setTenant1(prevTenant.centralClubId, prevTenant.readsFromCentral);
    await db
      .delete(clubHistoryBoundariesTable)
      .where(
        and(
          eq(clubHistoryBoundariesTable.tenantId, T1),
          eq(clubHistoryBoundariesTable.updatedBy, `precutover-${STAMP}`),
        ),
      );
    await db.delete(capRegisterTable).where(inArray(capRegisterTable.id, [capRowId, t2CapRowId]));
    await db
      .delete(playerIdMapTable)
      .where(and(eq(playerIdMapTable.tenantId, T1), eq(playerIdMapTable.participantId, G)));
    if (t2) await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, t2));
    await db.delete(playersTable).where(inArray(playersTable.id, [capOnlyId, fillInId, realId]));
    await db.delete(adminsTable).where(inArray(adminsTable.id, [adminId, admin2Id]));
    if (t2) await db.delete(tenantsTable).where(eq(tenantsTable.id, t2));
    invalidateTenantConfigCache();
    await cleanCentral();
    if (prevTtl === undefined) delete process.env.CENTRAL_CACHE_TTL_MS;
    else process.env.CENTRAL_CACHE_TTL_MS = prevTtl;
    clearMilestonesCache();
  });

  // ── Today (tenant 1 reads native) ─────────────────────────────────────────

  it("today: the cap links to a player page with a name, the cap-only flag and no stats", async () => {
    const caps = await get(T1, "/caps").expect(200);
    const cap = (caps.body as { id: number; playerId: number | null }[]).find(
      (c) => c.id === capRowId,
    );
    expect(cap?.playerId).toBe(capOnlyId);

    const player = await get(T1, `/players/${capOnlyId}`).expect(200);
    expect(player.body).toMatchObject({
      id: capOnlyId,
      givenName: "Colin",
      surname: SURNAME,
      deceased: true,
      isCapOnly: true,
      isFillIn: false,
      stats: [],
      premierships: [],
      awards: [],
      debutSeason: null,
      seasonsPlayed: null,
    });
    const seasons = await get(T1, `/players/${capOnlyId}/seasons`).expect(200);
    const matches = await get(T1, `/players/${capOnlyId}/matches`).expect(200);
    expect(seasons.body).toEqual([]);
    expect(matches.body).toEqual([]);
    today.player = player.body;
    today.seasons = seasons.body;
    today.matches = matches.body;
  });

  // ── After cut-over (tenant 1 reads central) ───────────────────────────────

  describe("after cut-over", () => {
    beforeAll(cutOver);

    const expectSameAsToday = async (): Promise<void> => {
      const player = await get(T1, `/players/${capOnlyId}`).expect(200);
      expect(player.body).toEqual(today.player);
      const seasons = await get(T1, `/players/${capOnlyId}/seasons`).expect(200);
      expect(seasons.body).toEqual(today.seasons);
      const matches = await get(T1, `/players/${capOnlyId}/matches`).expect(200);
      expect(matches.body).toEqual(today.matches);
    };

    it("the cap still resolves: the player page, seasons and matches are exactly today's", async () => {
      expect(today.player).toBeDefined();
      await expectSameAsToday();
      const caps = await get(T1, "/caps").expect(200);
      const cap = (caps.body as { id: number; playerId: number | null; name: string }[]).find(
        (c) => c.id === capRowId,
      );
      expect(cap).toMatchObject({ playerId: capOnlyId, name: `Colin ${SURNAME}` });
    });

    it("and the same with a club layer in place (the overlay active)", async () => {
      await db
        .insert(clubHistoryBoundariesTable)
        .values({ tenantId: T1, grade: null, startSeason: 2003, updatedBy: `precutover-${STAMP}` });
      try {
        await expectSameAsToday();
        // The ordinary crosswalk player reads through the overlay as usual.
        const real = await get(T1, `/players/${realId}`).expect(200);
        expect(real.body).toMatchObject({ id: realId, totalGames: 1, totalRuns: 55 });
      } finally {
        await db
          .delete(clubHistoryBoundariesTable)
          .where(
            and(
              eq(clubHistoryBoundariesTable.tenantId, T1),
              eq(clubHistoryBoundariesTable.updatedBy, `precutover-${STAMP}`),
            ),
          );
      }
    });

    it("the cap-only player is in no directory, count or leaderboard", async () => {
      const dir = await get(T1, `/players?limit=100`).expect(200);
      const ids = (dir.body.players as { id: number }[]).map((p) => p.id);
      expect(ids).toContain(realId);
      expect(ids).not.toContain(capOnlyId);
      expect(dir.body.total).toBe(ids.length);
      const search = await get(T1, `/players?search=${SURNAME}`).expect(200);
      expect(search.body).toMatchObject({ players: [], total: 0 });
      const board = await get(T1, `/grades/${encodeURIComponent("A Grade")}/leaderboard`).expect(
        200,
      );
      expect((board.body as { playerId: number }[]).map((r) => r.playerId)).toEqual([realId]);
      const leaders = await get(T1, `/records/leaders?metric=games`).expect(200);
      expect((leaders.body.entries as { playerId: number }[]).map((e) => e.playerId)).toEqual([
        realId,
      ]);
    });

    it("a cap can still be linked to a cap-only player — and to nothing else in that range", async () => {
      const ok = await patchCap(T1, capRowId, { playerId: capOnlyId }, cookie);
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ id: capRowId, playerId: capOnlyId });

      // A fill-in is never a player; an id nobody has is refused too.
      const fillIn = await patchCap(T1, capRowId, { playerId: fillInId }, cookie);
      expect(fillIn.status).toBe(422);
      const unknown = await patchCap(T1, capRowId, { playerId: capOnlyId + 500 }, cookie);
      expect(unknown.status).toBe(422);

      const [row] = await db
        .select({ playerId: capRegisterTable.playerId })
        .from(capRegisterTable)
        .where(eq(capRegisterTable.id, capRowId));
      expect(row?.playerId).toBe(capOnlyId);
    });

    it("a fill-in id is still not a player page", async () => {
      await get(T1, `/players/${fillInId}`).expect(404);
      await get(T1, `/players/${fillInId}/seasons`).expect(404);
      await get(T1, `/players/${fillInId}/matches`).expect(404);
    });

    it("another club never sees Halls Head's cap-only player, and can't link it", async () => {
      await get(t2, `/players/${capOnlyId}`).expect(404);
      await get(t2, `/players/${capOnlyId}/seasons`).expect(404);
      await get(t2, `/players/${capOnlyId}/matches`).expect(404);
      const res = await patchCap(t2, t2CapRowId, { playerId: capOnlyId }, cookie2);
      expect(res.status).toBe(422);
    });
  });
});
