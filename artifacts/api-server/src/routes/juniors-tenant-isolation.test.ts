import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  tenantsTable,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorMatchRostersTable,
  juniorParticipantsTable,
  juniorParticipantMergesTable,
  juniorPremiershipsTable,
  juniorPremiershipPlayersTable,
  juniorOfficeBearersTable,
  juniorShirtNumbersTable,
  juniorStatCorrectionsTable,
  shirtNumberSettingsTable,
  playersTable,
  importsTable,
  matchesTable,
  matchPlayerLinesTable,
} from "@workspace/db";
import { seasonStartYearFor } from "@workspace/db/seasons";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Junior data is scoped by tenant_id, not by whether a club reads its senior
 * stats from central. A club that reads central still sees its own juniors
 * (Halls Head lost its juniors when it moved to central reads), and a club
 * never sees, or edits, another club's juniors.
 *
 * Real-DB integration test (needs DATABASE_URL; central not required).
 */

const STAMP = Date.now();
const MATCH_ID = 900_000_000 + (STAMP % 1_000_000);
const PID = `test-jti-${STAMP}`;
const PREM_ID = MATCH_ID;
const SEASON = "2091/92";

describe("juniors tenant isolation", () => {
  let tenantA = 0;
  let tenantB = 0;
  let cookieB = "";
  let bearerId = 0;

  const asA = (r: request.Test) => r.set("x-tenant-id", String(tenantA));
  const asB = (r: request.Test) => r.set("x-tenant-id", String(tenantB)).set("Cookie", cookieB);

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-juniors-isolation";
    const make = async (key: string, clubId: number) => {
      const [t] = await db
        .insert(tenantsTable)
        .values({
          slug: `jti-${key}-${STAMP}`,
          centralClubId: clubId,
          readsFromCentral: true,
          name: `JTI ${key}`,
          plan: "pilot",
        })
        .returning();
      return t.id;
    };
    tenantA = await make("a", 97_000 + (STAMP % 1000));
    tenantB = await make("b", 98_000 + (STAMP % 1000));

    const [adminB] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantB,
        username: `test_admin_jti_b_${STAMP}`,
        displayName: "B",
        passwordHash: "x",
      })
      .returning();
    cookieB = `${SESSION_COOKIE}=${encodeSession({ adminId: adminB.id, issuedAt: Date.now() })}`;

    await db.insert(juniorParticipantsTable).values({
      participantId: PID,
      tenantId: tenantA,
      displayName: "Jti Junior",
    });
    await db.insert(juniorMatchesTable).values({
      id: MATCH_ID,
      tenantId: tenantA,
      season: SEASON,
      seasonStartYear: 2091,
      ageGroup: "Year 7/8",
      team1: "JTI A",
      team2: "Opponents",
      opponentName: "Opponents",
    });
    await db.insert(juniorMatchBattingTable).values({
      id: MATCH_ID,
      matchId: MATCH_ID,
      innings: 1,
      participantId: PID,
      playerName: "Jti Junior",
      isHallsHead: true,
      runs: 42,
      dismissal: "bowled",
    });
    await db.insert(juniorMatchRostersTable).values({
      id: MATCH_ID,
      matchId: MATCH_ID,
      participantId: PID,
      playerName: "Jti Junior",
      isHallsHead: true,
    });
    await db.insert(juniorPremiershipsTable).values({
      id: PREM_ID,
      tenantId: tenantA,
      season: SEASON,
      ageGroup: "Year 7/8",
    });
    const [bearer] = await db
      .insert(juniorOfficeBearersTable)
      .values({
        tenantId: tenantA,
        season: 2091,
        role: "President",
        name: "Jti P",
        published: true,
      })
      .returning();
    bearerId = bearer.id;
  });

  afterAll(async () => {
    await db.delete(juniorOfficeBearersTable).where(eq(juniorOfficeBearersTable.id, bearerId));
    await db.delete(juniorPremiershipsTable).where(eq(juniorPremiershipsTable.id, PREM_ID));
    await db.delete(juniorMatchesTable).where(eq(juniorMatchesTable.id, MATCH_ID));
    await db.delete(juniorParticipantsTable).where(eq(juniorParticipantsTable.participantId, PID));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantB));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantA, tenantB]));
  });

  it("a club that reads central still sees its own juniors", async () => {
    const matches = await asA(request(app).get(`/api/juniors/matches?season=${SEASON}`)).expect(
      200,
    );
    expect(matches.body.map((m: { id: number }) => m.id)).toEqual([MATCH_ID]);

    await asA(request(app).get(`/api/juniors/matches/${MATCH_ID}`)).expect(200);

    const players = await asA(request(app).get("/api/juniors/players")).expect(200);
    expect(players.body.map((p: { participantId: string }) => p.participantId)).toEqual([PID]);
    expect(players.body[0]).toMatchObject({ runs: 42, matches: 1 });

    const player = await asA(request(app).get(`/api/juniors/players/${PID}`)).expect(200);
    expect(player.body.batting.runs).toBe(42);

    const boards = await asA(request(app).get("/api/juniors/leaderboards")).expect(200);
    expect(boards.body.mostRuns.map((r: { participantId: string }) => r.participantId)).toEqual([
      PID,
    ]);

    const overview = await asA(request(app).get("/api/juniors/overview")).expect(200);
    expect(overview.body.totals).toMatchObject({ matches: 1, players: 1, premierships: 1 });
    expect(overview.body.latestSeason).toBe(SEASON);

    const prems = await asA(request(app).get("/api/juniors/premierships")).expect(200);
    expect(prems.body.map((p: { id: number }) => p.id)).toEqual([PREM_ID]);

    const filters = await asA(request(app).get("/api/juniors/filters")).expect(200);
    expect(filters.body.seasons).toEqual([SEASON]);
  });

  it("another club sees none of them", async () => {
    expect((await asB(request(app).get("/api/juniors/matches")).expect(200)).body).toEqual([]);
    await asB(request(app).get(`/api/juniors/matches/${MATCH_ID}`)).expect(404);
    expect((await asB(request(app).get("/api/juniors/players")).expect(200)).body).toEqual([]);
    await asB(request(app).get(`/api/juniors/players/${PID}`)).expect(404);
    const boards = await asB(request(app).get("/api/juniors/leaderboards")).expect(200);
    expect(boards.body).toEqual({
      mostRuns: [],
      mostWickets: [],
      highestScores: [],
      bestBowling: [],
    });
    const overview = await asB(request(app).get("/api/juniors/overview")).expect(200);
    expect(overview.body.totals.matches).toBe(0);
    expect(overview.body.latestSeason).toBeNull();
    expect((await asB(request(app).get("/api/juniors/premierships")).expect(200)).body).toEqual([]);
    expect((await asB(request(app).get("/api/juniors/leaderboard")).expect(200)).body).toEqual([]);
    expect((await asB(request(app).get("/api/juniors/filters")).expect(200)).body).toEqual({
      seasons: [],
      ageGroups: [],
    });
  });

  it("another club's admin can't edit them", async () => {
    await asB(request(app).patch(`/api/juniors/premierships/${PREM_ID}`))
      .send({ mom: "Not yours" })
      .expect(404);
    await asB(request(app).patch(`/api/juniors/office-bearers/${bearerId}`))
      .send({ name: "Not yours" })
      .expect(404);
    await asB(request(app).delete(`/api/juniors/office-bearers/${bearerId}`)).expect(404);
    const [bearer] = await db
      .select()
      .from(juniorOfficeBearersTable)
      .where(eq(juniorOfficeBearersTable.id, bearerId));
    expect(bearer.name).toBe("Jti P");
  });

  it("an office bearer an admin adds belongs to their club", async () => {
    const res = await asB(request(app).post("/api/juniors/office-bearers"))
      .send({ season: 2091, role: "Secretary", name: "Jti S" })
      .expect(201);
    try {
      expect(res.body.tenantId).toBe(tenantB);
    } finally {
      await db.delete(juniorOfficeBearersTable).where(eq(juniorOfficeBearersTable.id, res.body.id));
    }
  });
});

