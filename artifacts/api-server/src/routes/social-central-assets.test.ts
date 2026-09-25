/**
 * Social assets from association data for every club: a central-data club's
 * season recap and round-up, the past-match backfill, the prefill reads, and
 * tenant isolation. Real-DB integration test (needs DATABASE_URL, and
 * CENTRAL_DATABASE_URL pointing at the same CI DB).
 *
 * The test writes its own rows into `central.*` under club ids no other suite
 * uses (test files run one at a time), and removes them afterwards.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, like, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playerIdMapTable,
  premiershipsTable,
  socialSettingsTable,
  socialDraftsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { invalidateTenantConfigCache } from "../lib/tenant";
import { runDraftSweep } from "../lib/draft-sweep";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";

// Central club ids no other suite uses (tenants.central_club_id is unique).
const CLUB = 97651;
const OPP = 97652;
const OTHER_CLUB = 97653;
const BASE = 9_500_000 + (Date.now() % 50_000) * 10;
const LINE_BASE = BASE * 10;
const STAMP = Date.now();
const WATERMARK = 4242;

// Participants: a mapped star, an unmapped bowler, a private player who would
// top the runs, and a junior who only played a junior grade.
const G_STAR = `9765${STAMP}`.slice(0, 8) + "-0000-4000-8000-000000000001";
const G_UNMAPPED = `9765${STAMP}`.slice(0, 8) + "-0000-4000-8000-000000000002";
const G_PRIVATE = `9765${STAMP}`.slice(0, 8) + "-0000-4000-8000-000000000003";
const G_JUNIOR = `9765${STAMP}`.slice(0, 8) + "-0000-4000-8000-000000000004";
// Played juniors last season (700 runs) and 300 senior runs this season: only
// the junior runs would take them past 1000 career runs.
const G_CROSSOVER = `9765${STAMP}`.slice(0, 8) + "-0000-4000-8000-000000000005";
const GUIDS = [G_STAR, G_UNMAPPED, G_PRIVATE, G_JUNIOR, G_CROSSOVER];

let tenantId: number;
let otherTenantId: number;
let cookie: string;
let otherCookie: string;
let lineId = LINE_BASE;

const SENIOR = [BASE + 1, BASE + 2, BASE + 3];
const JUNIOR_MATCH = BASE + 4;
const LAST_SEASON = BASE + 5;
const OTHER_CLUB_MATCH = BASE + 6;
const JUNIOR_LAST_SEASON = BASE + 7;

async function centralMatch(
  id: number,
  opts: { grade?: string; season?: string; round?: string; home?: number; away?: number } = {},
) {
  await db.execute(sql`
    insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round,
      match_date, venue, status, home_club_id, away_club_id, home_team, away_team, home_score,
      away_score, toss_winner_club_id, winner_club_id, result_text)
    values (${id}, ${`assets-${id}`}, ${opts.season ?? "2024/25"}, ${opts.grade ?? "A Grade"}, 'g',
      'One Day', ${opts.round ?? "1"}, '2024-11-16', 'Assets Oval', 'Completed',
      ${opts.home ?? CLUB}, ${opts.away ?? OPP}, 'Assets CC', 'Rivals CC', '7/210', '10/150',
      ${opts.home ?? CLUB}, ${opts.home ?? CLUB}, 'Assets CC won')
  `);
}

async function bat(matchId: number, guid: string, name: string, runs: number, club = CLUB) {
  await db.execute(sql`
    insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order,
      participant_id, player_name, runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
    values (${lineId++}, ${matchId}, 1, ${club}, 'Assets CC', 1, ${guid}, ${name},
      ${runs}, 90, 9, 2, 97.7, 'b Bowler', 'bowled', null)
  `);
}

async function bowl(matchId: number, guid: string, name: string, wickets: number, runs: number) {
  await db.execute(sql`
    insert into central.match_bowling (id, match_id, innings, club_id, team_name, participant_id,
      player_name, overs, maidens, runs, wickets, economy, wides, no_balls)
    values (${lineId++}, ${matchId}, 2, ${CLUB}, 'Assets CC', ${guid}, ${name}, 8, 1, ${runs}, ${wickets}, 3.75, 0, 0)
  `);
}

async function admin(tid: number, suffix: string): Promise<string> {
  const [a] = await db
    .insert(adminsTable)
    .values({
      tenantId: tid,
      username: `assets_${suffix}_${STAMP}`,
      displayName: "Assets Admin",
      passwordHash: "x",
    })
    .returning();
  return `${SESSION_COOKIE}=${encodeSession({ adminId: a.id, issuedAt: Date.now() })}`;
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-assets";
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `assets-${STAMP}`,
      centralClubId: CLUB,
      readsFromCentral: true,
      name: "Assets Club",
      plan: "pro",
    })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({
      slug: `assets-other-${STAMP}`,
      centralClubId: OTHER_CLUB,
      readsFromCentral: true,
      name: "Other Assets Club",
      plan: "pro",
    })
    .returning();
  otherTenantId = o.id;
  invalidateTenantConfigCache(tenantId);
  invalidateTenantConfigCache(otherTenantId);
  cookie = await admin(tenantId, "a");
  otherCookie = await admin(otherTenantId, "b");

  await db.insert(playerIdMapTable).values([
    { tenantId, participantId: G_STAR, playerId: 41 },
    { tenantId, participantId: G_PRIVATE, playerId: 43 },
    { tenantId, participantId: G_JUNIOR, playerId: 44 },
  ]);
  await db
    .insert(socialSettingsTable)
    .values([{ tenantId, centralSweepWatermark: WATERMARK }, { tenantId: otherTenantId }]);
  await db.insert(premiershipsTable).values({
    tenantId,
    year: 2025,
    grade: "A Grade",
    competition: "Assets Shield",
    matchDate: "2025-03-15",
    result: "Won by 40 runs",
    mom: "R Star",
  });

  await db.execute(sql`
    insert into central.players (participant_id, display_name, is_private)
    values (${G_STAR}, 'R Star', 0), (${G_UNMAPPED}, 'U Bowler', 0),
      (${G_PRIVATE}, 'P Hidden', 1), (${G_JUNIOR}, 'J Kid', 0),
      (${G_CROSSOVER}, 'C Crossover', 0)
  `);

  for (const [i, id] of SENIOR.entries()) {
    await centralMatch(id, { round: String(i + 1) });
    await bat(id, G_STAR, "R Star", [400, 400, 250][i]);
    await bat(id, G_PRIVATE, "P Hidden", 500);
    await bowl(id, G_UNMAPPED, "U Bowler", i === 0 ? 6 : 3, i === 0 ? 20 : 15);
    await bowl(id, G_STAR, "R Star", 1, 30);
  }
  await db.execute(sql`
    insert into central.fielding (id, match_id, club_id, participant_id, player_name, kind)
    values (${lineId++}, ${SENIOR[0]}, ${CLUB}, ${G_STAR}, 'R Star', 'caught'),
      (${lineId++}, ${SENIOR[1]}, ${CLUB}, ${G_STAR}, 'R Star', 'caught')
  `);
  // A junior game the same season — huge figures that must never surface.
  await centralMatch(JUNIOR_MATCH, { grade: "Under 15 Boys", round: "9" });
  await bat(JUNIOR_MATCH, G_JUNIOR, "J Kid", 2000);
  await bowl(JUNIOR_MATCH, G_JUNIOR, "J Kid", 9, 5);
  // Last season, and another club's match.
  await centralMatch(LAST_SEASON, { season: "2023/24" });
  await centralMatch(OTHER_CLUB_MATCH, { home: OTHER_CLUB, away: OPP });
  // Juniors-isolation crossover: junior runs last season, senior runs this one.
  await centralMatch(JUNIOR_LAST_SEASON, { grade: "Under 15 Boys", season: "2023/24" });
  await bat(JUNIOR_LAST_SEASON, G_CROSSOVER, "C Crossover", 700);
  await bat(SENIOR[0], G_CROSSOVER, "C Crossover", 300);
});

/** Run every cleanup step even if an earlier one (or the suite) failed. */
async function bestEffort(steps: Array<() => Promise<unknown>>): Promise<void> {
  for (const step of steps) {
    try {
      await step();
    } catch (err) {
      console.warn("social-central-assets cleanup step failed", err);
    }
  }
}

