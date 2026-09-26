/**
 * Achievement cards from association data for every club: a central-data
 * club's centuries, five-fors, senior debuts and career milestones, drafted by
 * the scheduled sweep and by the past-match backfill. Real-DB integration test
 * (needs DATABASE_URL, and CENTRAL_DATABASE_URL pointing at the same CI DB).
 *
 * The test writes its own rows into `central.*` under club ids and match ids no
 * other suite uses (test files run one at a time), and removes every row it
 * created afterwards, even when a test fails part-way.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, sql } from "drizzle-orm";
import app from "../app";
import {
  db,
  tenantsTable,
  adminsTable,
  playerIdMapTable,
  socialSettingsTable,
  socialDraftsTable,
} from "@workspace/db";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import { invalidateTenantConfigCache } from "../lib/tenant";
import { runDraftSweep } from "../lib/draft-sweep";
import { centralPlayerKey } from "../lib/central-achievements";
import { purgeTestTenants } from "../lib/tenant-purge.test-helpers";

// Central club ids no other suite uses (tenants.central_club_id is unique).
const CLUB = 97671;
const OPP = 97672;
const OTHER_CLUB = 97673;
const BASE = 8_600_000 + (Date.now() % 50_000) * 10;
const LINE_BASE = BASE * 10;
const STAMP = Date.now();
const NOW = new Date("2026-11-20T10:00:00Z");
const log = { error: () => {}, warn: () => {}, info: () => {} };

const guid = (n: number) =>
  `9767${STAMP}`.slice(0, 8) + `-0000-4000-8000-${String(n).padStart(12, "0")}`;
// A mapped batter (history + a century and 1000 runs in the new match), a
// mapped debutant, an unmapped bowler (five-for), a player whose only route to
// 1000 runs is junior runs, a private player, a fill-in, a junior-only player,
// and the other club's centurion.
const G_STAR = guid(1);
const G_DEBUT = guid(2);
const G_UNMAPPED = guid(3);
const G_CROSS = guid(4);
const G_PRIVATE = guid(5);
const G_FILLIN = guid(6);
const G_JUNIOR = guid(7);
const G_OTHER = guid(8);
const GUIDS = [G_STAR, G_DEBUT, G_UNMAPPED, G_CROSS, G_PRIVATE, G_FILLIN, G_JUNIOR, G_OTHER];

// Matches: two last-season senior games, a last-season junior game, then the
// new senior game, a new junior game and the other club's new game.
const H1 = BASE + 1;
const H2 = BASE + 2;
const JH = BASE + 3;
const WATERMARK = BASE + 3;
const NEW1 = BASE + 4;
const JNEW = BASE + 5;
const OTHER_NEW = BASE + 6;

let tenantId: number;
let otherTenantId: number;
let cookie: string;
let otherCookie: string;
let lineId = LINE_BASE;

async function centralMatch(
  id: number,
  opts: { grade?: string; season?: string; round?: string; date?: string; home?: number } = {},
) {
  const home = opts.home ?? CLUB;
  await db.execute(sql`
    insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round,
      match_date, venue, status, home_club_id, away_club_id, home_team, away_team, home_score,
      away_score, toss_winner_club_id, winner_club_id, result_text)
    values (${id}, ${`ach-${id}`}, ${opts.season ?? "2026/27"}, ${opts.grade ?? "A Grade"}, 'g',
      'One Day', ${opts.round ?? "1"}, ${opts.date ?? "2026-11-15"}, 'Feats Oval', 'Completed',
      ${home}, ${OPP}, 'Feats CC', 'Rivals CC', '7/250', '10/150', ${home}, ${home}, 'Feats CC won')
  `);
}

async function bat(matchId: number, g: string, name: string, runs: number, club = CLUB) {
  await db.execute(sql`
    insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order,
      participant_id, player_name, runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
    values (${lineId++}, ${matchId}, 1, ${club}, 'Feats CC', 1, ${g}, ${name},
      ${runs}, 101, 9, 2, 99.0, 'not out', 'not out', null)
  `);
}

async function bowl(matchId: number, g: string, name: string, wickets: number, runs: number) {
  await db.execute(sql`
    insert into central.match_bowling (id, match_id, innings, club_id, team_name, participant_id,
      player_name, overs, maidens, runs, wickets, economy, wides, no_balls)
    values (${lineId++}, ${matchId}, 2, ${CLUB}, 'Feats CC', ${g}, ${name}, 9, 1, ${runs}, ${wickets}, 2.2, 0, 0)
  `);
}

async function roster(matchId: number, g: string, name: string) {
  await db.execute(sql`
    insert into central.match_rosters (id, match_id, club_id, team_name, participant_id, player_name)
    values (${lineId++}, ${matchId}, ${CLUB}, 'Feats CC', ${g}, ${name})
  `);
}

async function admin(tid: number, suffix: string): Promise<string> {
  const [a] = await db
    .insert(adminsTable)
    .values({
      tenantId: tid,
      username: `feats_${suffix}_${STAMP}`,
      displayName: "Feats Admin",
      passwordHash: "x",
    })
    .returning();
  return `${SESSION_COOKIE}=${encodeSession({ adminId: a.id, issuedAt: Date.now() })}`;
}

beforeAll(async () => {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-feats";
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `feats-${STAMP}`,
      centralClubId: CLUB,
      readsFromCentral: true,
      name: "Feats Club",
      plan: "pro",
    })
    .returning();
  tenantId = t.id;
  const [o] = await db
    .insert(tenantsTable)
    .values({
      slug: `feats-other-${STAMP}`,
      centralClubId: OTHER_CLUB,
      readsFromCentral: true,
      name: "Other Feats Club",
      plan: "pro",
    })
    .returning();
  otherTenantId = o.id;
  invalidateTenantConfigCache(tenantId);
  invalidateTenantConfigCache(otherTenantId);
  cookie = await admin(tenantId, "a");
  otherCookie = await admin(otherTenantId, "b");

  await db.insert(playerIdMapTable).values([
    { tenantId, participantId: G_STAR, playerId: 51 },
    { tenantId, participantId: G_DEBUT, playerId: 52 },
    { tenantId, participantId: G_CROSS, playerId: 53 },
    { tenantId, participantId: G_PRIVATE, playerId: 54 },
    { tenantId, participantId: G_FILLIN, playerId: 90051 },
    { tenantId, participantId: G_JUNIOR, playerId: 55 },
    // The other club maps the same star under its own id: never a link here.
    { tenantId: otherTenantId, participantId: G_OTHER, playerId: 61 },
  ]);
  // Achievements start OFF (the default), with the watermark set.
  await db.insert(socialSettingsTable).values([
    { tenantId, centralSweepWatermark: WATERMARK },
    { tenantId: otherTenantId, centralSweepWatermark: WATERMARK, engineMilestone: true },
  ]);

  await db.execute(sql`
    insert into central.players (participant_id, display_name, is_private)
    values (${G_STAR}, 'R Star', 0), (${G_DEBUT}, 'D Newbie', 0), (${G_UNMAPPED}, 'U Bowler', 0),
      (${G_CROSS}, 'C Crossover', 0), (${G_PRIVATE}, 'P Hidden', 1), (${G_FILLIN}, 'F Fillin', 0),
      (${G_JUNIOR}, 'J Kid', 0), (${G_OTHER}, 'O Other', 0)
  `);

  // Last season: 950 senior runs for the star; the bowler and the crossover
  // player already appeared; the crossover's 850 runs are junior runs.
  await centralMatch(H1, { season: "2025/26", round: "1", date: "2025-11-01" });
  await bat(H1, G_STAR, "R Star", 120);
  await bat(H1, G_CROSS, "C Crossover", 90);
  await roster(H1, G_UNMAPPED, "U Bowler");
  await centralMatch(H2, { season: "2025/26", round: "2", date: "2025-11-08" });
  await bat(H2, G_STAR, "R Star", 830);
  await centralMatch(JH, {
    grade: "Under 15 Boys",
    season: "2025/26",
    round: "3",
    date: "2025-11-15",
  });
  await bat(JH, G_CROSS, "C Crossover", 850);
  await bat(JH, G_DEBUT, "D Newbie", 45);

  // The new senior game.
  await centralMatch(NEW1);
  await bat(NEW1, G_STAR, "R Star", 104); // century, and 1054 career runs
  await bat(NEW1, G_DEBUT, "D Newbie", 12); // first senior game (juniors don't count)
  await bat(NEW1, G_CROSS, "C Crossover", 90); // 180 senior runs (1030 with juniors)
  await bat(NEW1, G_PRIVATE, "P Hidden", 180); // private: never drafted
  await bat(NEW1, G_FILLIN, "F Fillin", 130); // fill-in: never drafted
  await bowl(NEW1, G_UNMAPPED, "U Bowler", 6, 20); // five-for, unmapped
  await bowl(NEW1, G_PRIVATE, "P Hidden", 7, 10);
  // A new junior game: never a card.
  await centralMatch(JNEW, { grade: "Under 15 Boys" });
  await bat(JNEW, G_JUNIOR, "J Kid", 200);
  // The other club's new game.
  await centralMatch(OTHER_NEW, { home: OTHER_CLUB });
  await bat(OTHER_NEW, G_OTHER, "O Other", 111, OTHER_CLUB);
});

/** Run every cleanup step even if an earlier one (or the suite) failed. */
async function bestEffort(steps: Array<() => Promise<unknown>>): Promise<void> {
  for (const step of steps) {
    try {
      await step();
    } catch (err) {
      console.warn("social-central-achievements cleanup step failed", err);
    }
  }
}

