import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { encodeSession, encodeCaptainSession, SESSION_COOKIE, CAPTAIN_SESSION_COOKIE } from "../lib/auth";
import { db, adminsTable, awardBallotsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  createVotingScenario,
  getWinners,
  type VotingScenario,
} from "../lib/voting.test-helpers";

const GRADE = "A Grade";
const SEASON = 2099;

describe("voting + finalise flow (integration)", () => {
  let scenario: VotingScenario;
  let adminId: number;
  let adminCookie: string;
  let captainCookie: string;

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-voting-flow";

    // Tally must be publicly visible for the public endpoint assertion.
    scenario = await createVotingScenario({
      grade: GRADE,
      season: SEASON,
      playerCount: 4,
      rounds: [1],
      votingEnabled: true,
      votingOpen: true,
      tallyVisible: true,
      autoHideAfterRounds: null,
    });

    const [admin] = await db
      .insert(adminsTable)
      .values({
        username: `test_admin_${Date.now()}`,
        displayName: "Test Admin",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;

    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;
    captainCookie = `${CAPTAIN_SESSION_COOKIE}=${encodeCaptainSession({
      captainId: scenario.captainId,
      issuedAt: Date.now(),
    })}`;
  });

  afterAll(async () => {
    await scenario.cleanup();
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  });

  it("runs ballot -> public tally -> finalise -> idempotent finalise", async () => {
    const [a, b, c, d] = scenario.playerIds;

    // 1. Captain submits a ballot (a=3, b=2, c=1).
    const ballotRes = await request(app)
      .post("/api/captain/ballots")
      .set("Cookie", captainCookie)
      .send({
        configId: scenario.configId,
        grade: GRADE,
        round: 1,
        pick1PlayerId: a,
        pick2PlayerId: b,
        pick3PlayerId: c,
      });
    expect(ballotRes.status).toBe(200);
    expect(ballotRes.body.pick1PlayerId).toBe(a);

    // 2. Public tally reflects the ballot and is visible.
    type PublicTally = {
      configId: number;
      visible: boolean;
      winnerPlayerIds: number[];
      entries: Array<{ playerId: number; points: number }>;
    };
    const tallyRes = await request(app).get("/api/award-tallies");
    expect(tallyRes.status).toBe(200);
    const mine = (tallyRes.body as PublicTally[]).find(
      (t) => t.configId === scenario.configId,
    );
    expect(mine).toBeDefined();
    expect(mine!.visible).toBe(true);
    expect(mine!.winnerPlayerIds).toEqual([a]);
    const aEntry = mine!.entries.find((e) => e.playerId === a);
    expect(aEntry?.points).toBe(3);

    // Rejects an unauthenticated finalise.
    const noAuth = await request(app).post(
      `/api/voting-configs/${scenario.configId}/finalise`,
    );
    expect(noAuth.status).toBe(401);

    // 3. Admin finalises -> winner recorded, voting closed.
    const finRes = await request(app)
      .post(`/api/voting-configs/${scenario.configId}/finalise`)
      .set("Cookie", adminCookie);
    expect(finRes.status).toBe(200);
    const winners1 = await getWinners(scenario.awardId, SEASON);
    expect(winners1.map((w) => w.playerId)).toEqual([a]);

    // 4. Finalise again is idempotent (no duplicate winner rows).
    const finRes2 = await request(app)
      .post(`/api/voting-configs/${scenario.configId}/finalise`)
      .set("Cookie", adminCookie);
    expect(finRes2.status).toBe(200);
    const winners2 = await getWinners(scenario.awardId, SEASON);
    expect(winners2.length).toBe(1);
    expect(winners2.map((w) => w.playerId)).toEqual([a]);

    // Finalise reflects an updated tally on re-run (idempotent replacement).
    // Finalise closes voting, so change the existing ballot directly to make
    // player d the runaway leader, then re-finalise: winners should be
    // replaced, not appended.
    await db
      .update(awardBallotsTable)
      .set({ pick1PlayerId: d, pick2PlayerId: a, pick3PlayerId: b })
      .where(eq(awardBallotsTable.configId, scenario.configId));
    const finRes3 = await request(app)
      .post(`/api/voting-configs/${scenario.configId}/finalise`)
      .set("Cookie", adminCookie);
    expect(finRes3.status).toBe(200);
    const winners3 = await getWinners(scenario.awardId, SEASON);
    expect(winners3.length).toBe(1);
    expect(winners3.map((w) => w.playerId)).toEqual([d]);
  });
});