afterAll(async () => {
  const lo = BASE;
  const hi = BASE + 10;
  await bestEffort([
    () =>
      db.execute(sql`delete from central.fielding where match_id >= ${lo} and match_id < ${hi}`),
    () =>
      db.execute(
        sql`delete from central.match_batting where match_id >= ${lo} and match_id < ${hi}`,
      ),
    () =>
      db.execute(
        sql`delete from central.match_bowling where match_id >= ${lo} and match_id < ${hi}`,
      ),
    () => db.execute(sql`delete from central.matches where match_id >= ${lo} and match_id < ${hi}`),
    () =>
      db.execute(sql`delete from central.players where participant_id = any(${sql.param(GUIDS)})`),
    // Every app row the suite's code paths created for its tenants (settings
    // seeded lazily — milestone_board_settings, caption templates — drafts,
    // revisions, tracked links, admins, …), then the tenants themselves.
    () => purgeTestTenants([tenantId, otherTenantId]),
  ]);
});

const post = (path: string, body: object, as: "a" | "b" = "a") =>
  request(app)
    .post(`/api${path}`)
    .set("Cookie", as === "a" ? cookie : otherCookie)
    .set("x-tenant-id", String(as === "a" ? tenantId : otherTenantId))
    .send(body);

const get = (path: string, as: "a" | "b" = "a") =>
  request(app)
    .get(`/api${path}`)
    .set("Cookie", as === "a" ? cookie : otherCookie)
    .set("x-tenant-id", String(as === "a" ? tenantId : otherTenantId));

