import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  captainsTable,
  captainGradePermissionsTable,
  playersTable,
  playerGradeStatsTable,
  playerIdMapTable,
  awardsTable,
  awardWinnersTable,
  awardVotingConfigTable,
  awardBallotsTable,
  lifeMembersTable,
  teamOfDecadeBoardsTable,
  teamOfDecadeMembersTable,
  capRegisterTable,
  clubRolesTable,
  honourBoardsTable,
  honourBoardOverridesTable,
  premiershipsTable,
  premiershipPlayersTable,
  playerImagesTable,
} from "@workspace/db";
import {
  encodeSession,
  encodeCaptainSession,
  SESSION_COOKIE,
  CAPTAIN_SESSION_COOKIE,
} from "../lib/auth";
import { invalidateTenantConfigCache } from "../lib/tenant";

/**
 * Per-tenant player id space for curated content (hybrid stats plan U8, R16,
 * R17, KTD3).
 *
 * A tenant's player ids are its crosswalk ints (`player_id_map`). Tenant 1
 * (Halls Head) keeps its native `players.id`s — its crosswalk maps each keeper
 * GUID onto them — and while it reads native it may also link a native id that
 * has no crosswalk row. Central tenants' crosswalk ids start at 1, so they
 * OVERLAP native Halls Head ids: a curated row carrying tenant 2's id 5 must
 * never resolve to Halls Head's player 5, and a Halls Head player page must
 * never show tenant 2's curated rows.
 *
 * Real-DB integration test (needs DATABASE_URL; runs in CI's API integration
 * job). Tenant 1 is the seeded demo tenant (native reads); tenant 2 is a
 * central tenant created here. The one central-read check seeds a tiny central
 * club and only runs when the databases are local, like
 * player-merge-read.test.ts.
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
const CLUB_T2 = 9811;
const OPP = 9812;
const MATCH_T2 = 981_101;
const LINE_BASE = 9_810_000;
const G2A = "98110000-0000-4000-8000-00000000000a"; // tenant 2 -> native nA's int
const G2D = "98110000-0000-4000-8000-00000000000d"; // tenant 2 -> native nD's int
const G2E = "98110000-0000-4000-8000-00000000000e"; // tenant 2 -> native nE's int
const G2F = "98110000-0000-4000-8000-00000000000f"; // tenant 2 -> an id with no native row
const G1F = "98110000-0000-4000-8000-0000000001ff"; // tenant 1 crosswalk-only id
const CENTRAL_NAME = "Crosswalk Twoplayer";

const asTenant = (tenantId: number) => ({ "x-tenant-id": String(tenantId) });

describe("curated player links stay inside the club's own player id space", () => {
  let t2: number;
  let admin1Id: number;
  let admin2Id: number;
  let captain2Id: number;
  let cookie1: string;
  let cookie2: string;
  let captainCookie2: string;

  /** Native (tenant 1) players. */
  const native: Record<"A" | "B" | "D" | "E", number> = { A: 0, B: 0, D: 0, E: 0 };
  let freeT1 = 0; // tenant 1 crosswalk-only id (no native row)
  let freeT2 = 0; // tenant 2 crosswalk id with no native row
  let outside = 0; // in nobody's space

  /** Per-tenant fixtures the write routes act on. */
  type Fixtures = {
    awardId: number;
    awardKey: string;
    winnerId: number;
    lifeMemberId: number;
    todBoardId: number;
    todMemberId: number;
    capId: number;
    clubRoleId: number;
    honourBoardKey: string;
    premiershipId: number;
  };
  const fx: Record<number, Fixtures> = {};
  let votingConfigId: number;
  let ballotId: number;

  const post = (tenantId: number, path: string, body: object, cookie?: string) =>
    request(app)
      .post(`/api${path}`)
      .set(asTenant(tenantId))
      .set("Cookie", cookie ?? (tenantId === T1 ? cookie1 : cookie2))
      .send(body);
  const patch = (tenantId: number, path: string, body: object) =>
    request(app)
      .patch(`/api${path}`)
      .set(asTenant(tenantId))
      .set("Cookie", tenantId === T1 ? cookie1 : cookie2)
      .send(body);
  const get = (tenantId: number, path: string) =>
    request(app).get(`/api${path}`).set(asTenant(tenantId));

  async function seedFixtures(tenantId: number, label: string): Promise<Fixtures> {
    const [award] = await db
      .insert(awardsTable)
      .values({
        tenantId,
        key: `u8-award-${label}-${STAMP}`,
        title: `U8 Medal ${label}`,
        published: true,
      })
      .returning();
    const [winner] = await db
      .insert(awardWinnersTable)
      .values({ tenantId, awardId: award.id, season: 2020, name: `U8 Winner ${label}` })
      .returning();
    const [lm] = await db
      .insert(lifeMembersTable)
      .values({ tenantId, name: `U8 Life ${label}`, inductionYear: 2001 })
      .returning();
    const [board] = await db
      .insert(teamOfDecadeBoardsTable)
      .values({ tenantId, key: `u8-tod-${label}-${STAMP}`, title: "U8 ToD", published: true })
      .returning();
    const [member] = await db
      .insert(teamOfDecadeMembersTable)
      .values({ tenantId, boardId: board.id, name: `U8 ToD member ${label}` })
      .returning();
    const [cap] = await db
      .insert(capRegisterTable)
      .values({
        tenantId,
        capNumber: 80_000 + (STAMP % 1000),
        category: "male",
        name: `U8 Cap ${label}`,
      })
      .returning();
    const [role] = await db
      .insert(clubRolesTable)
      .values({
        tenantId,
        season: 1999,
        role: `U8 Role ${label} ${STAMP}`,
        name: `U8 Role Holder ${label}`,
        published: true,
      })
      .returning();
    const honourBoardKey = `u8-hb-${label}-${STAMP}`;
    const [prem] = await db
      .insert(premiershipsTable)
      .values({ tenantId, year: 1998, grade: "A Grade", competition: `U8 Comp ${label}` })
      .returning();
    return {
      awardId: award.id,
      awardKey: award.key,
      winnerId: winner.id,
      lifeMemberId: lm.id,
      todBoardId: board.id,
      todMemberId: member.id,
      capId: cap.id,
      clubRoleId: role.id,
      honourBoardKey,
      premiershipId: prem.id,
    };
  }

  async function seedCentral(): Promise<void> {
    for (const [id, name] of [
      [CLUB_T2, "U8 Crosswalk CC"],
      [OPP, "U8 Opp CC"],
    ] as const) {
      await db.execute(sql`
        insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
        values (${id}, ${name}, ${`U${id}`}, '#123456', null, null, '2002/03', null)
      `);
    }
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${G2A}, ${CENTRAL_NAME}, 0, ${CLUB_T2}, '2024/25', '2024/25', 1)
    `);
    await db.execute(sql`
      insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
        status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
      values (${MATCH_T2}, ${`u8-test-${MATCH_T2}`}, '2024/25', 'A Grade', 'grade-a', 'One Day', '1', '2024-11-02',
        'U8 Oval', 'Completed', ${CLUB_T2}, ${OPP}, 'U8 Crosswalk CC', 'U8 Opp CC', '5/150', '10/120', ${CLUB_T2}, ${CLUB_T2},
        'U8 Crosswalk CC won')
    `);
    await db.execute(sql`
      insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
        runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
      values (${LINE_BASE}, ${MATCH_T2}, 1, ${CLUB_T2}, 'x', 1, ${G2A}, 'x', 42, 42, 0, 0, 100, 'b Bowler', 'bowled', null)
    `);
    await db.execute(sql`
      insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
      values (${LINE_BASE + 1}, ${MATCH_T2}, ${CLUB_T2}, 'x', ${G2A}, 'x')
    `);
  }

  async function cleanCentral(): Promise<void> {
    await db.execute(
      sql`delete from central.match_batting where id >= ${LINE_BASE} and id < ${LINE_BASE + 100}`,
    );
    await db.execute(
      sql`delete from central.match_rosters where id >= ${LINE_BASE} and id < ${LINE_BASE + 100}`,
    );
    await db.execute(sql`delete from central.matches where match_id = ${MATCH_T2}`);
    await db.execute(sql`delete from central.players where participant_id = ${G2A}`);
    await db.execute(sql`delete from central.clubs where club_id in (${CLUB_T2}, ${OPP})`);
  }

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-for-curated-player-links";

    const [t1Row] = await db
      .select({ readsFromCentral: tenantsTable.readsFromCentral })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, T1));
    // These cases pin Halls Head's pre-cut-over rules (native ids accepted).
    expect(t1Row?.readsFromCentral ?? false).toBe(false);

    for (const k of ["A", "B", "D", "E"] as const) {
      const [p] = await db
        .insert(playersTable)
        .values({ surname: `Uspace${STAMP}`, givenName: `Native${k}` })
        .returning();
      native[k] = p.id;
    }
    // Halls Head's player A has a real career in the native stats.
    await db.insert(playerGradeStatsTable).values({
      playerId: native.A,
      surname: `Uspace${STAMP}`,
      givenName: "NativeA",
      grade: "A Grade",
      games: 77,
      runs: 1234,
    });

    const [{ maxId }] = (
      await db.execute(sql`select coalesce(max(id), 0)::int as "maxId" from players`)
    ).rows as { maxId: number }[];
    freeT1 = maxId + 1000;
    freeT2 = maxId + 2000;
    outside = maxId + 3000;
    expect(outside).toBeLessThan(90_000);

    const [tenant2] = await db
      .insert(tenantsTable)
      .values({
        slug: `u8-space-t2-${STAMP}`,
        centralClubId: CLUB_T2,
        readsFromCentral: true,
        name: "U8 Space Tenant 2",
        plan: "pilot",
      })
      .returning();
    t2 = tenant2.id;
    invalidateTenantConfigCache();

    // Tenant 2's crosswalk: G2A/G2D/G2E land on ints that are ALSO native Halls
    // Head ids (the overlap this unit closes); G2F on an id no native row has.
    await db.insert(playerIdMapTable).values([
      { tenantId: t2, participantId: G2A, playerId: native.A },
      { tenantId: t2, participantId: G2D, playerId: native.D },
      { tenantId: t2, participantId: G2E, playerId: native.E },
      { tenantId: t2, participantId: G2F, playerId: freeT2 },
      // Tenant 1: an id that exists only in its crosswalk (a pre-digital player).
      { tenantId: T1, participantId: G1F, playerId: freeT1 },
    ]);

    const [a1] = await db
      .insert(adminsTable)
      .values({
        tenantId: T1,
        username: `u8_admin_t1_${STAMP}`,
        displayName: "U8 Admin T1",
        passwordHash: "x",
      })
      .returning();
    admin1Id = a1.id;
    const [a2] = await db
      .insert(adminsTable)
      .values({
        tenantId: t2,
        username: `u8_admin_t2_${STAMP}`,
        displayName: "U8 Admin T2",
        passwordHash: "x",
      })
      .returning();
    admin2Id = a2.id;
    cookie1 = `${SESSION_COOKIE}=${encodeSession({ adminId: admin1Id, issuedAt: Date.now() })}`;
    cookie2 = `${SESSION_COOKIE}=${encodeSession({ adminId: admin2Id, issuedAt: Date.now() })}`;

    fx[T1] = await seedFixtures(T1, "t1");
    fx[t2] = await seedFixtures(t2, "t2");

    // A tenant-2 voted award with one ballot (picks inside tenant 2's space).
    const [cfg] = await db
      .insert(awardVotingConfigTable)
      .values({ awardId: fx[t2]!.awardId, season: 2024, grades: ["A Grade"] })
      .returning();
    votingConfigId = cfg.id;
    const [captain] = await db
      .insert(captainsTable)
      .values({
        tenantId: t2,
        username: `u8_captain_t2_${STAMP}`,
        displayName: "U8 Captain",
        passwordHash: "x",
      })
      .returning();
    captain2Id = captain.id;
    await db
      .insert(captainGradePermissionsTable)
      .values({ captainId: captain2Id, grade: "A Grade" });
    captainCookie2 = `${CAPTAIN_SESSION_COOKIE}=${encodeCaptainSession({
      captainId: captain2Id,
      issuedAt: Date.now(),
    })}`;
    const [ballot] = await db
      .insert(awardBallotsTable)
      .values({
        configId: votingConfigId,
        captainId: captain2Id,
        grade: "A Grade",
        round: 1,
        pick1PlayerId: native.A,
        pick2PlayerId: native.D,
        pick3PlayerId: native.E,
      })
      .returning();
    ballotId = ballot.id;

    if (isLocalDb) {
      await cleanCentral();
      await seedCentral();
    }
  });

  afterAll(async () => {
    const tenants = [T1, t2];
    const ids = Object.values(native);
    await db.delete(awardBallotsTable).where(eq(awardBallotsTable.configId, votingConfigId));
    await db
      .delete(captainGradePermissionsTable)
      .where(eq(captainGradePermissionsTable.captainId, captain2Id));
    await db.delete(captainsTable).where(eq(captainsTable.id, captain2Id));
    for (const tenantId of tenants) {
      const f = fx[tenantId];
      if (!f) continue;
      await db.delete(awardsTable).where(eq(awardsTable.id, f.awardId)); // cascades winners + config
      await db.delete(lifeMembersTable).where(eq(lifeMembersTable.id, f.lifeMemberId));
      await db.delete(teamOfDecadeBoardsTable).where(eq(teamOfDecadeBoardsTable.id, f.todBoardId));
      await db.delete(capRegisterTable).where(eq(capRegisterTable.id, f.capId));
      await db.delete(clubRolesTable).where(eq(clubRolesTable.id, f.clubRoleId));
      await db.delete(premiershipsTable).where(eq(premiershipsTable.id, f.premiershipId));
    }
    // Everything else a test created is tagged with STAMP or linked to our ids.
    await db
      .delete(awardsTable)
      .where(
        and(inArray(awardsTable.tenantId, tenants), sql`${awardsTable.key} like ${`%${STAMP}%`}`),
      );
    await db.delete(honourBoardsTable).where(sql`${honourBoardsTable.key} like ${`%${STAMP}%`}`);
    await db
      .delete(honourBoardOverridesTable)
      .where(sql`${honourBoardOverridesTable.boardKey} like ${`%${STAMP}%`}`);
    await db
      .delete(teamOfDecadeBoardsTable)
      .where(sql`${teamOfDecadeBoardsTable.key} like ${`%${STAMP}%`}`);
    await db.delete(clubRolesTable).where(sql`${clubRolesTable.role} like ${`%${STAMP}%`}`);
    await db
      .delete(lifeMembersTable)
      .where(
        and(inArray(lifeMembersTable.tenantId, tenants), sql`${lifeMembersTable.name} like 'U8 %'`),
      );
    await db
      .delete(capRegisterTable)
      .where(
        and(inArray(capRegisterTable.tenantId, tenants), sql`${capRegisterTable.name} like 'U8 %'`),
      );
    await db
      .delete(premiershipsTable)
      .where(
        and(
          inArray(premiershipsTable.tenantId, tenants),
          sql`${premiershipsTable.competition} like 'U8 %'`,
        ),
      );
    await db.delete(playerImagesTable).where(inArray(playerImagesTable.playerId, ids));
    await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, t2));
    await db
      .delete(playerIdMapTable)
      .where(and(eq(playerIdMapTable.tenantId, T1), eq(playerIdMapTable.participantId, G1F)));
    await db.delete(playerGradeStatsTable).where(inArray(playerGradeStatsTable.playerId, ids));
    await db.delete(playersTable).where(inArray(playersTable.id, ids));
    await db.delete(adminsTable).where(inArray(adminsTable.id, [admin1Id, admin2Id]));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, t2));
    invalidateTenantConfigCache();
    if (isLocalDb) await cleanCentral();
  });

  // ── R16: a curated link resolves to the club's OWN player ──────────────────

  describe("R16: tenant 2's id 5 is tenant 2's player 5, never Halls Head's", () => {
    it("accepts a tenant-2 award winner on a crosswalk id that has no native player", async () => {
      const res = await post(t2, `/awards/${fx[t2]!.awardId}/winners`, {
        season: 2021,
        playerId: freeT2,
        name: "Crosswalk Only",
      });
      expect(res.status).toBe(201);
      expect(res.body.playerId).toBe(freeT2);
    });

    it("a tenant-2 award winner on an id Halls Head also uses never shows on Halls Head's player page", async () => {
      const res = await post(t2, `/awards/${fx[t2]!.awardId}/winners`, {
        season: 2022,
        playerId: native.A,
        name: CENTRAL_NAME,
      });
      expect(res.status).toBe(201);

      const hh = await get(T1, `/players/${native.A}`).expect(200);
      expect(hh.body.givenName).toBe("NativeA");
      const keys = (hh.body.awards as { key: string }[]).map((a) => a.key);
      expect(keys).not.toContain(fx[t2]!.awardKey);
    });

    it.skipIf(!isLocalDb)(
      "and it resolves to tenant 2's own (central) player on tenant 2's player page",
      async () => {
        const res = await get(t2, `/players/${native.A}`).expect(200);
        expect(`${res.body.givenName} ${res.body.surname}`).toBe(CENTRAL_NAME);
        expect(res.body.totalRuns).toBe(42);
        const keys = (res.body.awards as { key: string }[]).map((a) => a.key);
        expect(keys).toContain(fx[t2]!.awardKey);
      },
    );

    it("a tenant-2 life member on an overlapping id never carries Halls Head's career stats", async () => {
      await patch(t2, `/life-members/${fx[t2]!.lifeMemberId}`, { playerId: native.A }).expect(200);
      const res = await get(t2, "/life-members").expect(200);
      const row = (res.body as { id: number; playerId: number; stats: unknown }[]).find(
        (r) => r.id === fx[t2]!.lifeMemberId,
      );
      expect(row?.playerId).toBe(native.A);
      expect(row?.stats ?? null).toBeNull();

      // Halls Head's own life member on the same id still gets its native career.
      await patch(T1, `/life-members/${fx[T1]!.lifeMemberId}`, { playerId: native.A }).expect(200);
      const hh = await get(T1, "/life-members").expect(200);
      const hhRow = (hh.body as { id: number; stats: { runs: number } | null }[]).find(
        (r) => r.id === fx[T1]!.lifeMemberId,
      );
      expect(hhRow?.stats?.runs).toBe(1234);
    });
  });

  // ── Every write route rejects an id outside the tenant's space ────────────

  type WriteCase = {
    route: string;
    send: (tenantId: number, playerId: number) => PromiseLike<{ status: number }>;
  };
  const writeCases: WriteCase[] = [
    {
      route: "POST /awards/:id/winners",
      send: (t, id) =>
        post(t, `/awards/${fx[t]!.awardId}/winners`, { season: 2019, playerId: id, name: "x" }),
    },
    {
      route: "PATCH /award-winners/:id",
      send: (t, id) => patch(t, `/award-winners/${fx[t]!.winnerId}`, { playerId: id }),
    },
    {
      route: "POST /life-members",
      send: (t, id) =>
        post(t, "/life-members", { name: "U8 Life x", inductionYear: 2002, playerId: id }),
    },
    {
      route: "PATCH /life-members/:id",
      send: (t, id) => patch(t, `/life-members/${fx[t]!.lifeMemberId}`, { playerId: id }),
    },
    {
      route: "POST /team-of-decade-boards/:id/members",
      send: (t, id) =>
        post(t, `/team-of-decade-boards/${fx[t]!.todBoardId}/members`, {
          name: "U8 ToD x",
          playerId: id,
        }),
    },
    {
      route: "PATCH /team-of-decade-members/:id",
      send: (t, id) => patch(t, `/team-of-decade-members/${fx[t]!.todMemberId}`, { playerId: id }),
    },
    {
      route: "POST /caps",
      send: (t, id) =>
        post(t, "/caps", {
          capNumber: 81_000 + (STAMP % 1000) + id,
          name: "U8 Cap x",
          playerId: id,
        }),
    },
    {
      route: "PATCH /caps/:id",
      send: (t, id) => patch(t, `/caps/${fx[t]!.capId}`, { playerId: id }),
    },
    {
      route: "POST /club-roles",
      send: (t, id) =>
        post(t, "/club-roles", {
          season: 1990,
          role: `U8 New Role ${id} ${STAMP}`,
          name: "x",
          playerId: id,
        }),
    },
    {
      route: "PATCH /club-roles/:id",
      send: (t, id) => patch(t, `/club-roles/${fx[t]!.clubRoleId}`, { playerId: id }),
    },
    {
      route: "POST /honour-boards/:key/overrides",
      send: (t, id) =>
        post(t, `/honour-boards/${fx[t]!.honourBoardKey}/overrides`, {
          playerId: id,
          pinned: true,
        }),
    },
    {
      route: "POST /premierships",
      send: (t, id) =>
        post(t, "/premierships", {
          year: 1997,
          grade: "A Grade",
          competition: "U8 Comp x",
          players: [{ playerId: id, name: "x", isCaptain: false }],
        }),
    },
    {
      route: "PATCH /premierships/:id",
      send: (t, id) =>
        patch(t, `/premierships/${fx[t]!.premiershipId}`, {
          players: [{ playerId: id, name: "x", isCaptain: false }],
        }),
    },
  ];

  describe("an id outside the tenant's space is rejected on every write route", () => {
    for (const c of writeCases) {
      it(`${c.route}: tenant 2 cannot link a Halls Head native id it has no crosswalk row for`, async () => {
        const res = await c.send(t2, native.B);
        expect(res.status).toBe(422);
      });
      it(`${c.route}: tenant 1 cannot link an id that is neither native nor in its crosswalk`, async () => {
        const res = await c.send(T1, outside);
        expect(res.status).toBe(422);
      });
    }

    it("PATCH /voting-configs/:id/ballots/:ballotId rejects picks outside the tenant's space", async () => {
      const res = await patch(t2, `/voting-configs/${votingConfigId}/ballots/${ballotId}`, {
        pick1PlayerId: native.B,
        pick2PlayerId: native.D,
        pick3PlayerId: native.E,
      });
      expect(res.status).toBe(422);
      const [row] = await db
        .select()
        .from(awardBallotsTable)
        .where(eq(awardBallotsTable.id, ballotId));
      expect(row?.pick1PlayerId).toBe(native.A);
    });

    it("POST /captain/ballots rejects picks outside the captain's tenant space", async () => {
      const res = await request(app)
        .post("/api/captain/ballots")
        .set(asTenant(t2))
        .set("Cookie", captainCookie2)
        .send({
          configId: votingConfigId,
          grade: "A Grade",
          round: 2,
          pick1PlayerId: native.B,
          pick2PlayerId: native.D,
          pick3PlayerId: native.E,
        });
      expect(res.status).toBe(422);
    });

    it("nothing was written by the rejected requests", async () => {
      const bad = [native.B, outside];
      const leaked = await Promise.all([
        db.select().from(awardWinnersTable).where(inArray(awardWinnersTable.playerId, bad)),
        db.select().from(lifeMembersTable).where(inArray(lifeMembersTable.playerId, bad)),
        db
          .select()
          .from(teamOfDecadeMembersTable)
          .where(inArray(teamOfDecadeMembersTable.playerId, bad)),
        db.select().from(capRegisterTable).where(inArray(capRegisterTable.playerId, bad)),
        db.select().from(clubRolesTable).where(inArray(clubRolesTable.playerId, bad)),
        db
          .select()
          .from(honourBoardOverridesTable)
          .where(inArray(honourBoardOverridesTable.playerId, bad)),
        db
          .select()
          .from(premiershipPlayersTable)
          .where(inArray(premiershipPlayersTable.playerId, bad)),
      ]);
      expect(leaked.flat()).toEqual([]);
    });
  });

  // ── Tenant 1 accepts an id that exists only in its crosswalk ──────────────

  describe("tenant 1 accepts an id that exists only in its crosswalk", () => {
    for (const c of writeCases) {
      it(`${c.route}`, async () => {
        const res = await c.send(T1, freeT1);
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
      });
    }
  });

  // ── R17: curated keys are unique per club ─────────────────────────────────

  describe("R17: two clubs can use the same curated key", () => {
    const KEY = `u8-shared-${STAMP}`;

    it("honour boards", async () => {
      for (const tenantId of [T1, t2]) {
        const res = await post(tenantId, "/honour-boards", {
          key: KEY,
          label: "Shared",
          title: `Shared board ${tenantId}`,
        });
        expect(res.status).toBe(201);
      }
    });

    it("awards", async () => {
      for (const tenantId of [T1, t2]) {
        const res = await post(tenantId, "/awards", {
          key: KEY,
          title: `Shared award ${tenantId}`,
        });
        expect(res.status).toBe(201);
      }
    });

    it("Team of the Decade boards", async () => {
      for (const tenantId of [T1, t2]) {
        const res = await post(tenantId, "/team-of-decade-boards", {
          key: KEY,
          title: `Shared ToD ${tenantId}`,
        });
        expect(res.status).toBe(201);
      }
    });

    it("club roles (same season, role and grade)", async () => {
      for (const tenantId of [T1, t2]) {
        const res = await post(tenantId, "/club-roles", {
          season: 1995,
          role: `U8 Shared Role ${STAMP}`,
          name: `Holder ${tenantId}`,
        });
        expect(res.status).toBe(201);
      }
    });

    it("honour-board overrides: tenant 2's upsert never rewrites tenant 1's override", async () => {
      await post(T1, `/honour-boards/${KEY}/overrides`, {
        playerId: native.A,
        note: "tenant one",
      }).expect(200);
      await post(t2, `/honour-boards/${KEY}/overrides`, {
        playerId: native.A,
        note: "tenant two",
      }).expect(200);

      const t1Rows = await get(T1, `/honour-boards/${KEY}/overrides`).expect(200);
      expect(t1Rows.body).toEqual([
        expect.objectContaining({ playerId: native.A, note: "tenant one" }),
      ]);
      const t2Rows = await get(t2, `/honour-boards/${KEY}/overrides`).expect(200);
      expect(t2Rows.body).toEqual([
        expect.objectContaining({ playerId: native.A, note: "tenant two" }),
      ]);
    });
  });

  // ── Deleting / merging a native player keeps tenant 1's old FK behaviour ──

  describe("native player delete and merge act on Halls Head's links only", () => {
    it("delete: tenant 1's links are cleared as the foreign keys did; tenant 2's same int is untouched", async () => {
      const [t1Life] = await db
        .insert(lifeMembersTable)
        .values({ tenantId: T1, name: "U8 Life del", inductionYear: 2003, playerId: native.D })
        .returning();
      const [t2Life] = await db
        .insert(lifeMembersTable)
        .values({ tenantId: t2, name: "U8 Life del", inductionYear: 2003, playerId: native.D })
        .returning();
      const [t1Win] = await db
        .insert(awardWinnersTable)
        .values({
          tenantId: T1,
          awardId: fx[T1]!.awardId,
          season: 2010,
          playerId: native.D,
          name: "d",
        })
        .returning();
      const [t2Win] = await db
        .insert(awardWinnersTable)
        .values({
          tenantId: t2,
          awardId: fx[t2]!.awardId,
          season: 2010,
          playerId: native.D,
          name: "d",
        })
        .returning();
      const delKey = `u8-del-${STAMP}`;
      await db.insert(honourBoardOverridesTable).values([
        { tenantId: T1, boardKey: delKey, playerId: native.D, note: "t1" },
        { tenantId: t2, boardKey: `${delKey}-t2`, playerId: native.D, note: "t2" },
      ]);
      await db
        .insert(playerImagesTable)
        .values({ tenantId: T1, playerId: native.D, imageUrl: "https://example.test/d.jpg" });

      await request(app)
        .delete(`/api/players/${native.D}`)
        .set(asTenant(T1))
        .set("Cookie", cookie1)
        .expect(204);

      const life = await db
        .select()
        .from(lifeMembersTable)
        .where(inArray(lifeMembersTable.id, [t1Life.id, t2Life.id]));
      expect(life.find((r) => r.id === t1Life.id)?.playerId).toBeNull();
      expect(life.find((r) => r.id === t2Life.id)?.playerId).toBe(native.D);

      const wins = await db
        .select()
        .from(awardWinnersTable)
        .where(inArray(awardWinnersTable.id, [t1Win.id, t2Win.id]));
      expect(wins.find((r) => r.id === t1Win.id)?.playerId).toBeNull();
      expect(wins.find((r) => r.id === t2Win.id)?.playerId).toBe(native.D);

      const overrides = await db
        .select()
        .from(honourBoardOverridesTable)
        .where(eq(honourBoardOverridesTable.playerId, native.D));
      expect(overrides.map((o) => o.tenantId)).toEqual([t2]);

      const images = await db
        .select()
        .from(playerImagesTable)
        .where(eq(playerImagesTable.playerId, native.D));
      expect(images).toEqual([]);

      // Tenant 2's ballot pick on the same int is not a Halls Head link either.
      const [ballot] = await db
        .select()
        .from(awardBallotsTable)
        .where(eq(awardBallotsTable.id, ballotId));
      expect(ballot?.pick2PlayerId).toBe(native.D);
    });

    it("merge: tenant 1's links follow the keeper; tenant 2's same int is untouched", async () => {
      const [t1Life] = await db
        .insert(lifeMembersTable)
        .values({ tenantId: T1, name: "U8 Life merge", inductionYear: 2004, playerId: native.E })
        .returning();
      const [t2Life] = await db
        .insert(lifeMembersTable)
        .values({ tenantId: t2, name: "U8 Life merge", inductionYear: 2004, playerId: native.E })
        .returning();

      await request(app)
        .post(`/api/players/${native.E}/merge`)
        .set(asTenant(T1))
        .set("Cookie", cookie1)
        .send({ keeperId: native.A })
        .expect(200);

      const life = await db
        .select()
        .from(lifeMembersTable)
        .where(inArray(lifeMembersTable.id, [t1Life.id, t2Life.id]));
      expect(life.find((r) => r.id === t1Life.id)?.playerId).toBe(native.A);
      expect(life.find((r) => r.id === t2Life.id)?.playerId).toBe(native.E);
    });
  });

  // ── No Halls Head curated row changes value (snapshot) ────────────────────

  describe("every Halls Head curated row still resolves to the same player", () => {
    const SNAP_KEY = `u8-snap-${STAMP}`;

    beforeAll(async () => {
      const f = fx[T1]!;
      await db
        .update(awardWinnersTable)
        .set({ playerId: native.A, published: true })
        .where(eq(awardWinnersTable.id, f.winnerId));
      await db
        .update(teamOfDecadeMembersTable)
        .set({ playerId: native.A })
        .where(eq(teamOfDecadeMembersTable.id, f.todMemberId));
      await db
        .update(capRegisterTable)
        .set({ playerId: native.A })
        .where(eq(capRegisterTable.id, f.capId));
      await db
        .update(clubRolesTable)
        .set({ playerId: native.A })
        .where(eq(clubRolesTable.id, f.clubRoleId));
      await db
        .update(lifeMembersTable)
        .set({ playerId: native.A })
        .where(eq(lifeMembersTable.id, f.lifeMemberId));
      await db
        .insert(honourBoardOverridesTable)
        .values({ tenantId: T1, boardKey: SNAP_KEY, playerId: native.A, note: "snap" });
      await db.insert(premiershipPlayersTable).values({
        tenantId: T1,
        premiershipId: f.premiershipId,
        playerId: native.A,
        name: "NativeA",
        isCaptain: true,
      });
    });

    /** Tenant 1's curated read endpoints, narrowed to this suite's rows. */
    async function snapshot() {
      const f = fx[T1]!;
      const [awards, life, tod, caps, roles, overrides, prems, player] = await Promise.all([
        get(T1, "/awards").expect(200),
        get(T1, "/life-members").expect(200),
        get(T1, "/team-of-decade-boards").expect(200),
        get(T1, "/caps").expect(200),
        get(T1, "/club-roles").expect(200),
        get(T1, `/honour-boards/${SNAP_KEY}/overrides`).expect(200),
        get(T1, "/premierships").expect(200),
        get(T1, `/players/${native.A}`).expect(200),
      ]);
      type Row = { id: number; playerId?: number | null };
      return {
        award: (awards.body as { id: number; winners: Row[] }[])
          .find((a) => a.id === f.awardId)
          ?.winners.find((w) => w.id === f.winnerId),
        life: (life.body as Row[]).find((r) => r.id === f.lifeMemberId),
        tod: (tod.body as { id: number; members: Row[] }[])
          .find((b) => b.id === f.todBoardId)
          ?.members.find((m) => m.id === f.todMemberId),
        cap: (caps.body as Row[]).find((r) => r.id === f.capId),
        role: (roles.body as Row[]).find((r) => r.id === f.clubRoleId),
        overrides: overrides.body as Row[],
        prem: (prems.body as { id: number; players: Row[] }[]).find(
          (p) => p.id === f.premiershipId,
        ),
        player: {
          id: player.body.id,
          givenName: player.body.givenName,
          awards: player.body.awards,
          premierships: player.body.premierships,
        },
      };
    }

    it("links every curated table to the native player, and re-applying migration 0020 changes nothing", async () => {
      const before = await snapshot();
      expect(before.award?.playerId).toBe(native.A);
      expect(before.life?.playerId).toBe(native.A);
      expect(before.tod?.playerId).toBe(native.A);
      expect(before.cap?.playerId).toBe(native.A);
      expect(before.role?.playerId).toBe(native.A);
      expect(before.overrides.map((o) => o.playerId)).toEqual([native.A]);
      // (The team list may also hold the crosswalk-only id an earlier case added.)
      expect(before.prem?.players.filter((p) => p.playerId === native.A)).toHaveLength(1);
      expect(before.player.givenName).toBe("NativeA");
      expect(before.player.awards).toEqual(
        expect.arrayContaining([expect.objectContaining({ key: fx[T1]!.awardKey })]),
      );
      expect(before.player.premierships).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: fx[T1]!.premiershipId })]),
      );

      // The migration is idempotent (prod was push-built): applying it again
      // over a database that already has it must not move a single link.
      const dir = join(__dirname, "..", "..", "..", "..", "lib", "db", "migrations");
      const file = readdirSync(dir).find((f) => f.startsWith("0020_"));
      expect(file, "migration 0020 exists").toBeDefined();
      const statements = readFileSync(join(dir, file!), "utf8")
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) await db.execute(sql.raw(stmt));

      expect(await snapshot()).toEqual(before);
    });
  });
});
