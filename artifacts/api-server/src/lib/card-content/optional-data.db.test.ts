/**
 * ADR-010 P5, against a real database: the Match Day optional data fields
 * through the Weekend Carousel route, and the central helpers behind them.
 *
 * - Ladder positions (T5.1): a consistency test. The fixture's two teams'
 *   places come from PlayHQ's season ladder (`playhq.ladders`), equal to the
 *   rows `playhqGradeLadderUncached` reads; a ladder that hasn't caught up
 *   with the club's completed matches, or was fetched too long ago, hides.
 * - Last meeting (T5.2): from `central.matches`, both orientations, the same
 *   app grade, finished matches only, `before` exclusive, and lineage aware
 *   (a meeting under the club's earlier id counts).
 * - Milestone watch (T5.3): the published side's senior club careers against
 *   the milestone board's tiers; fill-ins and private players never named.
 *
 * Real-DB integration test (needs DATABASE_URL, and CENTRAL_DATABASE_URL
 * pointing at the same CI DB). It writes its own `central.*` and `playhq.*`
 * rows under ids no other suite uses, and removes them afterwards.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import {
  db,
  adminsTable,
  fixturesTable,
  teamListsTable,
  tenantsTable,
  type FixtureRow,
} from "@workspace/db";
import app from "../../app";
import { encodeSession, SESSION_COOKIE } from "../auth";
import { invalidateTenantConfigCache } from "../tenant";
import { clearCentralQueriesCache } from "@workspace/db/central-queries";

const SQL_DIR = path.resolve(__dirname, "../../../../../scripts/sql");
const CLUB = 9971;
const OPP = 9972;
// The club's earlier id: CLUB was renamed from it (`parent_club_id`).
const OLD = 9973;
const BASE = 9_700_000 + (Date.now() % 50_000) * 10;
const STAMP = Date.now();
// The ladder is read against the real clock in the route, so it was fetched an hour ago.
const NOW = new Date();
const FETCHED = new Date(NOW.getTime() - 60 * 60 * 1000);

const ORG = randomUUID();
const RIVAL_ORG = randomUUID();
const GRADE = randomUUID();
const CLUB_TEAM = randomUUID();
const OPP_TEAM = randomUUID();
const PHQ_FIXTURE = randomUUID();
const PHQ_DONE = randomUUID();

// Jack is 12 short of 1,000 club runs; the private player and the fill-in are closer.
const JACK = "99710000-0000-4000-8000-000000000001";
const PRIVATE = "99710000-0000-4000-8000-000000000002";
const FILL_IN = "99710000-0000-4000-8000-000000000003";

let tenantId: number;
let adminId: number;
let cookie: string;
let fixture: FixtureRow;
let lineId = BASE * 10;

async function centralMatch(
  id: number,
  o: {
    grade: string;
    date: string;
    season: string;
    home: number;
    away: number;
    winner: number | null;
    result: string;
    status?: string;
    playhqId?: string;
  },
) {
  await db.execute(sql`
    insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round,
      match_date, venue, status, home_club_id, away_club_id, home_team, away_team, home_score,
      away_score, toss_winner_club_id, winner_club_id, result_text)
    values (${id}, ${o.playhqId ?? null}, ${o.season}, ${o.grade}, 'grade-p5', 'One Day', '4',
      ${o.date}, 'P5 Oval', ${o.status ?? "COMPLETED"}, ${o.home}, ${o.away}, 'Home CC', 'Away CC',
      '7/210', '10/150', ${o.home}, ${o.winner}, ${o.result})
  `);
}

async function batting(matchId: number, participantId: string, runs: number) {
  await db.execute(sql`
    insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order,
      participant_id, player_name, runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
    values (${lineId++}, ${matchId}, 1, ${CLUB}, 'P5 CC', 1, ${participantId}, 'Player',
      ${runs}, ${runs + 10}, 5, 1, 90.0, 'not out', 'notout', null)
  `);
}

async function ladderRow(teamId: string, org: string, rank: number, played: number) {
  await db.execute(sql`
    insert into playhq.ladders (grade_id, ladder_name, team_id, team_name, org_id, rank, played,
      competition_points, won, lost, fetched_at)
    values (${GRADE}::uuid, 'Ladder', ${teamId}::uuid, ${`Team ${rank}`}, ${org}::uuid, ${rank},
      ${played}, ${12 - rank}, 1, 0, ${FETCHED.toISOString()}::timestamptz)
  `);
}

const sources = (fields?: string) =>
  request(app)
    .get("/api/weekend-carousel/sources")
    .set("x-tenant-id", String(tenantId))
    .set("Cookie", cookie)
    .query({
      from: "2026-10-09",
      to: "2026-10-11",
      setType: "matchDay",
      audience: "all",
      ...(fields ? { fields } : {}),
    });

const ALL = "fixture.ladder,fixture.lastMeeting,fixture.milestoneWatch";

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-p5-optional";
  await db.$client.query(fs.readFileSync(path.join(SQL_DIR, "playhq-schema.sql"), "utf8"));
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `p5-${STAMP}`,
      centralClubId: CLUB,
      readsFromCentral: true,
      playhqOrgId: ORG,
      name: "P5 Club",
      plan: "pro",
    })
    .returning();
  tenantId = t.id;
  invalidateTenantConfigCache(tenantId);
  const [admin] = await db
    .insert(adminsTable)
    .values({ tenantId, username: `p5_${STAMP}`, displayName: "P5", passwordHash: "x" })
    .returning();
  adminId = admin.id;
  cookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;

  await db.execute(sql`
    insert into central.clubs (club_id, name, short_name, parent_club_id)
    values (${OLD}, 'P5 Old CC', 'P5 Old', null), (${CLUB}, 'P5 CC', 'P5', ${OLD}),
           (${OPP}, 'Rivals CC', 'Rivals', null)
  `);
  await db.execute(sql`
    insert into central.players (participant_id, display_name, is_private)
    values (${JACK}, 'Jack Smith', 0), (${PRIVATE}, 'Quiet Person', 1), (${FILL_IN}, 'Fill In', 0)
  `);

  // Meetings: the latest A Grade one was under the club's earlier id, and lost.
  await centralMatch(BASE + 1, {
    grade: "A Grade",
    date: "2025-12-06",
    season: "2025/26",
    home: CLUB,
    away: OPP,
    winner: CLUB,
    result: "P5 CC won by 24 runs",
    playhqId: PHQ_DONE,
  });
  await centralMatch(BASE + 2, {
    grade: "A Grade",
    date: "2026-02-07",
    season: "2025/26",
    home: OPP,
    away: OLD,
    winner: OPP,
    result: "Rivals CC won by 3 wickets",
  });
  // Not meetings to count: abandoned, another grade, and match day itself.
  await centralMatch(BASE + 3, {
    grade: "A Grade",
    date: "2026-03-01",
    season: "2025/26",
    home: CLUB,
    away: OPP,
    winner: null,
    result: "Abandoned",
    status: "ABANDONED",
  });
  await centralMatch(BASE + 4, {
    grade: "B Grade",
    date: "2026-03-08",
    season: "2025/26",
    home: CLUB,
    away: OPP,
    winner: CLUB,
    result: "P5 CC won by 9 wickets",
  });
  await centralMatch(BASE + 5, {
    grade: "A Grade",
    date: "2026-10-10",
    season: "2026/27",
    home: CLUB,
    away: OPP,
    winner: CLUB,
    result: "P5 CC won by 1 run",
    status: "IN_PROGRESS",
  });
  await batting(BASE + 1, JACK, 988);
  await batting(BASE + 1, PRIVATE, 995);
  await batting(BASE + 1, FILL_IN, 999);

  // PlayHQ: last week's completed match, this week's fixture, and the season ladder.
  await db.execute(sql`
    insert into playhq.grades (id, name, season_name, is_junior)
    values (${GRADE}::uuid, 'A Grade', '2026/27', false)
  `);
  for (const [id, status, start] of [
    [PHQ_DONE, "COMPLETED", "2026-10-03T02:00:00Z"],
    [PHQ_FIXTURE, "UPCOMING", "2026-10-10T02:00:00Z"],
  ] as const) {
    await db.execute(sql`
      insert into playhq.matches (id, grade_id, status, start_at, home_team_id, home_org_id,
        away_team_id, away_org_id, raw, fetched_at)
      values (${id}::uuid, ${GRADE}::uuid, ${status}, ${start}::timestamptz, ${CLUB_TEAM}::uuid,
        ${ORG}::uuid, ${OPP_TEAM}::uuid, ${RIVAL_ORG}::uuid, '{}'::jsonb, now())
    `);
  }
  await ladderRow(CLUB_TEAM, ORG, 3, 1);
  await ladderRow(OPP_TEAM, RIVAL_ORG, 5, 1);
  for (const rank of [1, 2, 4, 6, 7, 8]) await ladderRow(randomUUID(), randomUUID(), rank, 1);

  [fixture] = await db
    .insert(fixturesTable)
    .values({
      tenantId,
      grade: "A Grade",
      roundLabel: "Round 2",
      opponentName: "Rivals Cricket Club Inc",
      venue: "P5 Oval",
      startAt: new Date("2026-10-10T02:00:00Z"),
      isHome: true,
      source: "playhq",
      playhqMatchId: PHQ_FIXTURE,
    })
    .returning();
  await db.insert(teamListsTable).values({
    tenantId,
    fixtureId: fixture.id,
    isPublished: true,
    players: [
      { order: 1, displayName: "Jack Smith", participantId: JACK },
      { order: 2, displayName: "Quiet Person", participantId: PRIVATE },
      { order: 3, playerId: 90001, displayName: "Fill In", participantId: FILL_IN },
    ],
  });
  clearCentralQueriesCache();
});

afterAll(async () => {
  for (const t of ["match_batting", "matches"]) {
    await db.execute(
      sql`delete from ${sql.raw(`central.${t}`)} where match_id >= ${BASE} and match_id < ${BASE + 10}`,
    );
  }
  await db.execute(
    sql`delete from central.players where participant_id in (${JACK}, ${PRIVATE}, ${FILL_IN})`,
  );
  await db.execute(sql`delete from central.clubs where club_id in (${CLUB}, ${OPP}, ${OLD})`);
  await db.execute(sql`delete from playhq.ladders where grade_id = ${GRADE}::uuid`);
  await db.execute(
    sql`delete from playhq.matches where id in (${PHQ_DONE}::uuid, ${PHQ_FIXTURE}::uuid)`,
  );
  await db.execute(sql`delete from playhq.grades where id = ${GRADE}::uuid`);
  await db.delete(teamListsTable).where(eq(teamListsTable.tenantId, tenantId));
  await db.delete(fixturesTable).where(eq(fixturesTable.tenantId, tenantId));
  await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
  clearCentralQueriesCache();
});

describe("Match Day optional data through the Weekend Carousel", () => {
  it("loads nothing unless asked: the visible fields only", async () => {
    const res = await sources();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const c = res.body.matchDayContent[fixture.id];
    expect(c).not.toHaveProperty("ladder");
    expect(c).not.toHaveProperty("lastMeeting");
    expect(c).not.toHaveProperty("milestoneWatch");
  });

  it("shows ladder positions, the last meeting and milestone watch, display-ready", async () => {
    const res = await sources(ALL);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const c = res.body.matchDayContent[fixture.id];
    expect(c.ladder).toEqual({ club: "3RD", opposition: "5TH", teams: 8, tableName: null });
    // Under the club's earlier id, away from home, and lost: lineage + both orientations.
    expect(c.lastMeeting).toEqual({
      outcome: "lost",
      line: "Lost by 3 wickets · 2025/26",
      date: "2026-02-07",
      season: "2025/26",
    });
    // The private player and the fill-in are nearer 1,000 but never named.
    expect(c.milestoneWatch).toEqual({
      playerName: "J. Smith",
      line: "J. Smith needs 12 for 1,000 club runs",
    });
    expect(JSON.stringify(res.body)).not.toMatch(/TBC|Quiet Person|Fill In/);
    expect(res.body.warnings.join(" ")).not.toMatch(/could not be loaded/);
  });
});

describe("ladder positions (T5.1 consistency)", () => {
  it("equal the PlayHQ season ladder's own rows for both teams", async () => {
    const q = await import("@workspace/db/central-queries");
    const ladder = await q.playhqGradeLadderUncached(GRADE, ORG);
    const table = ladder!.ladders[0]!;
    const got = await q.fixtureLadderPositions({
      orgId: ORG,
      playhqMatchId: PHQ_FIXTURE,
      now: NOW,
    });
    expect(got).toMatchObject({
      gradeId: GRADE,
      tableName: null,
      teams: table.teams.length,
      club: { rank: table.teams.find((t) => t.teamId === CLUB_TEAM)!.rank },
      opposition: { rank: table.teams.find((t) => t.teamId === OPP_TEAM)!.rank },
    });
  });

  it("hide when the ladder hasn't caught up with the club's completed matches", async () => {
    const q = await import("@workspace/db/central-queries");
    await db.execute(
      sql`update playhq.ladders set played = 0 where grade_id = ${GRADE}::uuid and team_id = ${CLUB_TEAM}::uuid`,
    );
    try {
      expect(
        await q.fixtureLadderPositions({ orgId: ORG, playhqMatchId: PHQ_FIXTURE, now: NOW }),
      ).toBeNull();
    } finally {
      await db.execute(
        sql`update playhq.ladders set played = 1 where grade_id = ${GRADE}::uuid and team_id = ${CLUB_TEAM}::uuid`,
      );
    }
  });

  it("hide when the ladder was fetched more than eight days ago, or for another club", async () => {
    const q = await import("@workspace/db/central-queries");
    const later = new Date(NOW.getTime() + 9 * 24 * 60 * 60 * 1000);
    expect(
      await q.fixtureLadderPositions({ orgId: ORG, playhqMatchId: PHQ_FIXTURE, now: later }),
    ).toBeNull();
    expect(
      await q.fixtureLadderPositions({ orgId: randomUUID(), playhqMatchId: PHQ_FIXTURE, now: NOW }),
    ).toBeNull();
  });
});

describe("last meeting (T5.2)", () => {
  it("is lineage aware, grade-family scoped, finished-only and before the fixture", async () => {
    const q = await import("@workspace/db/central-queries");
    const a = await q.centralLastMeeting({
      clubId: CLUB,
      opponentClubId: OPP,
      appGrade: "A Grade",
      before: "2026-10-10",
    });
    expect(a).toMatchObject({ matchId: BASE + 2, outcome: "lost", margin: "3 wickets" });
    const b = await q.centralLastMeeting({
      clubId: CLUB,
      opponentClubId: OPP,
      appGrade: "B Grade",
      before: "2026-10-10",
    });
    expect(b).toMatchObject({ matchId: BASE + 4, outcome: "won", margin: "9 wickets" });
    const earlier = await q.centralLastMeeting({
      clubId: CLUB,
      opponentClubId: OPP,
      appGrade: "A Grade",
      before: "2026-01-01",
    });
    expect(earlier).toMatchObject({ matchId: BASE + 1, outcome: "won", margin: "24 runs" });
    expect(
      await q.centralLastMeeting({
        clubId: CLUB,
        opponentClubId: OPP,
        appGrade: "Under 15 Boys",
        before: "2026-10-10",
      }),
    ).toBeNull();
  });

  it("resolves the opposition from the PlayHQ match when the fixture has no club link", async () => {
    const q = await import("@workspace/db/central-queries");
    const sides = await q.playhqFixtureSides(PHQ_FIXTURE, ORG);
    expect(sides).toMatchObject({ clubTeamId: CLUB_TEAM, opponentOrgId: RIVAL_ORG });
    expect(await q.centralClubIdForPlayhqOrg(RIVAL_ORG)).toBe(OPP);
  });
});
