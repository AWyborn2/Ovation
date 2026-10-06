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
  socialDraftsTable,
  socialSettingsTable,
  captionTemplatesTable,
} from "@workspace/db";
import { clearMilestonesCache } from "../lib/milestones-cache";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { sweepCentralMatches } from "../lib/draft-sweep";

/**
 * Duplicate-player suggestions and review (hybrid stats plan U7, R9/R10).
 *
 * Seeds a tiny central club (9711, against 9712) for tenant T1 in one season:
 *
 *   match 1 (round 1): P1 "Chris Phelps" 40, Z "Z Top" 35, M1 + M2 "M Brown",
 *                      R1 "R Reject", J1 "J Private" (private)
 *   match 2 (round 2): P2 "C Phelps" 60, R2 "R Reject", J2 "J Private"
 *   match 3 (round 3): P1 5, Z 35
 *
 * plus an opposition "C Phelps" (O) in every match. So:
 *   - P1/P2 never shared a match -> suggested (AE2), P1 the keeper (2 games);
 *   - M1/M2 shared match 1 -> never suggested (AE3);
 *   - J1/J2 -> never suggested (J1 is private);
 *   - R1/R2 -> suggested, then rejected and never re-suggested;
 *   - O never played for the club -> never a candidate.
 * T2 is a second tenant on its own empty club; its admin must never see or act
 * on T1's suggestions.
 *
 * Real-DB integration (CI's API integration job, where DATABASE_URL and
 * CENTRAL_DATABASE_URL are the same throwaway Postgres). Central rows are
 * written through the TENANT `db` exactly like player-merge-read.test.ts, and
 * only when the database is local: the app itself never writes central.
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
const CLUB = 9711;
const OPP = 9712;
const CLUB_T2 = 9713;
const MATCHES = [971111, 971112, 971113];
const LINE_BASE = 9_710_000;
const G = (n: string) => `97100000-0000-4000-8000-0000000000${n}`;
const P1 = G("a1");
const P2 = G("a2");
const Z = G("b1");
const M1 = G("c1");
const M2 = G("c2");
const R1 = G("d1");
const R2 = G("d2");
const J1 = G("e1");
const J2 = G("e2");
const O = G("ff");
const ALL = [P1, P2, Z, M1, M2, R1, R2, J1, J2, O];
const GRADE = "A Grade";

/** (guid, match index, runs) on the club side. */
const CLUB_LINES: [string, number, number][] = [
  [P1, 0, 40],
  [Z, 0, 35],
  [M1, 0, 10],
  [M2, 0, 10],
  [R1, 0, 5],
  [J1, 0, 1],
  [P2, 1, 60],
  [R2, 1, 5],
  [J2, 1, 3],
  [P1, 2, 5],
  [Z, 2, 35],
];

