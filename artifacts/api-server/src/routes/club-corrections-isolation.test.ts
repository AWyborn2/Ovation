import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  adminsTable,
  clubCorrectionsTable,
  clubHistoryBoundariesTable,
  playerIdMapTable,
  socialDraftsTable,
  socialSettingsTable,
  tenantsTable,
} from "@workspace/db";
import { hashPassword, encodeSession, SESSION_COOKIE } from "../lib/auth";
import { clearMilestonesCache } from "../lib/milestones-cache";
import { resetClubOverlayTableProbe } from "../lib/club-overlay";
import { sweepCentralMatches } from "../lib/draft-sweep";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";
import { invalidateTenantConfigCache } from "../lib/tenant";

/**
 * Club corrections admin API (hybrid stats plan U16; R15, KTD7, KTD8).
 *
 * Tenant A reads central club 9861; tenant B reads 9863. Central (all 2024/25
 * unless noted):
 *
 *   M1  A v OPP, A Grade   — Ann (A) bats 40, takes a catch; Fay (A, a
 *                            PRIVATE player) only fields (a catch); Ross (A)
 *                            is on the team sheet only; Olly bats for OPP.
 *   M2  A v OPP, Under 15  — Ann bats 200 (junior: never correctable).
 *   M3  B v OPP, A Grade   — not A's match.
 *   M5  A v OPP, 2002/03   — Ann bats 20: before A's 2003 boundary.
 *
 * Covers the plan's scenarios — a match not involving the club and a GUID with
 * no line are rejected, tenant B can't create, list or remove A's corrections,
 * removing reverts the public career — plus: previous value must equal central
 * (never born stale), junior and pre-boundary matches are refused, the list
 * shows stale corrections with U10's reason, a re-correction replaces the
 * current one, the actor is recorded, corrections never draft social cards or
 * move the sweep watermark (KTD8), and a missing table is a clear 503. Also:
 * the club admin sees a private player's real name on these admin endpoints
 * while the public player pages keep hiding them, and the status endpoint
 * tells a club still on its own native stats that corrections won't reach its
 * public pages yet.
 *
 * Real-DB integration (CI's API job: DATABASE_URL and CENTRAL_DATABASE_URL are
 * the same throwaway Postgres, migrations applied). The central rows are
 * written through the TENANT `db` with raw SQL, only when the database is
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
const PASSWORD = "correct horse battery";
const CLUB_A = 9861;
const OPP = 9862;
const CLUB_B = 9863;
const M1 = 986_101;
const M2 = 986_102;
const M3 = 986_103;
const M5 = 986_105;
const phq = (m: number) => `club-corrections-${m}`;
const LINE_BASE = 9_861_000;
const ANN = "98610000-0000-4000-8000-00000000000a";
const FAY = "98610000-0000-4000-8000-00000000000f";
const ROSS = "98610000-0000-4000-8000-00000000000e";
const OLLY = "98610000-0000-4000-8000-0000000000ff";
const ANN_ID = 701;

async function seedCentral(): Promise<void> {
  for (const [id, name] of [
    [CLUB_A, "Corrections CC"],
    [OPP, "Corrections Opp CC"],
    [CLUB_B, "Corrections Other CC"],
  ] as const) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${id}, ${name}, ${`C${id}`}, '#123456', null, null, '2002/03', null)
    `);
  }
  for (const [id, name, isPrivate] of [
    [ANN, "Ann Able", 0],
    [FAY, "Fay Fielder", 1],
    [ROSS, "Ross Roster", 0],
    [OLLY, "Olly Opp", 0],
  ] as const) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${id}, ${name}, ${isPrivate}, ${CLUB_A}, '2002/03', '2024/25', 1)
    `);
  }
  const matches: [number, string, string, number, number, string][] = [
    [M1, "2024/25", "A Grade", CLUB_A, OPP, "2024-11-02"],
    [M2, "2024/25", "Under 15", CLUB_A, OPP, "2024-11-09"],
    [M3, "2024/25", "A Grade", CLUB_B, OPP, "2024-11-16"],
    [M5, "2002/03", "A Grade", CLUB_A, OPP, "2002-11-02"],
  ];
  for (const [m, season, grade, home, away, date] of matches) {
    await db.execute(sql`
      insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
        status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
      values (${m}, ${phq(m)}, ${season}, ${grade}, 'g', 'One Day', '4', ${date}, 'Corrections Oval',
        'Completed', ${home}, ${away}, ${home === CLUB_A ? "Corrections" : "Other"}, 'Opp', '5/150', '10/120',
        ${home}, ${home}, 'won')
    `);
  }
  let id = LINE_BASE;
  const bat = async (m: number, club: number, guid: string, runs: number) =>
    db.execute(sql`
      insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
        runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
      values (${id++}, ${m}, 1, ${club}, 'x', 1, ${guid}, 'x', ${runs}, ${runs}, 0, 0, 100, 'b Bowler', 'bowled', null)
    `);
  const roster = async (m: number, club: number, guid: string) =>
    db.execute(sql`
      insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
      values (${id++}, ${m}, ${club}, 'x', ${guid}, 'x')
    `);
  const field = async (m: number, club: number, guid: string) =>
    db.execute(sql`
      insert into central.fielding (id, match_id, club_id, participant_id, player_name, kind)
      values (${id++}, ${m}, ${club}, ${guid}, 'x', 'caught')
    `);
  await bat(M1, CLUB_A, ANN, 40);
  await roster(M1, CLUB_A, ANN);
  await field(M1, CLUB_A, ANN);
  await field(M1, CLUB_A, FAY);
  await roster(M1, CLUB_A, FAY);
  await roster(M1, CLUB_A, ROSS);
  await bat(M1, OPP, OLLY, 12);
  await bat(M2, CLUB_A, ANN, 200);
  await roster(M2, CLUB_A, ANN);
  await bat(M3, CLUB_B, OLLY, 30);
  await bat(M5, CLUB_A, ANN, 20);
  await roster(M5, CLUB_A, ANN);
}

async function cleanCentral(): Promise<void> {
  const range = sql`id >= ${LINE_BASE} and id < ${LINE_BASE + 1000}`;
  await db.execute(sql`delete from central.match_batting where ${range}`);
  await db.execute(sql`delete from central.match_rosters where ${range}`);
  await db.execute(sql`delete from central.fielding where ${range}`);
  await db.execute(sql`delete from central.matches where match_id in (${M1}, ${M2}, ${M3}, ${M5})`);
  await db.execute(
    sql`delete from central.players where participant_id in (${ANN}, ${FAY}, ${ROSS}, ${OLLY})`,
  );
  await db.execute(sql`delete from central.clubs where club_id in (${CLUB_A}, ${OPP}, ${CLUB_B})`);
}

type Correction = {
  id: number;
  status: string;
  staleReason: string | null;
  centralValue: number | null;
  field: string;
  newValue: number;
  createdBy: string;
};

describe.skipIf(!isLocalDb)("club corrections admin (tenant-scoped)", () => {
  let a: number;
  let b: number;
  let cookieA: string;
  let cookieB: string;
  let prevTtl: string | undefined;
  const log = { error: () => {}, warn: () => {}, info: () => {} };

  const as = (tenantId: number, cookie?: string) => {
    const h = (r: request.Test) => {
      r.set("x-tenant-id", String(tenantId));
      return cookie ? r.set("Cookie", cookie) : r;
    };
    return {
      list: () => h(request(app).get("/api/club-corrections")),
      status: () => h(request(app).get("/api/club-corrections/status")),
      search: (q = "") =>
        h(request(app).get(`/api/club-corrections/matches?q=${encodeURIComponent(q)}`)),
      match: (m: number) => h(request(app).get(`/api/club-corrections/matches/${m}`)),
      create: (body: Record<string, unknown>) =>
        h(request(app).post("/api/club-corrections").send(body)),
      remove: (id: number) => h(request(app).delete(`/api/club-corrections/${id}`)),
    };
  };
  const A = () => as(a, cookieA);
  const B = () => as(b, cookieB);
  const annRuns = (over: Record<string, unknown> = {}) => ({
    playhqMatchId: phq(M1),
    participantId: ANN,
    field: "runs",
    previousValue: 40,
    newValue: 55,
    note: "Scorer's book says 55",
    ...over,
  });
  const rowsOf = (tenantId: number) =>
    db.select().from(clubCorrectionsTable).where(eq(clubCorrectionsTable.tenantId, tenantId));
  const career = async () =>
    (await request(app).get(`/api/players/${ANN_ID}`).set("x-tenant-id", String(a)).expect(200))
      .body as { totalRuns: number; totalGames: number };
  const watermark = async (tenantId: number) =>
    (
      await db
        .select({ w: socialSettingsTable.centralSweepWatermark })
        .from(socialSettingsTable)
        .where(eq(socialSettingsTable.tenantId, tenantId))
    )[0]?.w ?? null;

  async function makeTenant(label: string, club: number, readsFromCentral = true): Promise<number> {
    const [row] = await db
      .insert(tenantsTable)
      .values({
        slug: `club-corrections-${label}-${STAMP}`,
        centralClubId: club,
        name: `Club Corrections ${label}`,
        readsFromCentral,
      })
      .returning();
    return row.id;
  }

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-club-corrections";
    prevTtl = process.env.CENTRAL_CACHE_TTL_MS;
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    await cleanCentral();
    await seedCentral();
    a = await makeTenant("a", CLUB_A);
    b = await makeTenant("b", CLUB_B);
    await db.insert(playerIdMapTable).values([
      { tenantId: a, participantId: ANN, playerId: ANN_ID },
      { tenantId: a, participantId: FAY, playerId: 702 },
    ]);
    await db
      .insert(clubHistoryBoundariesTable)
      .values({ tenantId: a, grade: null, startSeason: 2003 });
    const passwordHash = await hashPassword(PASSWORD);
    const cookieFor = async (tenantId: number, username: string) => {
      const [admin] = await db
        .insert(adminsTable)
        .values({ tenantId, username, displayName: username, passwordHash })
        .returning();
      return `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
    };
    cookieA = await cookieFor(a, "owner-a");
    cookieB = await cookieFor(b, "owner-b");
    // KTD8: record the watermark. A first sweep drafts only matches in its recent window,
    // so sweeping long after these matches records the newest one and drafts nothing.
    expect(await sweepCentralMatches(a, new Date("2030-01-01T00:00:00Z"), log)).toEqual({
      seen: 0,
      drafted: 0,
      achievements: 0,
    });
  });

  afterAll(async () => {
    process.env.CENTRAL_CACHE_TTL_MS = prevTtl;
    if (prevTtl === undefined) delete process.env.CENTRAL_CACHE_TTL_MS;
    await purgeTestTenants([a, b]);
    await cleanCentral();
    clearMilestonesCache();
  });

  beforeEach(() => clearMilestonesCache());

  it("refuses anyone who isn't the club's own admin", async () => {
    for (const client of [as(a), as(a, cookieB)]) {
      await client.list().expect(401);
      await client.status().expect(401);
      await client.search().expect(401);
      await client.match(M1).expect(401);
      await client.create(annRuns()).expect(401);
      await client.remove(1).expect(401);
    }
    expect(await rowsOf(a)).toEqual([]);
  });

  it("finds the club's senior matches by date, opponent or round — never junior or other clubs'", async () => {
    const all = (await A().search().expect(200)).body as { matchId: number }[];
    expect(all.map((m) => m.matchId)).toEqual([M1, M5]);
    const byDate = (await A().search("2024-11").expect(200)).body as { matchId: number }[];
    expect(byDate.map((m) => m.matchId)).toEqual([M1]);
    const byOpp = (await A().search("opp 2002").expect(200)).body as { opponent: string }[];
    expect(byOpp).toEqual([expect.objectContaining({ matchId: M5, opponent: "Opp" })]);
    expect((await A().search("nothing-like-this").expect(200)).body).toEqual([]);
    const other = (await B().search().expect(200)).body as { matchId: number }[];
    expect(other.map((m) => m.matchId)).toEqual([M3]);
  });

  it("lists a match's club lines with their current figures", async () => {
    const res = await A().match(M1).expect(200);
    expect(res.body.match).toMatchObject({ matchId: M1, playhqMatchId: phq(M1), grade: "A Grade" });
    type Line = {
      participantId: string;
      displayName: string;
      figures: { field: string; value: number }[];
    };
    const lines = res.body.lines as Line[];
    // Ann (bat + catch) and Fay (catch only); Ross (team sheet only) and Olly
    // (the opposition) have no club line to correct.
    expect(lines.map((l) => l.participantId).sort()).toEqual([ANN, FAY].sort());
    const ann = lines.find((l) => l.participantId === ANN)!;
    expect(ann.displayName).toBe("Ann Able");
    const fig = Object.fromEntries(ann.figures.map((f) => [f.field, f.value]));
    expect(fig).toMatchObject({ runs: 40, catches: 1, wickets: 0 });
    await A().match(M2).expect(404); // junior
    await A().match(M3).expect(404); // another club's
    await B().match(M1).expect(404); // tenant B can't open A's match
  });

  it("rejects a correction for a match not involving the club", async () => {
    const res = await A()
      .create(annRuns({ playhqMatchId: phq(M3), participantId: OLLY, previousValue: 30 }))
      .expect(422);
    expect(res.body.error).toMatch(/isn't one of this club's matches/);
    await A()
      .create(annRuns({ playhqMatchId: "no-such-match" }))
      .expect(422);
    expect(await rowsOf(a)).toEqual([]);
  });

  it("rejects a correction for a GUID with no line for the club", async () => {
    for (const participantId of [OLLY, ROSS, "98610000-0000-4000-8000-000000000999"]) {
      const res = await A()
        .create(annRuns({ participantId, previousValue: 0 }))
        .expect(422);
      expect(res.body.error).toMatch(/no batting, bowling or fielding line/);
    }
    expect(await rowsOf(a)).toEqual([]);
  });

  it("refuses junior and pre-boundary matches, bad fields and a stale previous value", async () => {
    await A()
      .create(annRuns({ playhqMatchId: phq(M2), previousValue: 200, newValue: 190 }))
      .expect(422);
    const early = await A()
      .create(annRuns({ playhqMatchId: phq(M5), previousValue: 20, newValue: 25 }))
      .expect(422);
    expect(early.body.error).toMatch(/boundary/);
    await A()
      .create(annRuns({ field: "overs" }))
      .expect(400);
    await A()
      .create(annRuns({ newValue: 40 }))
      .expect(400);
    const stale = await A()
      .create(annRuns({ previousValue: 41 }))
      .expect(409);
    expect(stale.body).toMatchObject({ centralValue: 40 });
    expect(await rowsOf(a)).toEqual([]);
  });

  let annId: number;

  it("creates a correction, records the actor and changes the public career", async () => {
    expect(await career()).toMatchObject({ totalRuns: 40, totalGames: 1 });
    const res = await A().create(annRuns()).expect(201);
    expect(res.body).toMatchObject({
      field: "runs",
      previousValue: 40,
      newValue: 55,
      status: "active",
      staleReason: null,
      centralValue: 40,
      createdBy: "admin:owner-a",
      note: "Scorer's book says 55",
      displayName: "Ann Able",
      match: expect.objectContaining({ matchId: M1 }),
    });
    annId = res.body.id;
    const [row] = await rowsOf(a);
    expect(row).toMatchObject({ tenantId: a, createdBy: "admin:owner-a", removedAt: null });
    expect(await career()).toMatchObject({ totalRuns: 55 });
    // Central is untouched.
    const central = await db.execute(
      sql`select runs from central.match_batting where match_id = ${M1} and participant_id = ${ANN}`,
    );
    expect((central.rows[0] as { runs: number }).runs).toBe(40);
  });

  it("the match view shows the correction in force on its figure", async () => {
    const res = await A().match(M1).expect(200);
    const ann = (
      res.body.lines as {
        participantId: string;
        figures: { field: string; correction: { id: number; newValue: number } | null }[];
      }[]
    ).find((l) => l.participantId === ANN)!;
    expect(ann.figures.find((f) => f.field === "runs")!.correction).toMatchObject({
      id: annId,
      newValue: 55,
    });
  });

  it("a tenant-2 admin can't create, list or remove tenant-1 corrections", async () => {
    // Create against A's match from B: not B's match.
    await B().create(annRuns()).expect(422);
    // List: B sees none of A's.
    expect((await B().list().expect(200)).body).toEqual([]);
    // Remove: A's id is not found for B, and stays in force.
    await B().remove(annId).expect(404);
    const [row] = (await rowsOf(a)).filter((r) => r.id === annId);
    expect(row!.removedAt).toBeNull();
    expect(await rowsOf(b)).toEqual([]);
    // A's own list still has it.
    const list = (await A().list().expect(200)).body as Correction[];
    expect(list.map((c) => c.id)).toEqual([annId]);
  });

  it("a re-correction of the same figure replaces the one in force", async () => {
    const res = await A()
      .create(annRuns({ newValue: 50 }))
      .expect(201);
    const rows = await rowsOf(a);
    const active = rows.filter((r) => r.removedAt === null);
    expect(active.map((r) => [r.id, r.newValue])).toEqual([[res.body.id, 50]]);
    expect(rows.find((r) => r.id === annId)).toMatchObject({ removedBy: "admin:owner-a" });
    expect(await career()).toMatchObject({ totalRuns: 50 });
    annId = res.body.id;
  });

  it("lists a correction as stale, with U10's reason, when central changes under it", async () => {
    await db.execute(
      sql`update central.match_batting set runs = 42 where match_id = ${M1} and participant_id = ${ANN}`,
    );
    try {
      const list = (await A().list().expect(200)).body as Correction[];
      expect(list).toEqual([
        expect.objectContaining({
          id: annId,
          status: "stale",
          staleReason: "mismatch",
          centralValue: 42,
        }),
      ]);
      // Skipped on read: the career shows central's 42.
      expect(await career()).toMatchObject({ totalRuns: 42 });
    } finally {
      await db.execute(
        sql`update central.match_batting set runs = 40 where match_id = ${M1} and participant_id = ${ANN}`,
      );
    }
    const list = (await A().list().expect(200)).body as Correction[];
    expect(list[0]).toMatchObject({ status: "active", centralValue: 40 });
  });

  it("KTD8: corrections draft no social cards and never move the sweep watermark", async () => {
    const before = await watermark(a);
    expect(before).not.toBeNull();
    const fay = await A()
      .create({
        playhqMatchId: phq(M1),
        participantId: FAY,
        field: "catches",
        previousValue: 1,
        newValue: 3,
      })
      .expect(201);
    await A().remove(fay.body.id).expect(204);
    expect(await watermark(a)).toBe(before);
    const summary = await sweepCentralMatches(a, new Date("2024-11-20T00:00:00Z"), log);
    expect(summary).toMatchObject({ drafted: 0, achievements: 0 });
    const drafts = await db
      .select({ id: socialDraftsTable.id })
      .from(socialDraftsTable)
      .where(eq(socialDraftsTable.tenantId, a));
    expect(drafts).toEqual([]);
  });

  it("removing a correction reverts the figure on read", async () => {
    await A().remove(annId).expect(204);
    expect(await career()).toMatchObject({ totalRuns: 40, totalGames: 1 });
    expect((await A().list().expect(200)).body).toEqual([]);
    const [row] = await db
      .select()
      .from(clubCorrectionsTable)
      .where(and(eq(clubCorrectionsTable.tenantId, a), eq(clubCorrectionsTable.id, annId)));
    expect(row!.removedAt).not.toBeNull();
    expect(row!.removedBy).toBe("admin:owner-a");
    await A().remove(annId).expect(404);
  });

  it("status: a central club's corrections reach its public pages", async () => {
    expect((await A().status().expect(200)).body).toEqual({ appliedToPublicPages: true });
  });

  it("status: a club still on its own native stats is told corrections won't show yet", async () => {
    // Flip tenant A to "still on its own native stats" (like Halls Head today)
    // for this test only: central_club_id is unique, so a second tenant can't
    // share club A.
    await db.update(tenantsTable).set({ readsFromCentral: false }).where(eq(tenantsTable.id, a));
    invalidateTenantConfigCache(a);
    try {
      expect((await A().status().expect(200)).body).toEqual({ appliedToPublicPages: false });
      // Saving is not blocked: the native club's admin can still open matches.
      await A().match(M1).expect(200);
    } finally {
      await db.update(tenantsTable).set({ readsFromCentral: true }).where(eq(tenantsTable.id, a));
      invalidateTenantConfigCache(a);
    }
  });

  it("the club admin sees a private player's real name on the corrections screen", async () => {
    const res = await A().match(M1).expect(200);
    const fay = (
      res.body.lines as { participantId: string; displayName: string | null; isPrivate: boolean }[]
    ).find((l) => l.participantId === FAY)!;
    expect(fay).toMatchObject({ displayName: "Fay Fielder", isPrivate: true });

    const created = await A()
      .create({
        playhqMatchId: phq(M1),
        participantId: FAY,
        field: "catches",
        previousValue: 1,
        newValue: 2,
      })
      .expect(201);
    expect(created.body).toMatchObject({ displayName: "Fay Fielder", isPrivate: true });
    try {
      const list = (await A().list().expect(200)).body as {
        id: number;
        displayName: string | null;
        isPrivate: boolean;
      }[];
      expect(list.find((c) => c.id === created.body.id)).toMatchObject({
        displayName: "Fay Fielder",
        isPrivate: true,
      });

      // Regression: the public player pages still hide her, exactly as before.
      await request(app).get("/api/players/702").set("x-tenant-id", String(a)).expect(404);
      const directory = await request(app)
        .get("/api/players")
        .set("x-tenant-id", String(a))
        .expect(200);
      expect(JSON.stringify(directory.body)).not.toContain("Fielder");
    } finally {
      await A().remove(created.body.id).expect(204);
    }
  });

  it("gives a clear 503 when the corrections table is missing", async () => {
    await db.execute(sql`alter table club_corrections rename to club_corrections_off`);
    try {
      const res = await A().list().expect(503);
      expect(res.body.error).toMatch(/migration 0021/);
      await A().create(annRuns()).expect(503);
      await A().remove(1).expect(503);
      await A().match(M1).expect(503);
      // The public read degrades to plain central numbers (U10), never an error.
      await career();
    } finally {
      await db.execute(sql`alter table club_corrections_off rename to club_corrections`);
      resetClubOverlayTableProbe();
    }
  });
});
