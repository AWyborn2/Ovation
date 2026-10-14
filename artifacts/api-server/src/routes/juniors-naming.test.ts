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
  juniorMatchDisplaySettingsTable,
  juniorStatCorrectionsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";

/**
 * Junior public naming, privacy override and opposition initials (junior PlayHQ
 * sync plan U7; KTD12, R15, R16, R22, AE3).
 *
 * Real-DB integration test (needs DATABASE_URL) — runs in CI.
 */

const STAMP = Date.now();
const MATCH_ID = 910_000_000 + (STAMP % 1_000_000);
const OLLIE = `test-jnm-ollie-${STAMP}`;
const SAM = `test-jnm-sam-${STAMP}`;
const OPP = `test-jnm-opp-${STAMP}`;
const SEASON = "2093/94";

describe("junior naming and privacy override", () => {
  let tenantA = 0;
  let tenantB = 0;
  let cookieA = "";
  let cookieB = "";

  const asPublic = (r: request.Test) => r.set("x-tenant-id", String(tenantA));
  const asAdminA = (r: request.Test) =>
    r.set("x-tenant-id", String(tenantA)).set("Cookie", cookieA);
  const asAdminBOnA = (r: request.Test) =>
    r.set("x-tenant-id", String(tenantA)).set("Cookie", cookieB);

  const setStyle = (nameStyle: string) =>
    asAdminA(request(app).patch("/api/juniors/match-display-settings")).send({ nameStyle });
  const setOverride = (privacyOverride: boolean) =>
    asAdminA(request(app).patch(`/api/juniors/participants/${OLLIE}`)).send({ privacyOverride });

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-juniors-naming";
    const make = async (key: string, clubId: number) => {
      const [t] = await db
        .insert(tenantsTable)
        .values({
          slug: `jnm-${key}-${STAMP}`,
          centralClubId: clubId,
          readsFromCentral: true,
          name: `JNM ${key}`,
          plan: "pilot",
        })
        .returning();
      return t.id;
    };
    tenantA = await make("a", 95_000 + (STAMP % 1000));
    tenantB = await make("b", 96_000 + (STAMP % 1000));
    const admin = async (tenantId: number, key: string) => {
      const [a] = await db
        .insert(adminsTable)
        .values({
          tenantId,
          username: `test_admin_jnm_${key}_${STAMP}`,
          displayName: key,
          passwordHash: "x",
        })
        .returning();
      return `${SESSION_COOKIE}=${encodeSession({ adminId: a.id, issuedAt: Date.now() })}`;
    };
    cookieA = await admin(tenantA, "a");
    cookieB = await admin(tenantB, "b");

    await db.insert(juniorParticipantsTable).values([
      { participantId: OLLIE, tenantId: tenantA, displayName: "Ollie Gallash", isPrivate: true },
      { participantId: SAM, tenantId: tenantA, displayName: "Sam Taylor" },
    ]);
    await db.insert(juniorMatchesTable).values({
      id: MATCH_ID,
      tenantId: tenantA,
      season: SEASON,
      seasonStartYear: 2093,
      ageGroup: "Year 6",
      team1: "JNM A",
      team2: "Opponents",
      opponentName: "Opponents",
    });
    await db.insert(juniorMatchBattingTable).values([
      {
        id: MATCH_ID,
        matchId: MATCH_ID,
        innings: 1,
        participantId: OLLIE,
        playerName: "Ollie Gallash",
        isHallsHead: true,
        runs: 30,
        dismissal: "bowled",
      },
      {
        id: MATCH_ID + 1,
        matchId: MATCH_ID,
        innings: 1,
        participantId: SAM,
        playerName: "Sam Taylor",
        isHallsHead: true,
        runs: 20,
        dismissal: "caught",
      },
      {
        id: MATCH_ID + 2,
        matchId: MATCH_ID,
        innings: 2,
        participantId: OPP,
        playerName: "Kai Wilson",
        isHallsHead: false,
        runs: 12,
        dismissal: "bowled",
      },
    ]);
    await db.insert(juniorMatchRostersTable).values([
      { id: MATCH_ID, matchId: MATCH_ID, participantId: OLLIE, playerName: "x", isHallsHead: true },
      {
        id: MATCH_ID + 1,
        matchId: MATCH_ID,
        participantId: SAM,
        playerName: "x",
        isHallsHead: true,
      },
    ]);
  });

  afterAll(async () => {
    const ids = [MATCH_ID, MATCH_ID + 1, MATCH_ID + 2];
    await db.delete(juniorMatchBattingTable).where(inArray(juniorMatchBattingTable.id, ids));
    await db.delete(juniorMatchRostersTable).where(inArray(juniorMatchRostersTable.id, ids));
    await db.delete(juniorMatchesTable).where(eq(juniorMatchesTable.id, MATCH_ID));
    await db
      .delete(juniorParticipantsTable)
      .where(inArray(juniorParticipantsTable.participantId, [OLLIE, SAM]));
    await db
      .delete(juniorStatCorrectionsTable)
      .where(inArray(juniorStatCorrectionsTable.tenantId, [tenantA, tenantB]));
    await db
      .delete(juniorMatchDisplaySettingsTable)
      .where(inArray(juniorMatchDisplaySettingsTable.tenantId, [tenantA, tenantB]));
    await db.delete(adminsTable).where(inArray(adminsTable.tenantId, [tenantA, tenantB]));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantA, tenantB]));
  });

  const ourLines = async () => {
    const res = await asPublic(request(app).get(`/api/juniors/matches/${MATCH_ID}`)).expect(200);
    return res.body.innings.flatMap(
      (i: { batting: { participantId: string | null; playerName: string }[] }) => i.batting,
    ) as { participantId: string | null; playerName: string; isPrivate: boolean }[];
  };

  it("AE3: a private player is withheld publicly; style and initials apply to the rest", async () => {
    await setStyle("first_initial").expect(200);
    const lines = await ourLines();
    const names = lines.map((l) => l.playerName);
    expect(names).toContain("Private Player");
    expect(names).toContain("Sam T");
    expect(names).toContain("K. W.");
    expect(names).not.toContain("Ollie Gallash");
    expect(lines.find((l) => l.playerName === "Private Player")!.participantId).toBeNull();

    const dir = await asPublic(request(app).get("/api/juniors/players")).expect(200);
    expect(dir.body.map((p: { participantId: string }) => p.participantId)).not.toContain(OLLIE);
    await asPublic(request(app).get(`/api/juniors/players/${OLLIE}`)).expect(404);
  });

  it("AE3: with the override the player shows as 'Ollie G' everywhere public", async () => {
    await setStyle("first_initial").expect(200);
    const set = await setOverride(true).expect(200);
    expect(set.body.privacyOverride).toBe(true);
    expect(set.body.privacyOverrideBy).toBe(`test_admin_jnm_a_${STAMP}`);
    expect(typeof set.body.privacyOverrideAt).toBe("string");

    expect((await ourLines()).map((l) => l.playerName)).toContain("Ollie G");

    const dir = await asPublic(request(app).get("/api/juniors/players")).expect(200);
    const ollie = dir.body.find((p: { participantId: string }) => p.participantId === OLLIE);
    expect(ollie.displayName).toBe("Ollie G");

    const board = await asPublic(
      request(app).get(`/api/juniors/leaderboard?season=${encodeURIComponent(SEASON)}`),
    ).expect(200);
    expect(board.body.map((r: { displayName: string }) => r.displayName)).toContain("Ollie G");

    const profile = await asPublic(request(app).get(`/api/juniors/players/${OLLIE}`)).expect(200);
    expect(profile.body.displayName).toBe("Ollie G");

    const overrides = await asAdminA(request(app).get("/api/juniors/privacy-overrides")).expect(
      200,
    );
    expect(overrides.body.map((p: { participantId: string }) => p.participantId)).toEqual([OLLIE]);
    expect(overrides.body[0].displayName).toBe("Ollie Gallash");

    await setOverride(false).expect(200);
    expect((await ourLines()).map((l) => l.playerName)).toContain("Private Player");
  });

  it("styles first and full name the club's players", async () => {
    await setStyle("first").expect(200);
    expect((await ourLines()).map((l) => l.playerName)).toContain("Sam");
    await setStyle("full").expect(200);
    expect((await ourLines()).map((l) => l.playerName)).toContain("Sam Taylor");
  });

  it("admin responses carry full names", async () => {
    await setStyle("first").expect(200);
    const admin = await asAdminA(
      request(app).get(`/api/juniors/matches/${MATCH_ID}?includePrivate=true`),
    ).expect(200);
    const names = admin.body.innings.flatMap((i: { batting: { playerName: string }[] }) =>
      i.batting.map((b) => b.playerName),
    );
    expect(names).toEqual(expect.arrayContaining(["Ollie Gallash", "Sam Taylor", "Kai Wilson"]));

    // includePrivate is ignored without a signed-in admin.
    const anon = await asPublic(
      request(app).get(`/api/juniors/matches/${MATCH_ID}?includePrivate=true`),
    ).expect(200);
    expect(JSON.stringify(anon.body)).not.toContain("Ollie Gallash");

    const dir = await asAdminA(request(app).get("/api/juniors/players?includePrivate=true")).expect(
      200,
    );
    const ollie = dir.body.find((p: { participantId: string }) => p.participantId === OLLIE);
    expect(ollie.displayName).toBe("Ollie Gallash");
    expect(ollie.isPrivate).toBe(true);
    await setStyle("full").expect(200);
  });

  it("only this club's admin can set, clear or list overrides", async () => {
    await asPublic(request(app).patch(`/api/juniors/participants/${OLLIE}`))
      .send({ privacyOverride: true })
      .expect(401);
    await asPublic(request(app).get("/api/juniors/privacy-overrides")).expect(401);
    // Another club's admin is not signed in on this tenant.
    await asAdminBOnA(request(app).patch(`/api/juniors/participants/${OLLIE}`))
      .send({ privacyOverride: true })
      .expect(401);
    // And on their own tenant the participant does not exist.
    await request(app)
      .patch(`/api/juniors/participants/${OLLIE}`)
      .set("x-tenant-id", String(tenantB))
      .set("Cookie", cookieB)
      .send({ privacyOverride: true })
      .expect(404);
    const [row] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.participantId, OLLIE));
    expect(row.privacyOverride).toBe(false);
  });

  it("refuses to override a player who is not private", async () => {
    await asAdminA(request(app).patch(`/api/juniors/participants/${SAM}`))
      .send({ privacyOverride: true })
      .expect(400);
  });

  it("journals override changes", async () => {
    await setOverride(true).expect(200);
    await setOverride(false).expect(200);
    const rows = await db
      .select()
      .from(juniorStatCorrectionsTable)
      .where(eq(juniorStatCorrectionsTable.tenantId, tenantA));
    const overrides = rows.filter(
      (r) => r.targetId === OLLIE && "privacy_override" in ((r.patch ?? {}) as object),
    );
    expect(overrides.length).toBeGreaterThanOrEqual(2);
  });

  it("validates display settings values", async () => {
    await asAdminA(request(app).patch("/api/juniors/match-display-settings"))
      .send({ nameStyle: "surname" })
      .expect(400);
    await asAdminA(request(app).patch("/api/juniors/match-display-settings"))
      .send({ teamPublishing: { "Year 6": { Hawks: "sometimes" } } })
      .expect(400);
    const ok = await asAdminA(request(app).patch("/api/juniors/match-display-settings"))
      .send({ teamPublishing: { "Year 6": { Hawks: "auto" } } })
      .expect(200);
    expect(ok.body.teamPublishing).toEqual({ "Year 6": { Hawks: "auto" } });
  });
});