type Draft = { sourceKey: string; appPath: string; cardInput: Record<string, unknown> };
const byCategory = (drafts: Draft[], category: string) =>
  drafts.find((d) => d.cardInput.category === category);

function assertNoLeaks(drafts: Draft[]) {
  const text = JSON.stringify(drafts);
  expect(text).not.toContain("P Hidden"); // private
  expect(text).not.toContain("J Kid"); // junior
  for (const g of GUIDS) expect(text).not.toContain(g); // GUIDs never reach a card
}

describe("central season round-up", () => {
  it("drafts the round-up from the club's senior scorecards", async () => {
    const res = await post("/social-roundups", { grade: "A Grade", season: 2024 });
    expect(res.status).toBe(200);
    const drafts = res.body as Draft[];
    assertNoLeaks(drafts);
    expect(drafts.map((d) => d.sourceKey).sort()).toEqual(
      [
        "roundup:2024:A Grade:3:Best Bowling",
        "roundup:2024:A Grade:3:Best Innings",
        "roundup:2024:A Grade:3:Dismissals",
        "roundup:2024:A Grade:3:Runs",
        "roundup:2024:A Grade:3:Wickets",
      ].sort(),
    );
    expect(byCategory(drafts, "Runs")).toMatchObject({
      appPath: "/players/41",
      cardInput: { playerName: "R Star", value: 1050 },
    });
    // Unmapped player: the card stays, the link drops to the players list.
    expect(byCategory(drafts, "Wickets")).toMatchObject({
      appPath: "/players",
      cardInput: { playerName: "U Bowler", value: 12 },
    });
    expect(byCategory(drafts, "Best Bowling")?.cardInput.value).toBe("6/20");
    expect(byCategory(drafts, "Dismissals")?.cardInput.value).toBe(2);
  });

  it("a repeat run refreshes the same drafts instead of adding more", async () => {
    await post("/social-roundups", { grade: "A Grade", season: 2024 });
    const rows = await db
      .select()
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          like(socialDraftsTable.sourceKey, "roundup:%"),
        ),
      );
    expect(rows).toHaveLength(5);
  });
});

describe("central season recap", () => {
  it("drafts champions, the milestone crossed and the premiership", async () => {
    const res = await post("/social-recaps", { grade: "A Grade", season: 2024 });
    expect(res.status).toBe(200);
    const drafts = res.body as Draft[];
    assertNoLeaks(drafts);
    const keys = drafts.map((d) => d.sourceKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        "recap:2024:A Grade:Champion Batsman",
        "recap:2024:A Grade:Champion Bowler",
        "recap:2024:A Grade:Most Dismissals",
        "recap:2024:A Grade:milestone:R Star:1000 Runs",
        "recap:2024:A Grade:premiership",
      ]),
    );
    expect(drafts.find((d) => d.sourceKey.endsWith("Champion Batsman"))?.appPath).toBe(
      "/players/41",
    );
  });

  it("junior runs never push a player over a recap milestone", async () => {
    const res = await post("/social-recaps", { grade: "A Grade", season: 2024 });
    const drafts = res.body as Draft[];
    expect(drafts.filter((d) => d.cardInput.kind === "milestone")).toEqual([
      expect.objectContaining({ sourceKey: "recap:2024:A Grade:milestone:R Star:1000 Runs" }),
    ]);
    expect(JSON.stringify(drafts)).not.toContain("C Crossover");
  });

  it("a junior grade produces no recap at all", async () => {
    const res = await post("/social-recaps", { grade: "Under 15 Boys", season: 2024 });
    expect(res.status).toBe(200);
    expect((res.body as Draft[]).filter((d) => d.cardInput.kind === "gradeLeader")).toHaveLength(0);
  });
});