afterAll(async () => {
  const lo = BASE;
  const hi = BASE + 10;
  await bestEffort([
    ...["match_batting", "match_bowling", "match_rosters", "fielding"].map(
      (t) => () =>
        db.execute(
          sql`delete from ${sql.raw(`central.${t}`)} where match_id >= ${lo} and match_id < ${hi}`,
        ),
    ),
    () => db.execute(sql`delete from central.matches where match_id >= ${lo} and match_id < ${hi}`),
    () =>
      db.execute(sql`delete from central.players where participant_id = any(${sql.param(GUIDS)})`),
    () => purgeTestTenants([tenantId, otherTenantId]),
  ]);
});

type DraftRow = typeof socialDraftsTable.$inferSelect;

const achievementDrafts = async (tid: number): Promise<DraftRow[]> =>
  db
    .select()
    .from(socialDraftsTable)
    .where(and(eq(socialDraftsTable.tenantId, tid), eq(socialDraftsTable.family, "achievements")));

const keysOf = (rows: DraftRow[]) => rows.map((d) => d.sourceKey).sort();

async function setSettings(tid: number, patch: Partial<typeof socialSettingsTable.$inferInsert>) {
  await db.update(socialSettingsTable).set(patch).where(eq(socialSettingsTable.tenantId, tid));
}