/**
 * A child registered at two clubs (junior PlayHQ sync plan U3; KTD8, R13, R14, AE6).
 * `junior_participants` is keyed (tenant_id, participant_id), so the same PlayHQ GUID
 * is two independent rows. Every public and admin junior route must show and edit
 * each club's own row and stats only — never the other club's figures, names,
 * privacy or merges.
 */
describe("juniors tenant isolation: one participant id at two clubs", () => {
  const SHARED = `test-jti-shared-${STAMP}`;
  /** Private at club C, public at club D. */
  const SHARED_PRIV = `test-jti-sharedpriv-${STAMP}`;
  const KEEP_C = `test-jti-keepc-${STAMP}`;
  const MC = 902_000_000 + (STAMP % 1_000_000);
  const MD = 904_000_000 + (STAMP % 1_000_000);
  const PC = MC;
  const PD = MD;
  const SEASON2 = "2093/94";
  const SHIRT_SEASON = seasonStartYearFor(new Date());
  const SENIOR_LINK = 2_000_000_000 - (STAMP % 1_000_000);

  const t = { c: 0, d: 0 };
  const cookie = { c: "", d: "" };
  const as = (who: "c" | "d", r: request.Test) =>
    r.set("x-tenant-id", String(t[who])).set("Cookie", cookie[who]);

  type Row = { participantId: string | null; [k: string]: unknown };
  const find = (rows: Row[], pid: string) => rows.find((r) => r.participantId === pid);

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-juniors-isolation";
    for (const who of ["c", "d"] as const) {
      const [tenant] = await db
        .insert(tenantsTable)
        .values({
          slug: `jti2-${who}-${STAMP}`,
          centralClubId: (who === "c" ? 95_000 : 96_000) + (STAMP % 1000),
          readsFromCentral: false,
          name: `JTI2 ${who}`,
          plan: "pro",
        })
        .returning();
      t[who] = tenant.id;
      const [admin] = await db
        .insert(adminsTable)
        .values({
          tenantId: tenant.id,
          username: `test_admin_jti2_${who}_${STAMP}`,
          displayName: who,
          passwordHash: "x",
        })
        .returning();
      cookie[who] =
        `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
    }

    await db.insert(juniorParticipantsTable).values([
      {
        tenantId: t.c,
        participantId: SHARED,
        displayName: "Shared AtC",
        seniorPlayerId: SENIOR_LINK,
      },
      { tenantId: t.c, participantId: SHARED_PRIV, displayName: "Hidden AtC", isPrivate: true },
      { tenantId: t.c, participantId: KEEP_C, displayName: "Keeper AtC" },
      { tenantId: t.d, participantId: SHARED, displayName: "Shared AtD" },
      { tenantId: t.d, participantId: SHARED_PRIV, displayName: "Shown AtD" },
    ]);

    const match = (id: number, tenantId: number, team: string) => ({
      id,
      tenantId,
      season: SEASON2,
      seasonStartYear: 2093,
      ageGroup: "Year 9",
      team1: team,
      team2: "Opponents",
      opponentName: "Opponents",
    });
    await db.insert(juniorMatchesTable).values([match(MC, t.c, "JTI C"), match(MD, t.d, "JTI D")]);

    // Club C: SHARED 260 runs / 1 wicket; club D: SHARED 520 runs / 3 wickets. Both
    // cross the 250-run milestone, so social-milestones shows each club its own total.
    const lines = (
      matchId: number,
      name: string,
      runs: number,
      wickets: number,
      privName: string,
    ) => ({
      batting: [
        {
          id: matchId,
          matchId,
          innings: 1,
          isHallsHead: true,
          batOrder: 1,
          participantId: SHARED,
          playerName: name,
          runs,
          dismissal: "bowled",
        },
        {
          id: matchId + 1,
          matchId,
          innings: 1,
          isHallsHead: true,
          batOrder: 2,
          participantId: SHARED_PRIV,
          playerName: privName,
          runs: 5,
          dismissal: "bowled",
        },
      ],
      bowling: [
        {
          id: matchId,
          matchId,
          innings: 2,
          isHallsHead: true,
          participantId: SHARED,
          playerName: name,
          overs: 4,
          runs: 20,
          wickets,
        },
      ],
      rosters: [
        { id: matchId, matchId, isHallsHead: true, participantId: SHARED, playerName: name },
        {
          id: matchId + 1,
          matchId,
          isHallsHead: true,
          participantId: SHARED_PRIV,
          playerName: privName,
        },
      ],
    });
    for (const l of [
      lines(MC, "Shared AtC", 260, 1, "Hidden AtC"),
      lines(MD, "Shared AtD", 520, 3, "Shown AtD"),
    ]) {
      await db.insert(juniorMatchBattingTable).values(l.batting);
      await db.insert(juniorMatchBowlingTable).values(l.bowling);
      await db.insert(juniorMatchRostersTable).values(l.rosters);
    }

    await db.insert(juniorPremiershipsTable).values([
      { id: PC, tenantId: t.c, season: SEASON2, ageGroup: "Year 9" },
      { id: PD, tenantId: t.d, season: SEASON2, ageGroup: "Year 9" },
    ]);
    await db.insert(juniorPremiershipPlayersTable).values([
      { id: PC, premiershipId: PC, participantId: SHARED, playerName: "Shared AtC" },
      { id: PD, premiershipId: PD, participantId: SHARED, playerName: "Shared AtD" },
    ]);
  });

  afterAll(async () => {
    const ids = [t.c, t.d];
    await db.delete(juniorShirtNumbersTable).where(inArray(juniorShirtNumbersTable.tenantId, ids));
    await db
      .delete(shirtNumberSettingsTable)
      .where(inArray(shirtNumberSettingsTable.tenantId, ids));
    await db
      .delete(juniorStatCorrectionsTable)
      .where(inArray(juniorStatCorrectionsTable.tenantId, ids));
    await db
      .delete(juniorParticipantMergesTable)
      .where(inArray(juniorParticipantMergesTable.tenantId, ids));
    await db.delete(juniorPremiershipsTable).where(inArray(juniorPremiershipsTable.id, [PC, PD]));
    await db.delete(juniorMatchesTable).where(inArray(juniorMatchesTable.id, [MC, MD]));
    await db.delete(juniorParticipantsTable).where(inArray(juniorParticipantsTable.tenantId, ids));
    await db.delete(adminsTable).where(inArray(adminsTable.tenantId, ids));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, ids));
  });

  it("every public read shows each club its own record and stats", async () => {
    for (const [who, name, runs, wickets, match, other] of [
      ["c", "Shared AtC", 260, 1, MC, MD],
      ["d", "Shared AtD", 520, 3, MD, MC],
    ] as const) {
      const get = (path: string) => as(who, request(app).get(path)).expect(200);

      const players = (await get("/api/juniors/players")).body as Row[];
      expect(find(players, SHARED)).toMatchObject({ displayName: name, runs, wickets, matches: 1 });
      const filtered = (await get(`/api/juniors/players?season=${SEASON2}`)).body as Row[];
      expect(find(filtered, SHARED)).toMatchObject({ runs, wickets, matches: 1 });

      const profile = (await get(`/api/juniors/players/${SHARED}`)).body;
      expect(profile).toMatchObject({ participantId: SHARED, displayName: name });
      expect(profile.batting.runs).toBe(runs);
      expect(profile.bowling.wickets).toBe(wickets);
      expect(profile.matches.map((m: { matchId: number }) => m.matchId)).toEqual([match]);

      const matches = (await get(`/api/juniors/matches?season=${SEASON2}`)).body;
      expect(matches.map((m: { id: number }) => m.id)).toEqual([match]);
      await as(who, request(app).get(`/api/juniors/matches/${other}`)).expect(404);
      const detail = (await get(`/api/juniors/matches/${match}`)).body;
      expect(JSON.stringify(detail)).toContain(name);

      const boards = (await get("/api/juniors/leaderboards")).body;
      expect(find(boards.mostRuns, SHARED)).toMatchObject({ displayName: name, runs });
      expect(find(boards.mostWickets, SHARED)).toMatchObject({ wickets, matches: 1 });
      expect(boards.highestScores.filter((r: Row) => r.participantId === SHARED)).toEqual([
        expect.objectContaining({ runs, matchId: match }),
      ]);
      expect(boards.bestBowling.filter((r: Row) => r.participantId === SHARED)).toEqual([
        expect.objectContaining({ wickets, matchId: match }),
      ]);

      const board = (await get(`/api/juniors/leaderboard?season=${SEASON2}`)).body as Row[];
      expect(find(board, SHARED)).toMatchObject({ runs, wickets, innings: 1, matches: 1 });

      const top = (await get(`/api/juniors/top-performers?season=${SEASON2}`)).body;
      expect(find(top.topRunScorers, SHARED)).toMatchObject({ runs });
      expect(top.availableAgeGroups).toEqual(["Year 9"]);

      const milestones = (await get("/api/juniors/social-milestones")).body as Row[];
      expect(milestones.filter((m) => m.participantId === SHARED && m.statKey === "runs")).toEqual([
        expect.objectContaining({ value: runs, playerName: name }),
      ]);

      const overview = (await get("/api/juniors/overview")).body;
      expect(overview.totals).toMatchObject({ matches: 1, premierships: 1 });

      const prems = (await get("/api/juniors/premierships")).body;
      expect(prems).toHaveLength(1);
      expect(prems[0].players).toEqual([
        expect.objectContaining({ participantId: SHARED, playerName: name }),
      ]);
    }

    // The senior cross-link is club C's alone.
    const linkedC = (
      await as("c", request(app).get(`/api/juniors/players/by-senior/${SENIOR_LINK}`)).expect(200)
    ).body as Row[];
    expect(linkedC.map((r) => r.participantId)).toEqual([SHARED]);
    const linkedD = (
      await as("d", request(app).get(`/api/juniors/players/by-senior/${SENIOR_LINK}`)).expect(200)
    ).body;
    expect(linkedD).toEqual([]);
  });

  it("privacy is per club: private at C, public at D", async () => {
    const dirC = (await as("c", request(app).get("/api/juniors/players")).expect(200))
      .body as Row[];
    expect(find(dirC, SHARED_PRIV)).toBeUndefined();
    await as("c", request(app).get(`/api/juniors/players/${SHARED_PRIV}`)).expect(404);
    const boardC = (
      await as("c", request(app).get(`/api/juniors/leaderboard?season=${SEASON2}`)).expect(200)
    ).body as Row[];
    expect(find(boardC, SHARED_PRIV)).toBeUndefined();
    const detailC = (await as("c", request(app).get(`/api/juniors/matches/${MC}`)).expect(200))
      .body;
    expect(JSON.stringify(detailC)).not.toContain("Hidden AtC");

    const dirD = (await as("d", request(app).get("/api/juniors/players")).expect(200))
      .body as Row[];
    expect(find(dirD, SHARED_PRIV)).toMatchObject({ displayName: "Shown AtD", runs: 5 });
    const boardD = (
      await as("d", request(app).get(`/api/juniors/leaderboard?season=${SEASON2}`)).expect(200)
    ).body as Row[];
    expect(find(boardD, SHARED_PRIV)).toMatchObject({ runs: 5 });
  });

  it("an admin edit and its revert change only the editing club's participant", async () => {
    await as("d", request(app).patch(`/api/juniors/participants/${SHARED}`))
      .send({ displayName: "Renamed AtD" })
      .expect(200);

    const rowOf = async (tenantId: number) => {
      const [p] = await db
        .select()
        .from(juniorParticipantsTable)
        .where(
          and(
            eq(juniorParticipantsTable.tenantId, tenantId),
            eq(juniorParticipantsTable.participantId, SHARED),
          ),
        );
      return p;
    };
    const lineName = async (id: number) =>
      (await db.select().from(juniorMatchBattingTable).where(eq(juniorMatchBattingTable.id, id)))[0]
        .playerName;
    expect((await rowOf(t.d)).displayName).toBe("Renamed AtD");
    expect((await rowOf(t.c)).displayName).toBe("Shared AtC");
    expect(await lineName(MD)).toBe("Renamed AtD");
    expect(await lineName(MC)).toBe("Shared AtC");

    // Club C can neither see nor revert club D's correction.
    const [correction] = await db
      .select()
      .from(juniorStatCorrectionsTable)
      .where(eq(juniorStatCorrectionsTable.tenantId, t.d));
    const listC = (await as("c", request(app).get("/api/juniors/corrections")).expect(200)).body;
    expect(listC).toEqual([]);
    await as("c", request(app).delete(`/api/juniors/corrections/${correction.id}`)).expect(404);

    await as("d", request(app).delete(`/api/juniors/corrections/${correction.id}`)).expect(204);
    expect((await rowOf(t.d)).displayName).toBe("Shared AtD");
    expect((await rowOf(t.c)).displayName).toBe("Shared AtC");

    // A club's admin cannot edit a participant id only another club has.
    await as("d", request(app).patch(`/api/juniors/participants/${KEEP_C}`))
      .send({ displayName: "Not yours" })
      .expect(404);
  });

  it("the shirt-number register matches only the club's own participants", async () => {
    await as("d", request(app).patch("/api/shirt-numbers/settings"))
      .send({ enabled: true })
      .expect(200);
    const created = await as("d", request(app).post("/api/juniors/shirt-numbers"))
      .send({ season: SHIRT_SEASON, participantId: SHARED, number: "7" })
      .expect(201);
    expect(JSON.stringify(created.body)).toContain("Shared AtD");
    await as("d", request(app).post("/api/juniors/shirt-numbers"))
      .send({ season: SHIRT_SEASON, participantId: KEEP_C, number: "8" })
      .expect(400);

    const regC = (
      await as("c", request(app).get(`/api/juniors/shirt-numbers?season=${SHIRT_SEASON}`)).expect(
        200,
      )
    ).body;
    expect(regC.entries).toEqual([]);
  });

  it("a merge at one club never touches the other club's participant with the same id", async () => {
    await as("c", request(app).post(`/api/juniors/participants/${SHARED}/merge`))
      .send({ keeperParticipantId: KEEP_C })
      .expect(200);

    // Club C: lines moved to the keeper, duplicate row gone, alias resolves.
    const [lineC] = await db
      .select()
      .from(juniorMatchBattingTable)
      .where(eq(juniorMatchBattingTable.id, MC));
    expect(lineC.participantId).toBe(KEEP_C);
    const aliased = (await as("c", request(app).get(`/api/juniors/players/${SHARED}`)).expect(200))
      .body;
    expect(aliased.participantId).toBe(KEEP_C);
    expect(aliased.batting.runs).toBe(260);

    // Club D: untouched — row, name, lines, roster, premiership player, merges.
    const [rowD] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(
        and(
          eq(juniorParticipantsTable.tenantId, t.d),
          eq(juniorParticipantsTable.participantId, SHARED),
        ),
      );
    expect(rowD).toMatchObject({ displayName: "Shared AtD" });
    const [lineD] = await db
      .select()
      .from(juniorMatchBattingTable)
      .where(eq(juniorMatchBattingTable.id, MD));
    expect(lineD).toMatchObject({ participantId: SHARED, playerName: "Shared AtD" });
    const [bowlD] = await db
      .select()
      .from(juniorMatchBowlingTable)
      .where(eq(juniorMatchBowlingTable.id, MD));
    expect(bowlD.participantId).toBe(SHARED);
    const [rosterD] = await db
      .select()
      .from(juniorMatchRostersTable)
      .where(eq(juniorMatchRostersTable.id, MD));
    expect(rosterD.participantId).toBe(SHARED);
    const [premD] = await db
      .select()
      .from(juniorPremiershipPlayersTable)
      .where(eq(juniorPremiershipPlayersTable.id, PD));
    expect(premD.participantId).toBe(SHARED);
    const mergesD = await db
      .select()
      .from(juniorParticipantMergesTable)
      .where(eq(juniorParticipantMergesTable.tenantId, t.d));
    expect(mergesD).toEqual([]);

    const profileD = (await as("d", request(app).get(`/api/juniors/players/${SHARED}`)).expect(200))
      .body;
    expect(profileD).toMatchObject({ participantId: SHARED, displayName: "Shared AtD" });
    expect(profileD.batting.runs).toBe(520);
  });
});

/**
 * AE6, the non-blending half (junior PlayHQ sync plan R14, AE6; testing review P3): a
 * Year 10-11 player linked to a senior player keeps two separate records. Their junior
 * innings never reach senior stats, and their senior innings never reach junior stats;
 * the profile cross-reference is the only junction. Native read path, default tenant.
 */
describe("juniors never blend with senior stats (AE6)", () => {
  const TENANT = 1;
  const PID = `test-jti-ae6-${STAMP}`;
  const JUNIOR_MATCH = 906_000_000 + (STAMP % 1_000_000);
  const SEASON3 = "2095/96";
  const GRADE = `AE6 Senior Grade ${STAMP}`;
  let seniorId = 0;
  let importId = 0;
  let seniorMatchId = 0;
  const asT = (r: request.Test) => r.set("x-tenant-id", String(TENANT));

  beforeAll(async () => {
    const [p] = await db
      .insert(playersTable)
      .values({ surname: `Ae6Senior${STAMP}`, givenName: "Linked" })
      .returning();
    seniorId = p!.id;
    const [imp] = await db
      .insert(importsTable)
      .values({ filename: `ae6-${STAMP}.xlsx`, kind: "match", grade: GRADE, season: 2095 })
      .returning();
    importId = imp!.id;
    const [m] = await db
      .insert(matchesTable)
      .values({ importId, grade: GRADE, season: 2095, round: 1, opponent: "Seniors Opp" })
      .returning();
    seniorMatchId = m!.id;
    await db.insert(matchPlayerLinesTable).values({
      matchId: seniorMatchId,
      playerId: seniorId,
      batted: true,
      battingPos: 4,
      runs: 77,
      balls: 90,
      notOut: false,
    });

    await db.insert(juniorParticipantsTable).values({
      tenantId: TENANT,
      participantId: PID,
      displayName: "Ae6 Junior",
      seniorPlayerId: seniorId,
    });
    await db.insert(juniorMatchesTable).values({
      id: JUNIOR_MATCH,
      tenantId: TENANT,
      season: SEASON3,
      seasonStartYear: 2095,
      ageGroup: "Year 10-11",
      team1: "AE6 Juniors",
      team2: "Opponents",
      opponentName: "Opponents",
    });
    await db.insert(juniorMatchBattingTable).values({
      id: JUNIOR_MATCH,
      matchId: JUNIOR_MATCH,
      innings: 1,
      participantId: PID,
      playerName: "Ae6 Junior",
      isHallsHead: true,
      batOrder: 1,
      runs: 33,
      dismissal: "b:",
    });
  });

  afterAll(async () => {
    await db.delete(juniorMatchesTable).where(eq(juniorMatchesTable.id, JUNIOR_MATCH));
    await db
      .delete(juniorParticipantsTable)
      .where(
        and(
          eq(juniorParticipantsTable.tenantId, TENANT),
          eq(juniorParticipantsTable.participantId, PID),
        ),
      );
    if (seniorMatchId)
      await db
        .delete(matchPlayerLinesTable)
        .where(eq(matchPlayerLinesTable.matchId, seniorMatchId));
    if (seniorMatchId) await db.delete(matchesTable).where(eq(matchesTable.id, seniorMatchId));
    if (importId) await db.delete(importsTable).where(eq(importsTable.id, importId));
    if (seniorId) await db.delete(playersTable).where(eq(playersTable.id, seniorId));
  });

  it("the junior profile and leaderboard carry junior runs only", async () => {
    const profile = (await asT(request(app).get(`/api/juniors/players/${PID}`)).expect(200)).body;
    expect(profile.batting.runs).toBe(33);
    expect(profile.matches.map((m: { matchId: number }) => m.matchId)).toEqual([JUNIOR_MATCH]);
    const board = (
      await asT(request(app).get(`/api/juniors/leaderboard?season=${SEASON3}`)).expect(200)
    ).body as { participantId: string; runs: number }[];
    expect(board.find((r) => r.participantId === PID)).toMatchObject({ runs: 33 });
  });

  it("the senior record carries senior runs only", async () => {
    const matches = (await asT(request(app).get(`/api/players/${seniorId}/matches`)).expect(200))
      .body as { matchId: number; runs: number | null }[];
    expect(matches.map((m) => m.matchId)).toEqual([seniorMatchId]);
    expect(matches.reduce((sum, m) => sum + (m.runs ?? 0), 0)).toBe(77);
    const seasons = (await asT(request(app).get(`/api/players/${seniorId}/seasons`)).expect(200))
      .body as { grade: string; runs: number | null }[];
    expect(seasons.some((r) => /year|junior/i.test(r.grade))).toBe(false);
    expect(JSON.stringify(seasons)).not.toContain(SEASON3);
  });

  it("the profile cross-reference is the only junction", async () => {
    const linked = (
      await asT(request(app).get(`/api/juniors/players/by-senior/${seniorId}`)).expect(200)
    ).body as { participantId: string }[];
    expect(linked.map((r) => r.participantId)).toEqual([PID]);
  });
});