async function seedCentral(): Promise<void> {
  for (const [id, name] of [
    [CLUB, "Dup Test CC"],
    [OPP, "Dup Opp CC"],
    [CLUB_T2, "Dup Test Two CC"],
  ] as [number, string][]) {
    await db.execute(sql`
      insert into central.clubs (club_id, name, short_name, primary_colour, parent_club_id, lineage_role, active_from, active_to)
      values (${id}, ${name}, ${`D${id}`}, '#123456', null, null, '2002/03', null)
    `);
  }
  const players: [string, string, number][] = [
    [P1, "Chris Phelps", 0],
    [P2, "C Phelps", 0],
    [Z, "Z Top", 0],
    [M1, "M Brown", 0],
    [M2, "M Brown", 0],
    [R1, "R Reject", 0],
    [R2, "R Reject", 0],
    [J1, "J Private", 1],
    [J2, "J Private", 0],
    [O, "C Phelps", 0],
  ];
  for (const [id, name, priv] of players) {
    await db.execute(sql`
      insert into central.players (participant_id, display_name, is_private, current_club_id, first_season, last_season, matches)
      values (${id}, ${name}, ${priv}, ${CLUB}, '2024/25', '2024/25', 1)
    `);
  }
  for (const [i, m] of MATCHES.entries()) {
    await db.execute(sql`
      insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round, match_date, venue,
        status, home_club_id, away_club_id, home_team, away_team, home_score, away_score, toss_winner_club_id, winner_club_id, result_text)
      values (${m}, ${`dup-test-${m}`}, '2024/25', ${GRADE}, 'grade-a', 'One Day', ${String(i + 1)}, ${`2024-11-0${i + 1}`},
        'Dup Oval', 'Completed', ${CLUB}, ${OPP}, 'Dup Test CC', 'Dup Opp CC', '5/150', '10/120', ${CLUB}, ${CLUB},
        'Dup Test CC won')
    `);
  }
  const lines: { guid: string; match: number; runs: number; club: number }[] = [
    ...MATCHES.map((m) => ({ guid: O, match: m, runs: 12, club: OPP })),
    ...CLUB_LINES.map(([guid, i, runs]) => ({ guid, match: MATCHES[i]!, runs, club: CLUB })),
  ];
  let id = LINE_BASE;
  for (const { guid, match, runs, club } of lines) {
    const home = club === CLUB;
    await db.execute(sql`
      insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order, participant_id, player_name,
        runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
      values (${id++}, ${match}, ${home ? 1 : 2}, ${club}, 'x', 1, ${guid}, 'x',
        ${runs}, ${runs}, 0, 0, 100, 'b Bowler', 'bowled', null)
    `);
    await db.execute(sql`
      insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
      values (${id++}, ${match}, ${club}, 'x', ${guid}, 'x')
    `);
  }
}

async function cleanCentral(): Promise<void> {
  const inList = (xs: (number | string)[]) =>
    sql.join(
      xs.map((x) => sql`${x}`),
      sql`, `,
    );
  const range = sql`id >= ${LINE_BASE} and id < ${LINE_BASE + 10_000}`;
  await db.execute(sql`delete from central.match_batting where ${range}`);
  await db.execute(sql`delete from central.match_rosters where ${range}`);
  await db.execute(sql`delete from central.matches where match_id in (${inList(MATCHES)})`);
  await db.execute(sql`delete from central.players where participant_id in (${inList(ALL)})`);
  await db.execute(
    sql`delete from central.clubs where club_id in (${inList([CLUB, OPP, CLUB_T2])})`,
  );
}

type Evidence = {
  participantId: string;
  displayName: string | null;
  seasons: string[];
  grades: string[];
  games: number;
};
type Pair = {
  participantId: string;
  keeperParticipantId: string;
  status: string;
  duplicate: Evidence;
  keeper: Evidence;
  seasonGap: number | null;
  sharedGrades: string[];
};
type Review = { suggested: Pair[]; confirmed: Pair[]; rejected: Pair[] };

const pairOf = (list: Pair[], a: string, b: string) =>
  list.find(
    (p) =>
      (p.participantId === a && p.keeperParticipantId === b) ||
      (p.participantId === b && p.keeperParticipantId === a),
  );