describe("POST /social-drafts/backfill-matches", () => {
  const matchDrafts = async (tid: number) =>
    db
      .select()
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tid),
          like(socialDraftsTable.sourceKey, "matchSummary:central:%"),
        ),
      );

  it("400s without a season or with more than 60 match ids", async () => {
    expect((await post("/social-drafts/backfill-matches", {})).status).toBe(400);
    const tooMany = Array.from({ length: 61 }, (_, i) => i + 1);
    expect(
      (await post("/social-drafts/backfill-matches", { season: 2024, matchIds: tooMany })).status,
    ).toBe(400);
  });

  it("drafts the season's senior matches, never the junior one", async () => {
    const res = await post("/social-drafts/backfill-matches", { season: 2024 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ considered: 3, drafted: 3, capped: false });
    const keys = (await matchDrafts(tenantId)).map((d) => d.sourceKey).sort();
    expect(keys).toEqual(SENIOR.map((id) => `matchSummary:central:${id}`).sort());
  });

  it("a re-run drafts nothing new", async () => {
    const res = await post("/social-drafts/backfill-matches", { season: 2024, grade: "A Grade" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ considered: 3, drafted: 0 });
    expect(await matchDrafts(tenantId)).toHaveLength(3);
  });

  it("never moves the sweep watermark", async () => {
    const [s] = await db
      .select()
      .from(socialSettingsTable)
      .where(eq(socialSettingsTable.tenantId, tenantId));
    expect(s.centralSweepWatermark).toBe(WATERMARK);
  });

  it("drafts only the chosen matches, and never another club's", async () => {
    const res = await post("/social-drafts/backfill-matches", {
      season: 2024,
      matchIds: [SENIOR[0], OTHER_CLUB_MATCH, JUNIOR_MATCH],
    });
    expect(res.body).toMatchObject({ considered: 1, drafted: 0 });
  });
});

describe("prefill reads serve central data", () => {
  it("lists the club's own senior grades (the match picker's grade list)", async () => {
    const res = await get("/grades");
    expect(res.status).toBe(200);
    const grades = (res.body as { grade: string }[]).map((g) => g.grade);
    expect(grades).toContain("A Grade");
    expect(grades.join(" ")).not.toMatch(/Under 15/);
  });

  it("lists the club's matches for a grade and season", async () => {
    const res = await get("/matches?grade=A%20Grade&season=2024");
    expect(res.status).toBe(200);
    expect((res.body as { id: number }[]).map((m) => m.id).sort()).toEqual([...SENIOR].sort());
  });

  it("serves career milestones (the milestone prefill)", async () => {
    const res = await get("/milestones");
    expect(res.status).toBe(200);
    const items = res.body.items as {
      kind: string;
      playerName: string;
      boardKey: string | null;
      threshold: number | null;
      playerId: number;
    }[];
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "career",
          playerName: "R Star",
          boardKey: "runs",
          threshold: 1000,
          playerId: 41,
        }),
      ]),
    );
    expect(JSON.stringify(items)).not.toContain("P Hidden");
  });

  it("serves the club's premierships (the premiership prefill)", async () => {
    const res = await get("/premierships");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({ grade: "A Grade", competition: "Assets Shield", year: 2025 }),
    ]);
  });
});

describe("tenant isolation", () => {
  it("another club's recap and backfill never draft this club's data", async () => {
    const recap = await post("/social-recaps", { grade: "A Grade", season: 2024 }, "b");
    expect(recap.status).toBe(200);
    expect(recap.body).toEqual([]);
    const backfill = await post(
      "/social-drafts/backfill-matches",
      { season: 2024, matchIds: SENIOR },
      "b",
    );
    expect(backfill.body).toMatchObject({ considered: 0, drafted: 0 });
    expect(
      await db
        .select()
        .from(socialDraftsTable)
        .where(eq(socialDraftsTable.tenantId, otherTenantId)),
    ).toHaveLength(0);
  });

  it("the other club's queue shows none of this club's drafts", async () => {
    const res = await get("/social-drafts", "b");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// Runs last: it advances the watermark the backfill tests assert on.
describe("scheduled sweep: weekly round-up for a central club", () => {
  const log = { error: () => {}, warn: () => {}, info: () => {} };

  it("drafts the round-up for a grade that just had a new match, when round-ups are on", async () => {
    await db
      .delete(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          like(socialDraftsTable.sourceKey, "roundup:%"),
        ),
      );
    await db
      .update(socialSettingsTable)
      .set({ engineRoundUp: true })
      .where(eq(socialSettingsTable.tenantId, tenantId));

    await runDraftSweep(
      tenantId,
      { kind: "scheduled", now: new Date("2024-11-20T10:00:00Z") },
      log,
    );

    const roundUps = await db
      .select()
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          like(socialDraftsTable.sourceKey, "roundup:%"),
        ),
      );
    expect(roundUps.map((d) => d.sourceKey)).toEqual(
      expect.arrayContaining(["roundup:2024:A Grade:3:Runs", "roundup:2024:A Grade:3:Wickets"]),
    );
    expect(JSON.stringify(roundUps)).not.toContain("P Hidden");
    expect(JSON.stringify(roundUps)).not.toContain("J Kid");
  });
});