async function watermarkOf(tid: number) {
  const [s] = await db
    .select()
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tid));
  return s.centralSweepWatermark;
}

/** Sweep from the fixture watermark, so the new games are "new" again. */
async function sweep(tid = tenantId) {
  await setSettings(tid, { centralSweepWatermark: WATERMARK });
  return runDraftSweep(tid, { kind: "scheduled", now: NOW }, log);
}

const post = (path: string, body: object, as: "a" | "b" = "a") =>
  request(app)
    .post(`/api${path}`)
    .set("Cookie", as === "a" ? cookie : otherCookie)
    .set("x-tenant-id", String(as === "a" ? tenantId : otherTenantId))
    .send(body);

const unmappedKey = centralPlayerKey(G_UNMAPPED);
const NEW_KEYS = [
  "debut:A Grade:52",
  "feat:century:A Grade:2026:1:51",
  `feat:fiveFor:A Grade:2026:1:${unmappedKey}`,
  "milestone:51:runs:0",
].sort();

function assertNoLeaks(rows: DraftRow[]) {
  const text = JSON.stringify(rows);
  for (const name of ["P Hidden", "F Fillin", "J Kid", "C Crossover", "O Other"]) {
    expect(text).not.toContain(name);
  }
  for (const g of GUIDS) expect(text).not.toContain(g);
}

describe("scheduled sweep: achievements for a central club", () => {
  it("drafts nothing while the achievements family is off", async () => {
    const summary = await sweep();
    expect(summary.achievements).toBe(0);
    expect(await achievementDrafts(tenantId)).toHaveLength(0);
  });

  it("drafts the century, five-for, debut and milestone from a new match", async () => {
    await setSettings(tenantId, { engineMilestone: true });
    const summary = await sweep();
    expect(summary.achievements).toBe(4);
    const rows = await achievementDrafts(tenantId);
    expect(keysOf(rows)).toEqual(NEW_KEYS);
    assertNoLeaks(rows);
    // Past the club's newest game (the junior one); the other club's is not ours.
    expect(await watermarkOf(tenantId)).toBe(JNEW);

    const byKey = new Map(rows.map((d) => [d.sourceKey, d]));
    expect(byKey.get("feat:century:A Grade:2026:1:51")).toMatchObject({
      engine: "milestone",
      appPath: "/players/51",
      status: "awaiting_review",
      cardInput: { kind: "century", playerName: "R Star", runs: 104, notOut: true, round: 1 },
    });
    expect(byKey.get("milestone:51:runs:0")?.cardInput).toMatchObject({
      kind: "milestone",
      tierLabel: "1000 Runs",
      currentValue: 1054,
      threshold: 1000,
    });
    expect(byKey.get("debut:A Grade:52")?.cardInput).toMatchObject({
      kind: "debut",
      playerName: "D Newbie",
      season: "2026/27",
    });
    // Unmapped: the card stays, without a profile link.
    expect(byKey.get(`feat:fiveFor:A Grade:2026:1:${unmappedKey}`)).toMatchObject({
      appPath: "/players",
      cardInput: { kind: "fiveFor", playerName: "U Bowler", figures: "6/20" },
    });
  });

  it("a milestone reached only by counting junior runs is not drafted", async () => {
    const rows = await achievementDrafts(tenantId);
    expect(rows.filter((d) => d.sourceKey?.startsWith("milestone:53:"))).toEqual([]);
    expect(rows.filter((d) => (d.cardInput as { kind?: string }).kind === "milestone")).toEqual([
      expect.objectContaining({ sourceKey: "milestone:51:runs:0" }),
    ]);
  });

  it("a re-run never duplicates", async () => {
    const summary = await sweep();
    expect(summary.achievements).toBe(0);
    expect(keysOf(await achievementDrafts(tenantId))).toEqual(NEW_KEYS);
  });

  it("a dismissed card is not drafted again", async () => {
    await db
      .update(socialDraftsTable)
      .set({ status: "dismissed" })
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          eq(socialDraftsTable.sourceKey, "debut:A Grade:52"),
        ),
      );
    await sweep();
    const live = (await achievementDrafts(tenantId)).filter((d) => d.status !== "dismissed");
    expect(keysOf(live)).toEqual(NEW_KEYS.filter((k) => k !== "debut:A Grade:52"));
  });

  it("the family's per-grade switch keeps a grade out", async () => {
    await db
      .delete(socialDraftsTable)
      .where(
        and(eq(socialDraftsTable.tenantId, tenantId), eq(socialDraftsTable.family, "achievements")),
      );
    await setSettings(tenantId, {
      familyConfig: {
        results: { enabled: true, grades: {} },
        achievements: { enabled: true, grades: { "A Grade": false } },
        roundup: { enabled: false, grades: {} },
        matchday: { enabled: false, grades: {} },
      },
    });
    await sweep();
    expect(await achievementDrafts(tenantId)).toHaveLength(0);
    await setSettings(tenantId, { familyConfig: null, engineMilestone: true });
  });
});

