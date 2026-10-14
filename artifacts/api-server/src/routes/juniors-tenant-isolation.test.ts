import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  tenantsTable,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchRostersTable,
  juniorParticipantsTable,
  juniorPremiershipsTable,
  juniorOfficeBearersTable,
} from "@workspace/db";
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
