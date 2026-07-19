import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { eq, inArray, or } from "drizzle-orm";
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
  juniorStatCorrectionsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Junior stat corrections (write-through + journal). Pins: match-metadata and
 * line edits with server-side derived-field recompute, ball-notation
 * validation, re-attribution rules, line create (reserved id band) / delete,
 * roster editing and its knock-on games count, the journal pre-image + revert
 * flow (newest-first enforced via 409), and tenant isolation.
 *
 * Real-DB integration test (needs DATABASE_URL; central not required).
 */

const STAMP = Date.now();
const MATCH_ID = 99_000_001;
const BAT_HH_ID = 99_000_101;
const BAT_OPP_ID = 99_000_102;
const BOWL_HH_ID = 99_000_201;
const ROSTER_ID = 99_000_301;
const P1 = `test-jcorr-a-${STAMP}`;
const P2 = `test-jcorr-b-${STAMP}`;
const OPPO = "Test Oppo CC";
const HH_TEAM = "Halls Head Test JCC";

describe("junior stat corrections", () => {
  let adminCookie: string;
  let adminId: number;
  let tenantBId: number;
  let adminBCookie: string;

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-junior-corrections";

    const [admin] = await db
      .insert(adminsTable)
      .values({
        username: `test_admin_jcorr_${STAMP}`,
        displayName: "Test Admin JCORR",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;

    const [tenantB] = await db
      .insert(tenantsTable)
      .values({
        slug: `jcorr-b-${STAMP}`,
        centralClubId: 8821,
        name: "JCORR Tenant B",
        plan: "pilot",
      })
      .returning();
    tenantBId = tenantB.id;
    const [adminB] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantBId,
        username: `test_admin_jcorr_b_${STAMP}`,
        displayName: "B",
        passwordHash: "x",
      })
      .returning();
    adminBCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: adminB.id, issuedAt: Date.now() })}`;

    await db.insert(juniorParticipantsTable).values([
      { participantId: P1, displayName: "Corr One" },
      { participantId: P2, displayName: "Corr Two" },
    ]);
    await db.insert(juniorMatchesTable).values({
      id: MATCH_ID,
      playhqMatchId: `test-phq-${STAMP}`,
      season: "2098/99",
      seasonStartYear: 2098,
      ageGroup: "Year 9",
      team1: OPPO,
      team1Score: "5/100",
      team2: HH_TEAM,
      team2Score: "3/101",
      opponentName: OPPO,
      hhResult: "Won",
      status: "Played",
    });
    await db.insert(juniorMatchBattingTable).values([
      {
        id: BAT_HH_ID,
        matchId: MATCH_ID,
        innings: 1,
        battingTeam: HH_TEAM,
        isHallsHead: true,
        batOrder: 1,
        participantId: P1,
        playerName: "Corr One",
        runs: 10,
        balls: 20,
      },
      {
        id: BAT_OPP_ID,
        matchId: MATCH_ID,
        innings: 2,
        battingTeam: OPPO,
        isHallsHead: false,
        batOrder: 1,
        participantId: `test-jcorr-oppo-${STAMP}`,
        playerName: "Oppo Batter",
        runs: 30,
        balls: 40,
      },
    ]);
    await db.insert(juniorMatchBowlingTable).values({
      id: BOWL_HH_ID,
      matchId: MATCH_ID,
      innings: 2,
      bowlingTeam: HH_TEAM,
      isHallsHead: true,
      participantId: P1,
      playerName: "Corr One",
      overs: 4,
      runs: 16,
      wickets: 1,
    });
    await db.insert(juniorMatchRostersTable).values({
      id: ROSTER_ID,
      matchId: MATCH_ID,
      teamName: HH_TEAM,
      isHallsHead: true,
      participantId: P1,
      playerName: "Corr One",
    });
  });

  afterAll(async () => {
    await db
      .delete(juniorMatchesTable)
      .where(eq(juniorMatchesTable.id, MATCH_ID)); // cascades all lines
    await db
      .delete(juniorParticipantsTable)
      .where(inArray(juniorParticipantsTable.participantId, [P1, P2]));
    await db
      .delete(juniorStatCorrectionsTable)
      .where(
        or(
          eq(juniorStatCorrectionsTable.matchId, MATCH_ID),
          inArray(juniorStatCorrectionsTable.participantId, [P1, P2]),
        ),
      );
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantBId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantBId));
  });

  it("rejects writes without an admin session", async () => {
    await request(app)
      .patch(`/api/juniors/matches/${MATCH_ID}`)
      .send({ hhResult: "Lost" })
      .expect(401);
    await request(app)
      .patch(`/api/juniors/matches/${MATCH_ID}/batting/${BAT_HH_ID}`)
      .send({ runs: 1 })
      .expect(401);
  });

  it("corrects match metadata and journals the pre-image", async () => {
    const res = await request(app)
      .patch(`/api/juniors/matches/${MATCH_ID}`)
      .set("Cookie", adminCookie)
      .send({ team1Score: "6/110", hhResult: "Lost" })
      .expect(200);
    expect(res.body.team1Score).toBe("6/110");
    expect(res.body.hhResult).toBe("Lost");

    const [journalRow] = await db
      .select()
      .from(juniorStatCorrectionsTable)
      .where(eq(juniorStatCorrectionsTable.targetTable, "junior_matches"))
      .orderBy(juniorStatCorrectionsTable.id);
    expect(journalRow).toBeDefined();
    expect(journalRow.op).toBe("update");
    expect(
      (journalRow.prevValues as Record<string, unknown>).team1_score,
    ).toBe("5/100");
    expect((journalRow.prevValues as Record<string, unknown>).hh_result).toBe(
      "Won",
    );

    // The public match detail reflects the corrected score immediately.
    const detail = await request(app)
      .get(`/api/juniors/matches/${MATCH_ID}`)
      .expect(200);
    expect(detail.body.opponentScore).toBe("6/110"); // team1 = opponent side
  });

  it("recomputes the strike rate when batting figures change", async () => {
    const res = await request(app)
      .patch(`/api/juniors/matches/${MATCH_ID}/batting/${BAT_HH_ID}`)
      .set("Cookie", adminCookie)
      .send({ runs: 50, balls: 25 })
      .expect(200);
    expect(res.body.runs).toBe(50);
    expect(res.body.strikeRate).toBe(200);
  });

  it("re-attributes an HH line (and rejects unknown/opposition targets)", async () => {
    await request(app)
      .patch(`/api/juniors/matches/${MATCH_ID}/batting/${BAT_HH_ID}`)
      .set("Cookie", adminCookie)
      .send({ participantId: "no-such-participant" })
      .expect(404);
    await request(app)
      .patch(`/api/juniors/matches/${MATCH_ID}/batting/${BAT_OPP_ID}`)
      .set("Cookie", adminCookie)
      .send({ participantId: P2 })
      .expect(400);

    const res = await request(app)
      .patch(`/api/juniors/matches/${MATCH_ID}/batting/${BAT_HH_ID}`)
      .set("Cookie", adminCookie)
      .send({ participantId: P2 })
      .expect(200);
    expect(res.body.participantId).toBe(P2);
    expect(res.body.playerName).toBe("Corr Two");
  });

  it("validates cricket ball notation and recomputes economy", async () => {
    await request(app)
      .patch(`/api/juniors/matches/${MATCH_ID}/bowling/${BOWL_HH_ID}`)
      .set("Cookie", adminCookie)
      .send({ overs: 3.6 })
      .expect(400);

    // 3.3 overs = 21 balls; 20 runs → economy 20 / (21/6) = 5.71.
    const res = await request(app)
      .patch(`/api/juniors/matches/${MATCH_ID}/bowling/${BOWL_HH_ID}`)
      .set("Cookie", adminCookie)
      .send({ overs: 3.3, runs: 20 })
      .expect(200);
    expect(res.body.overs).toBe(3.3);
    expect(res.body.economy).toBe(5.71);
  });

  it("creates a missing batting line in the reserved admin id band", async () => {
    const res = await request(app)
      .post(`/api/juniors/matches/${MATCH_ID}/batting`)
      .set("Cookie", adminCookie)
      .send({ innings: 1, participantId: P2, runs: 12, balls: 6 })
      .expect(201);
    expect(res.body.id).toBeGreaterThanOrEqual(100_000_000);
    expect(res.body.playerName).toBe("Corr Two");
    expect(res.body.strikeRate).toBe(200);

    const [journalRow] = await db
      .select()
      .from(juniorStatCorrectionsTable)
      .where(eq(juniorStatCorrectionsTable.targetId, String(res.body.id)));
    expect(journalRow.op).toBe("insert");
    expect((journalRow.patch as Record<string, unknown>).id).toBe(res.body.id);
    expect((journalRow.patch as Record<string, unknown>).is_halls_head).toBe(
      true,
    );
  });

  it("deletes a line and revert restores it from the journal pre-image", async () => {
    await request(app)
      .delete(`/api/juniors/matches/${MATCH_ID}/bowling/${BOWL_HH_ID}`)
      .set("Cookie", adminCookie)
      .expect(204);
    const [gone] = await db
      .select()
      .from(juniorMatchBowlingTable)
      .where(eq(juniorMatchBowlingTable.id, BOWL_HH_ID));
    expect(gone).toBeUndefined();

    const list = await request(app)
      .get(`/api/juniors/corrections?matchId=${MATCH_ID}`)
      .set("Cookie", adminCookie)
      .expect(200);
    const deletion = (
      list.body as Array<{ id: number; op: string; targetId: string }>
    ).find((c) => c.op === "delete" && c.targetId === String(BOWL_HH_ID));
    expect(deletion).toBeDefined();

    await request(app)
      .delete(`/api/juniors/corrections/${deletion!.id}`)
      .set("Cookie", adminCookie)
      .expect(204);
    const [restored] = await db
      .select()
      .from(juniorMatchBowlingTable)
      .where(eq(juniorMatchBowlingTable.id, BOWL_HH_ID));
    expect(restored).toBeDefined();
    expect(restored.overs).toBe(3.3);
    expect(restored.runs).toBe(20);
  });

  it("roster add rejects duplicates, and games counts move together", async () => {
    await request(app)
      .post(`/api/juniors/matches/${MATCH_ID}/roster`)
      .set("Cookie", adminCookie)
      .send({ participantId: P1 })
      .expect(409);

    await request(app)
      .post(`/api/juniors/matches/${MATCH_ID}/roster`)
      .set("Cookie", adminCookie)
      .send({ participantId: P2 })
      .expect(201);

    // The canonical roster-based games figure must agree across the player
    // detail and the players directory (the games-consistency invariant).
    const detail = await request(app)
      .get(`/api/juniors/players/${P2}`)
      .expect(200);
    const directory = await request(app)
      .get(`/api/juniors/players?search=Corr Two`)
      .expect(200);
    const dirRow = (
      directory.body as Array<{ participantId: string; matches: number }>
    ).find((r) => r.participantId === P2);
    expect(dirRow?.matches).toBe(1);
    expect(detail.body.batting.matches).toBeGreaterThanOrEqual(1);
  });

  it("enforces newest-first revert with 409", async () => {
    await request(app)
      .patch(`/api/juniors/matches/${MATCH_ID}/batting/${BAT_HH_ID}`)
      .set("Cookie", adminCookie)
      .send({ dismissal: "c Someone b Someone" })
      .expect(200);
    await request(app)
      .patch(`/api/juniors/matches/${MATCH_ID}/batting/${BAT_HH_ID}`)
      .set("Cookie", adminCookie)
      .send({ dismissal: "bowled" })
      .expect(200);

    const list = await request(app)
      .get(`/api/juniors/corrections?matchId=${MATCH_ID}`)
      .set("Cookie", adminCookie)
      .expect(200);
    const updates = (
      list.body as Array<{ id: number; op: string; targetId: string }>
    ).filter((c) => c.op === "update" && c.targetId === String(BAT_HH_ID));
    // Newest first (list is ordered desc by id).
    const newest = updates[0];
    const older = updates[1];
    expect(newest.id).toBeGreaterThan(older.id);

    await request(app)
      .delete(`/api/juniors/corrections/${older.id}`)
      .set("Cookie", adminCookie)
      .expect(409);
    await request(app)
      .delete(`/api/juniors/corrections/${newest.id}`)
      .set("Cookie", adminCookie)
      .expect(204);
    const [line] = await db
      .select()
      .from(juniorMatchBattingTable)
      .where(eq(juniorMatchBattingTable.id, BAT_HH_ID));
    expect(line.dismissal).toBe("c Someone b Someone");
  });

  it("corrects a participant name and flows it onto their lines", async () => {
    const res = await request(app)
      .patch(`/api/juniors/participants/${P2}`)
      .set("Cookie", adminCookie)
      .send({ displayName: "Corr Two Renamed" })
      .expect(200);
    expect(res.body.displayName).toBe("Corr Two Renamed");

    const [line] = await db
      .select()
      .from(juniorMatchBattingTable)
      .where(eq(juniorMatchBattingTable.id, BAT_HH_ID));
    expect(line.playerName).toBe("Corr Two Renamed");
  });

  it("another tenant's admin cannot edit and sees no corrections", async () => {
    await request(app)
      .patch(`/api/juniors/matches/${MATCH_ID}`)
      .set("Cookie", adminBCookie)
      .set("x-tenant-id", String(tenantBId))
      .send({ hhResult: "Hijacked" })
      .expect(404);
    await request(app)
      .patch(`/api/juniors/matches/${MATCH_ID}/batting/${BAT_HH_ID}`)
      .set("Cookie", adminBCookie)
      .set("x-tenant-id", String(tenantBId))
      .send({ runs: 0 })
      .expect(404);

    const list = await request(app)
      .get(`/api/juniors/corrections?matchId=${MATCH_ID}`)
      .set("Cookie", adminBCookie)
      .set("x-tenant-id", String(tenantBId))
      .expect(200);
    expect(list.body).toEqual([]);
  });
});
