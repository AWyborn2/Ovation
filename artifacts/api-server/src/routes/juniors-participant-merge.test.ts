import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq, inArray, like, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  tenantsTable,
  playersTable,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorMatchRostersTable,
  juniorParticipantsTable,
  juniorPremiershipsTable,
  juniorPremiershipPlayersTable,
  juniorOfficeBearersTable,
  juniorStatCorrectionsTable,
  juniorParticipantMergesTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Junior duplicate-profile merge. Pins: full reassignment across every
 * reference table with counts, roster dedupe, keeper metadata recompute,
 * senior-link + privacy carry-over, alias resolution for absorbed GUIDs,
 * flat-map chain handling (409 for a merged-away keeper), corrections-journal
 * history preservation, tenant isolation, and the ETL step-7 re-apply drill.
 *
 * Real-DB integration test (needs DATABASE_URL; central not required).
 */

const STAMP = Date.now();
const M1 = 98_100_001;
const M2 = 98_100_002;
const PREM = 98_100_401;
const DUP = `test-jm-dup-${STAMP}`;
const KEEP = `test-jm-keep-${STAMP}`;
const THIRD = `test-jm-third-${STAMP}`;
const DUP_PRIV = `test-jm-duppriv-${STAMP}`;
const KEEP2 = `test-jm-keep2-${STAMP}`;
const HH_TEAM = "HH Merge Test JCC";
const OPPO = "Merge Oppo CC";