describe.skipIf(!isLocalDb)("duplicate-player suggestions and review", () => {
  const tenantIds: number[] = [];
  const adminIds: number[] = [];
  let t1: number;
  let t2: number;
  let cookieT1: string;
  let cookieT2: string;
  const idOf: Record<string, number> = {};
  let prevTtl: string | undefined;
  const log = { error: () => {}, warn: () => {}, info: () => {} };

  async function makeTenant(label: string, club: number): Promise<number> {
    const [t] = await db
      .insert(tenantsTable)
      .values({
        slug: `dup-${label}-${STAMP}`,
        centralClubId: club,
        name: `Dup ${label}`,
        readsFromCentral: true,
      })
      .returning();
    tenantIds.push(t.id);
    return t.id;
  }

  async function makeAdmin(tenantId: number, label: string): Promise<string> {
    const [admin] = await db
      .insert(adminsTable)
      .values({
        tenantId,
        username: `dup_admin_${label}_${STAMP}`,
        displayName: `Dup Admin ${label}`,
        passwordHash: "x",
      })
      .returning();
    adminIds.push(admin.id);
    return `${SESSION_COOKIE}=${encodeSession({ adminId: admin.id, issuedAt: Date.now() })}`;
  }

  const review = async (tenantId: number, cookie: string): Promise<Review> =>
    (
      await request(app)
        .get("/api/player-curation/duplicates")
        .set("x-tenant-id", String(tenantId))
        .set("Cookie", cookie)
        .expect(200)
    ).body as Review;

  const act = (tenantId: number, cookie: string, participantId: string, action: string) =>
    request(app)
      .post(`/api/player-curation/duplicates/${participantId}/review`)
      .set("x-tenant-id", String(tenantId))
      .set("Cookie", cookie)
      .send({ action });

  const t1Rows = () =>
    db.select().from(playerCurationTable).where(eq(playerCurationTable.tenantId, t1));

  type DirRow = { id: number; totalRuns: number; totalGames: number };
  const directory = async (): Promise<DirRow[]> => {
    const res = await request(app)
      .get("/api/players?limit=100")
      .set("x-tenant-id", String(t1))
      .expect(200);
    const mine = new Set(Object.values(idOf));
    return (res.body.players as DirRow[]).filter((p) => mine.has(p.id));
  };

  beforeAll(async () => {
    process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-duplicates";
    prevTtl = process.env.CENTRAL_CACHE_TTL_MS;
    process.env.CENTRAL_CACHE_TTL_MS = "0";
    await cleanCentral();
    await seedCentral();

    t1 = await makeTenant("t1", CLUB);
    t2 = await makeTenant("t2", CLUB_T2);
    cookieT1 = await makeAdmin(t1, "t1");
    cookieT2 = await makeAdmin(t2, "t2");

    for (const g of ALL.filter((x) => x !== O)) {
      const [p] = await db
        .insert(playersTable)
        .values({ surname: `Dupsuggest${STAMP}`, givenName: g.slice(-2) })
        .returning();
      idOf[g] = p.id;
    }
    await db
      .insert(playerIdMapTable)
      .values(
        Object.entries(idOf).map(([g, playerId]) => ({ tenantId: t1, participantId: g, playerId })),
      );
  });

  afterAll(async () => {
    await db.delete(socialDraftsTable).where(inArray(socialDraftsTable.tenantId, tenantIds));
    await db
      .delete(captionTemplatesTable)
      .where(inArray(captionTemplatesTable.tenantId, tenantIds));
    await db.delete(socialSettingsTable).where(inArray(socialSettingsTable.tenantId, tenantIds));
    await db.delete(adminsTable).where(inArray(adminsTable.id, adminIds));
    await db.delete(playerCurationTable).where(inArray(playerCurationTable.tenantId, tenantIds));
    await db.delete(playerIdMapTable).where(inArray(playerIdMapTable.tenantId, tenantIds));
    await db.delete(tenantsTable).where(inArray(tenantsTable.id, tenantIds));
    await db.delete(playersTable).where(inArray(playersTable.id, Object.values(idOf)));
    await cleanCentral();
    if (prevTtl === undefined) delete process.env.CENTRAL_CACHE_TTL_MS;
    else process.env.CENTRAL_CACHE_TTL_MS = prevTtl;
    clearMilestonesCache();
  });

  beforeEach(() => clearMilestonesCache());

  it("is admin-only", async () => {
    await request(app)
      .get("/api/player-curation/duplicates")
      .set("x-tenant-id", String(t1))
      .expect(401);
    await request(app)
      .post(`/api/player-curation/duplicates/${P2}/review`)
      .set("x-tenant-id", String(t1))
      .send({ action: "confirm" })
      .expect(401);
  });

  it("AE2: suggests the 'C Phelps' pair with each GUID's evidence", async () => {
    const { suggested } = await review(t1, cookieT1);
    const pair = pairOf(suggested, P1, P2);
    expect(pair).toMatchObject({
      participantId: P2,
      keeperParticipantId: P1,
      status: "suggested",
      keeper: {
        participantId: P1,
        displayName: "Chris Phelps",
        games: 2,
        seasons: ["2024/25"],
        grades: [GRADE],
      },
      duplicate: {
        participantId: P2,
        displayName: "C Phelps",
        games: 1,
        seasons: ["2024/25"],
        grades: [GRADE],
      },
      seasonGap: 0,
      sharedGrades: [GRADE],
    });
    // The rejected-later pair is suggested too.
    expect(pairOf(suggested, R1, R2)).toBeDefined();
  });

  it("AE3: never suggests a pair that shared a match, a private GUID, or the opposition", async () => {
    const { suggested } = await review(t1, cookieT1);
    expect(pairOf(suggested, M1, M2)).toBeUndefined();
    expect(suggested.some((p) => [J1, J2].includes(p.participantId))).toBe(false);
    expect(suggested.some((p) => [J1, J2].includes(p.keeperParticipantId))).toBe(false);
    expect(suggested.some((p) => p.participantId === O || p.keeperParticipantId === O)).toBe(false);
  });

  it("persists suggestions once (running again adds nothing)", async () => {
    await review(t1, cookieT1);
    const before = await t1Rows();
    await review(t1, cookieT1);
    const after = await t1Rows();
    expect(after.length).toBe(before.length);
    expect(before.every((r) => r.mergeStatus === "suggested")).toBe(true);
    expect(before.map((r) => r.participantId).sort()).toEqual([P2, R2].sort());
  });

  it("a tenant-2 admin can't see or act on tenant 1's suggestions", async () => {
    const asT2 = await review(t2, cookieT2);
    expect([...asT2.suggested, ...asT2.confirmed, ...asT2.rejected]).toEqual([]);
    await act(t2, cookieT2, P2, "confirm").expect(404);
    // Tenant 1's admin cookie is refused on tenant 2 (or sees nothing of T1's).
    const cross = await request(app)
      .get("/api/player-curation/duplicates")
      .set("x-tenant-id", String(t2))
      .set("Cookie", cookieT1);
    if (cross.status === 200) {
      expect(pairOf((cross.body as Review).suggested, P1, P2)).toBeUndefined();
    } else {
      expect(cross.status).toBe(401);
    }
    const [row] = (await t1Rows()).filter((r) => r.participantId === P2);
    expect(row?.mergeStatus).toBe("suggested");
  });

  describe("confirm, undo, reject and reopen", () => {
    it("KTD8: recording the sweep watermark first", async () => {
      // A first sweep drafts only matches in its recent window, so sweeping long after these
      // matches records the newest one and drafts nothing.
      const first = await sweepCentralMatches(t1, new Date("2030-01-01T00:00:00Z"), log);
      expect(first).toEqual({ seen: 0, drafted: 0, achievements: 0 });
    });

    it("confirming folds the two careers into one", async () => {
      const before = await directory();
      expect(before.find((r) => r.id === idOf[P1])).toMatchObject({
        totalRuns: 45,
        totalGames: 2,
      });
      expect(before.find((r) => r.id === idOf[P2])).toMatchObject({ totalRuns: 60 });

      const res = await act(t1, cookieT1, P2, "confirm").expect(200);
      expect(res.body).toMatchObject({ participantId: P2, status: "confirmed" });

      const after = await directory();
      expect(after.find((r) => r.id === idOf[P1])).toMatchObject({
        totalRuns: 105,
        totalGames: 3,
      });
      expect(after.find((r) => r.id === idOf[P2])).toBeUndefined();

      const { confirmed, suggested } = await review(t1, cookieT1);
      expect(pairOf(confirmed, P1, P2)).toBeDefined();
      expect(pairOf(suggested, P1, P2)).toBeUndefined();
    });

    it("KTD8: confirming drafts no historical cards, and the next sweep drafts nothing", async () => {
      const summary = await sweepCentralMatches(t1, new Date("2024-11-10T00:00:00Z"), log);
      expect(summary).toMatchObject({ drafted: 0, achievements: 0 });
      const drafts = await db
        .select({ id: socialDraftsTable.id })
        .from(socialDraftsTable)
        .where(eq(socialDraftsTable.tenantId, t1));
      expect(drafts).toEqual([]);
    });

    it("social prefill: the confirmed pair tops the club season leaders as one player", async () => {
      const res = await request(app)
        .get("/api/social-prefill/club-season-totals?season=2024")
        .set("x-tenant-id", String(t1))
        .set("Cookie", cookieT1)
        .expect(200);
      const grade = (
        res.body as { gradeLabel: string; topRunScorer: { playerName: string; value: number } }[]
      ).find((g) => g.gradeLabel === GRADE);
      // Separately: Z Top 70 beats P2 60 and P1 45; folded, Phelps has 105.
      expect(grade?.topRunScorer).toEqual({ playerName: "Chris Phelps", value: 105 });
    });

    it("social prefill: the weekend wrap names the merged-away GUID as the keeper", async () => {
      const res = await request(app)
        .get("/api/social-prefill/weekend-wrap?season=2024&round=2")
        .set("x-tenant-id", String(t1))
        .set("Cookie", cookieT1)
        .expect(200);
      expect(res.body.matches[0].performers).toBe("Chris Phelps 60");
      // The recorded winner decides the outcome, not the result sentence ("Dup Test CC won").
      expect(res.body.matches[0].outcome).toBe("WON");
    });

    it("a confirmed pair can't be rejected or reopened (only undone)", async () => {
      await act(t1, cookieT1, P2, "reject").expect(409);
      await act(t1, cookieT1, P2, "reopen").expect(409);
    });

    it("undo splits the careers again and returns the pair to suggested", async () => {
      const res = await act(t1, cookieT1, P2, "undo").expect(200);
      expect(res.body).toMatchObject({ status: "suggested" });
      const rows = await directory();
      expect(rows.find((r) => r.id === idOf[P1])).toMatchObject({ totalRuns: 45 });
      expect(rows.find((r) => r.id === idOf[P2])).toMatchObject({ totalRuns: 60 });

      const prefill = await request(app)
        .get("/api/social-prefill/club-season-totals?season=2024")
        .set("x-tenant-id", String(t1))
        .set("Cookie", cookieT1)
        .expect(200);
      const grade = (
        prefill.body as { gradeLabel: string; topRunScorer: { playerName: string } }[]
      ).find((g) => g.gradeLabel === GRADE);
      expect(grade?.topRunScorer).toMatchObject({ playerName: "Z Top", value: 70 });
    });

    it("a rejected pair is not re-suggested on the next run", async () => {
      const rPair = pairOf((await review(t1, cookieT1)).suggested, R1, R2)!;
      await act(t1, cookieT1, rPair.participantId, "reject").expect(200);

      const next = await review(t1, cookieT1);
      expect(pairOf(next.suggested, R1, R2)).toBeUndefined();
      expect(pairOf(next.rejected, R1, R2)).toMatchObject({ status: "rejected" });
      // Still exactly one row for the pair — the engine didn't add the reverse.
      const rows = (await t1Rows()).filter((r) => [R1, R2].includes(r.participantId));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.mergeStatus).toBe("rejected");
      // A rejected pair can't be confirmed without reopening it first.
      await act(t1, cookieT1, rPair.participantId, "confirm").expect(409);
    });

    it("reopen returns a rejected pair to suggested", async () => {
      const rPair = pairOf((await review(t1, cookieT1)).rejected, R1, R2)!;
      const res = await act(t1, cookieT1, rPair.participantId, "reopen").expect(200);
      expect(res.body).toMatchObject({ status: "suggested" });
      expect(pairOf((await review(t1, cookieT1)).suggested, R1, R2)).toBeDefined();
    });

    it("rejects an unknown action and a GUID with no merge row", async () => {
      await act(t1, cookieT1, P2, "explode").expect(400);
      await act(t1, cookieT1, Z, "confirm").expect(404);
    });
  });
});