describe("POST /social-drafts/backfill-matches with achievements", () => {
  it("rejects an unknown include value", async () => {
    const res = await post("/social-drafts/backfill-matches", {
      season: 2025,
      include: ["everything"],
    });
    expect(res.status).toBe(400);
  });

  it("drafts past matches' achievements and leaves the watermark alone", async () => {
    await setSettings(tenantId, { centralSweepWatermark: WATERMARK });
    const res = await post("/social-drafts/backfill-matches", {
      season: 2025,
      include: ["results", "achievements"],
    });
    expect(res.status).toBe(200);
    // Two senior games last season; the junior one is never a candidate.
    expect(res.body).toMatchObject({ considered: 2, achievements: 5 });
    const keys = keysOf(await achievementDrafts(tenantId));
    expect(keys).toEqual(
      expect.arrayContaining([
        "debut:A Grade:51",
        "debut:A Grade:53",
        `debut:A Grade:${unmappedKey}`,
        "feat:century:A Grade:2025:1:51",
        "feat:century:A Grade:2025:2:51",
      ]),
    );
    assertNoLeaksExceptCrossover(await achievementDrafts(tenantId));
    expect(await watermarkOf(tenantId)).toBe(WATERMARK);
  });

  it("a repeat backfill drafts nothing new", async () => {
    const before = keysOf(await achievementDrafts(tenantId));
    const res = await post("/social-drafts/backfill-matches", {
      season: 2025,
      include: ["results", "achievements"],
    });
    expect(res.body).toMatchObject({ achievements: 0 });
    expect(keysOf(await achievementDrafts(tenantId))).toEqual(before);
  });

  it("without the option, only Match Result cards are drafted", async () => {
    const before = keysOf(await achievementDrafts(tenantId));
    const res = await post("/social-drafts/backfill-matches", { season: 2026 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ considered: 1 });
    expect(res.body.achievements).toBeUndefined();
    expect(keysOf(await achievementDrafts(tenantId))).toEqual(before);
  });
});

/** The crossover player may appear on a debut card (a real senior debut). */
function assertNoLeaksExceptCrossover(rows: DraftRow[]) {
  const text = JSON.stringify(rows);
  for (const name of ["P Hidden", "F Fillin", "J Kid", "O Other"]) {
    expect(text).not.toContain(name);
  }
  for (const g of GUIDS) expect(text).not.toContain(g);
}

describe("tenant isolation", () => {
  it("another club's backfill never drafts this club's matches", async () => {
    const res = await post(
      "/social-drafts/backfill-matches",
      { season: 2026, matchIds: [NEW1], include: ["achievements"] },
      "b",
    );
    expect(res.body).toMatchObject({ considered: 0, achievements: 0 });
  });

  it("each club's sweep drafts only its own players", async () => {
    await sweep(otherTenantId);
    const other = await achievementDrafts(otherTenantId);
    expect(keysOf(other)).toEqual(["debut:A Grade:61", "feat:century:A Grade:2026:1:61"]);
    expect(JSON.stringify(other)).not.toContain("R Star");
    expect(JSON.stringify(await achievementDrafts(tenantId))).not.toContain("O Other");
  });
});