describe("junior duplicate-profile merge", () => {
  let adminCookie: string;
  let adminId: number;
  let tenantBId: number;
  let adminBCookie: string;
  let seniorId: number;
  let officeBearerId: number;

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-junior-merge";

    const [admin] = await db
      .insert(adminsTable)
      .values({
        username: `test_admin_jm_${STAMP}`,
        displayName: "Test Admin JM",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;

    const [tenantB] = await db
      .insert(tenantsTable)
      .values({
        slug: `jm-b-${STAMP}`,
        centralClubId: 8831,
        name: "JM Tenant B",
        plan: "pilot",
      })
      .returning();
    tenantBId = tenantB.id;
    const [adminB] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantBId,
        username: `test_admin_jm_b_${STAMP}`,
        displayName: "B",
        passwordHash: "x",
      })
      .returning();
    adminBCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: adminB.id, issuedAt: Date.now() })}`;

    const [senior] = await db
      .insert(playersTable)
      .values({ surname: `TestJm${STAMP}`, givenName: "Senior" })
      .returning();
    seniorId = senior.id;

    await db.insert(juniorParticipantsTable).values([
      // The duplicate carries the senior link; the keeper does not — the
      // merge must carry it over.
      { participantId: DUP, displayName: "Jm Duplicate", seniorPlayerId: seniorId },
      { participantId: KEEP, displayName: "Jm Keeper" },
      { participantId: THIRD, displayName: "Jm Third" },
      { participantId: DUP_PRIV, displayName: "Jm Private Dup", isPrivate: true },
      { participantId: KEEP2, displayName: "Jm Keeper Two" },
    ]);

    await db.insert(juniorMatchesTable).values([
      {
        id: M1,
        playhqMatchId: `test-jm-phq1-${STAMP}`,
        season: "2096/97",
        seasonStartYear: 2096,
        team1: OPPO,
        team2: HH_TEAM,
        opponentName: OPPO,
      },
      {
        id: M2,
        playhqMatchId: `test-jm-phq2-${STAMP}`,
        season: "2097/98",
        seasonStartYear: 2097,
        team1: OPPO,
        team2: HH_TEAM,
        opponentName: OPPO,
      },
    ]);

    await db.insert(juniorMatchBattingTable).values([
      {
        id: 98_100_101,
        matchId: M1,
        innings: 1,
        battingTeam: HH_TEAM,
        isHallsHead: true,
        participantId: DUP,
        playerName: "Jm Duplicate",
        runs: 10,
        balls: 20,
      },
      {
        id: 98_100_102,
        matchId: M2,
        innings: 1,
        battingTeam: HH_TEAM,
        isHallsHead: true,
        participantId: KEEP,
        playerName: "Jm Keeper",
        runs: 20,
        balls: 15,
      },
    ]);
    await db.insert(juniorMatchBowlingTable).values([
      {
        id: 98_100_201,
        matchId: M1,
        innings: 2,
        bowlingTeam: HH_TEAM,
        isHallsHead: true,
        participantId: DUP,
        playerName: "Jm Duplicate",
        overs: 2,
        runs: 8,
        wickets: 1,
      },
    ]);
    await db.insert(juniorMatchRostersTable).values([
      {
        id: 98_100_301,
        matchId: M1,
        teamName: HH_TEAM,
        isHallsHead: true,
        participantId: DUP,
        playerName: "Jm Duplicate",
      },
      // Both GUIDs rostered in M2 — the classic duplicate signature; must
      // dedupe to one row on merge.
      {
        id: 98_100_302,
        matchId: M2,
        teamName: HH_TEAM,
        isHallsHead: true,
        participantId: DUP,
        playerName: "Jm Duplicate",
      },
      {
        id: 98_100_311,
        matchId: M2,
        teamName: HH_TEAM,
        isHallsHead: true,
        participantId: KEEP,
        playerName: "Jm Keeper",
      },
    ]);
    await db.insert(juniorPremiershipsTable).values({
      id: PREM,
      season: "2097/98",
      ageGroup: "Year 9",
      teamName: HH_TEAM,
    });
    await db.insert(juniorPremiershipPlayersTable).values({
      id: 98_100_501,
      premiershipId: PREM,
      participantId: DUP,
      playerName: "Jm Duplicate",
    });
    const [bearer] = await db
      .insert(juniorOfficeBearersTable)
      .values({
        season: 2097,
        role: "Test Captain",
        name: "Jm Duplicate",
        participantId: DUP,
      })
      .returning();
    officeBearerId = bearer.id;

    // A correction anchored to the duplicate GUID — merge must leave it as
    // history, never rewrite it.
    await db.insert(juniorStatCorrectionsTable).values({
      tenantId: 1,
      targetTable: "junior_match_batting",
      targetId: "98100101",
      op: "update",
      patch: { runs: 10 },
      prevValues: { runs: 9 },
      matchId: M1,
      playhqMatchId: `test-jm-phq1-${STAMP}`,
      participantId: DUP,
    });
  });

  afterAll(async () => {
    await db.delete(juniorMatchesTable).where(inArray(juniorMatchesTable.id, [M1, M2]));
    await db.delete(juniorPremiershipsTable).where(eq(juniorPremiershipsTable.id, PREM));
    await db
      .delete(juniorOfficeBearersTable)
      .where(eq(juniorOfficeBearersTable.id, officeBearerId));
    await db
      .delete(juniorParticipantsTable)
      .where(like(juniorParticipantsTable.participantId, `test-jm-%-${STAMP}`));
    await db
      .delete(juniorParticipantMergesTable)
      .where(like(juniorParticipantMergesTable.duplicateParticipantId, `test-jm-%-${STAMP}`));
    await db
      .delete(juniorStatCorrectionsTable)
      .where(like(juniorStatCorrectionsTable.participantId, `test-jm-%-${STAMP}`));
    await db.delete(playersTable).where(eq(playersTable.id, seniorId));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
    await db.delete(adminsTable).where(eq(adminsTable.tenantId, tenantBId));
    await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantBId));
  });

  it("rejects merges without an admin session and validates inputs", async () => {
    await request(app)
      .post(`/api/juniors/participants/${DUP}/merge`)
      .send({ keeperParticipantId: KEEP })
      .expect(401);
    await request(app)
      .post(`/api/juniors/participants/${DUP}/merge`)
      .set("Cookie", adminCookie)
      .send({ keeperParticipantId: DUP })
      .expect(400);
    await request(app)
      .post(`/api/juniors/participants/no-such-guid/merge`)
      .set("Cookie", adminCookie)
      .send({ keeperParticipantId: KEEP })
      .expect(404);
    await request(app)
      .post(`/api/juniors/participants/${DUP}/merge`)
      .set("Cookie", adminCookie)
      .send({ keeperParticipantId: "no-such-guid" })
      .expect(404);
  });

  it("a central-backed tenant's admin gets 404 (no native juniors to merge)", async () => {
    const [tenantC] = await db
      .insert(tenantsTable)
      .values({
        slug: `jm-c-${STAMP}`,
        centralClubId: 8832,
        name: "JM Tenant C",
        plan: "pilot",
        readsFromCentral: true,
      })
      .returning();
    const [adminC] = await db
      .insert(adminsTable)
      .values({
        tenantId: tenantC.id,
        username: `test_admin_jm_c_${STAMP}`,
        displayName: "C",
        passwordHash: "x",
      })
      .returning();
    const adminCCookie = `${SESSION_COOKIE}=${encodeSession({ adminId: adminC.id, issuedAt: Date.now() })}`;
    try {
      await request(app)
        .post(`/api/juniors/participants/${DUP}/merge`)
        .set("Cookie", adminCCookie)
        .set("x-tenant-id", String(tenantC.id))
        .send({ keeperParticipantId: KEEP })
        .expect(404);
    } finally {
      await db.delete(adminsTable).where(eq(adminsTable.id, adminC.id));
      await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantC.id));
    }
  });

  it("another tenant's admin cannot merge this tenant's participants (404)", async () => {
    await request(app)
      .post(`/api/juniors/participants/${DUP}/merge`)
      .set("Cookie", adminBCookie)
      .set("x-tenant-id", String(tenantBId))
      .send({ keeperParticipantId: KEEP })
      .expect(404);
    const [still] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.participantId, DUP));
    expect(still).toBeDefined();
  });

  it("merges the duplicate into the keeper: reassignment, dedupe, carry-over, metadata", async () => {
    const res = await request(app)
      .post(`/api/juniors/participants/${DUP}/merge`)
      .set("Cookie", adminCookie)
      .send({ keeperParticipantId: KEEP })
      .expect(200);

    expect(res.body.keeperParticipantId).toBe(KEEP);
    expect(res.body.duplicateParticipantId).toBe(DUP);
    expect(res.body.seniorPlayerId).toBe(seniorId); // carried from the duplicate
    expect(res.body.reassigned).toEqual({
      batting: 1,
      bowling: 1,
      rosters: 2,
      rostersDeduped: 1, // both were rostered in M2
      premiershipPlayers: 1,
      officeBearers: 1,
    });

    // Duplicate profile row is gone; merge record with snapshot exists.
    const [dupRow] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.participantId, DUP));
    expect(dupRow).toBeUndefined();
    const [mergeRow] = await db
      .select()
      .from(juniorParticipantMergesTable)
      .where(eq(juniorParticipantMergesTable.duplicateParticipantId, DUP));
    expect(mergeRow.keeperParticipantId).toBe(KEEP);
    expect((mergeRow.duplicateRow as Record<string, unknown>).display_name).toBe("Jm Duplicate");

    // Keeper metadata recomputed across both identities.
    const [keeperRow] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.participantId, KEEP));
    expect(keeperRow.firstSeason).toBe("2096/97");
    expect(keeperRow.lastSeason).toBe("2097/98");
    expect(keeperRow.scorecardLines).toBe(3); // 2 batting + 1 bowling
    expect(keeperRow.rosterAppearances).toBe(2); // M1 + M2 after dedupe
    expect(keeperRow.teams).toBe(HH_TEAM);
    expect(keeperRow.seniorPlayerId).toBe(seniorId);

    // Combined figures on the live surfaces; keeper's name on absorbed lines.
    const detail = await request(app).get(`/api/juniors/players/${KEEP}`).expect(200);
    expect(detail.body.batting.runs).toBe(30);
    expect(detail.body.bowling.wickets).toBe(1);
    const directory = await request(app).get(`/api/juniors/players?search=Jm Keeper`).expect(200);
    const dirRow = (
      directory.body as Array<{ participantId: string; matches: number; runs: number }>
    ).find((r) => r.participantId === KEEP);
    expect(dirRow?.matches).toBe(2);
    expect(dirRow?.runs).toBe(30);
    const [absorbedLine] = await db
      .select()
      .from(juniorMatchBattingTable)
      .where(eq(juniorMatchBattingTable.id, 98_100_101));
    expect(absorbedLine.participantId).toBe(KEEP);
    expect(absorbedLine.playerName).toBe("Jm Keeper");
  });

  it("aliases the absorbed GUID's profile URL to the keeper", async () => {
    const res = await request(app).get(`/api/juniors/players/${DUP}`).expect(200);
    expect(res.body.participantId).toBe(KEEP);
    expect(res.body.displayName).toBe("Jm Keeper");
  });

  it("leaves corrections-journal history anchored to the absorbed GUID untouched", async () => {
    const [correction] = await db
      .select()
      .from(juniorStatCorrectionsTable)
      .where(eq(juniorStatCorrectionsTable.participantId, DUP));
    expect(correction).toBeDefined();
  });

  it("merging a private duplicate makes the keeper private (sticky privacy)", async () => {
    await request(app)
      .post(`/api/juniors/participants/${DUP_PRIV}/merge`)
      .set("Cookie", adminCookie)
      .send({ keeperParticipantId: KEEP2 })
      .expect(200);
    const [keeper2] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.participantId, KEEP2));
    expect(keeper2.isPrivate).toBe(true);
    // Private keeper: public profile and the absorbed GUID's alias both 404.
    await request(app).get(`/api/juniors/players/${KEEP2}`).expect(404);
    await request(app).get(`/api/juniors/players/${DUP_PRIV}`).expect(404);
    const directory = await request(app)
      .get(`/api/juniors/players?search=Jm Keeper Two`)
      .expect(200);
    expect(
      (directory.body as Array<{ participantId: string }>).some((r) => r.participantId === KEEP2),
    ).toBe(false);
  });

  it("keeps the map flat and 409s on a merged-away keeper", async () => {
    // KEEP (which already absorbed DUP) is itself merged into THIRD.
    await request(app)
      .post(`/api/juniors/participants/${KEEP}/merge`)
      .set("Cookie", adminCookie)
      .send({ keeperParticipantId: THIRD })
      .expect(200);

    // Both map rows now point at THIRD (no chains).
    const rows = await db
      .select()
      .from(juniorParticipantMergesTable)
      .where(inArray(juniorParticipantMergesTable.duplicateParticipantId, [DUP, KEEP]));
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.keeperParticipantId).toBe(THIRD);

    // The original absorbed GUID aliases through to THIRD.
    const res = await request(app).get(`/api/juniors/players/${DUP}`).expect(200);
    expect(res.body.participantId).toBe(THIRD);

    // Using a merged-away GUID as keeper refuses with the canonical keeper.
    const conflict = await request(app)
      .post(`/api/juniors/participants/${THIRD}/merge`)
      .set("Cookie", adminCookie)
      .send({ keeperParticipantId: KEEP })
      .expect(409);
    expect(conflict.body.canonicalKeeperParticipantId).toBe(THIRD);
  });

  it("ETL step 7 re-applies merges after a simulated reload (and skips when the keeper is missing)", async () => {
    // Simulate what a dump reload does to the DUP→…→THIRD merge: resurrect
    // the duplicate participant row and put its original lines back under the
    // duplicate GUID.
    await db.insert(juniorParticipantsTable).values({
      participantId: DUP,
      displayName: "Jm Duplicate",
      seniorPlayerId: seniorId,
    });
    await db
      .update(juniorMatchBattingTable)
      .set({ participantId: DUP, playerName: "Jm Duplicate" })
      .where(eq(juniorMatchBattingTable.id, 98_100_101));
    await db
      .update(juniorMatchRostersTable)
      .set({ participantId: DUP, playerName: "Jm Duplicate" })
      .where(eq(juniorMatchRostersTable.id, 98_100_301));

    // Negative control: a merge whose keeper is absent from the "dump".
    const GHOST_DUP = `test-jm-ghostdup-${STAMP}`;
    await db.insert(juniorParticipantsTable).values({
      participantId: GHOST_DUP,
      displayName: "Jm Ghost Dup",
    });
    await db.insert(juniorParticipantMergesTable).values({
      tenantId: 1,
      duplicateParticipantId: GHOST_DUP,
      keeperParticipantId: `test-jm-ghostkeeper-${STAMP}`,
    });

    // Run the extracted ETL step 7 (multi-statement string executes as one
    // implicit transaction, so the ON COMMIT DROP temp table behaves).
    const etl = readFileSync(
      join(__dirname, "..", "..", "..", "..", "scripts", "sql", "juniors-etl.sql"),
      "utf8",
    );
    const step7 = etl.slice(etl.indexOf("-- 7. Re-apply junior profile merges"));
    await db.execute(sql.raw(step7));

    // The resurrected duplicate funnels to THIRD; its row is gone again.
    const [line] = await db
      .select()
      .from(juniorMatchBattingTable)
      .where(eq(juniorMatchBattingTable.id, 98_100_101));
    expect(line.participantId).toBe(THIRD);
    const [dupRow] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.participantId, DUP));
    expect(dupRow).toBeUndefined();
    const [third] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.participantId, THIRD));
    expect(third.firstSeason).toBe("2096/97");
    expect(third.lastSeason).toBe("2097/98");
    expect(third.seniorPlayerId).toBe(seniorId);

    // The keeper-less merge was skipped: its duplicate row survives.
    const [ghost] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.participantId, GHOST_DUP));
    expect(ghost).toBeDefined();
  });
});
