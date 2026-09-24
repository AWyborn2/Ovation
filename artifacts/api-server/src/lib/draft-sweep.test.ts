/**
 * Social Studio automation U4 — one drafting sweep for every club type: the
 * central-data watermark, idempotence, the recent-window guard, juniors
 * isolation, and the secret-protected endpoint. Real-DB integration test
 * (needs DATABASE_URL, and CENTRAL_DATABASE_URL pointing at the same CI DB).
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
  playerIdMapTable,
  socialSettingsTable,
  socialDraftsTable,
  captionTemplatesTable,
} from "@workspace/db";
import { invalidateTenantConfigCache } from "./tenant";
import { runDraftSweep } from "./draft-sweep";
import { draftKeys } from "./draft-upsert";

const CLUB = 9941;
const OPP = 9942;
const BASE = 9_400_000 + (Date.now() % 50_000) * 10;
const LINE_BASE = BASE * 10;
const GUID = "99410000-0000-4000-8000-000000000001";
const STAMP = Date.now();
const NOW = new Date("2026-11-20T10:00:00Z");
const log = { error: () => {}, warn: () => {}, info: () => {} };

let tenantId: number;
let lineId = LINE_BASE;

async function centralMatch(id: number, opts: { grade?: string; date?: string } = {}) {
  await db.execute(sql`
    insert into central.matches (match_id, playhq_match_id, season, grade, grade_id, comp_type, round,
      match_date, venue, status, home_club_id, away_club_id, home_team, away_team, home_score,
      away_score, toss_winner_club_id, winner_club_id, result_text)
    values (${id}, ${`sweep-${id}`}, '2026/27', ${opts.grade ?? "A Grade"}, 'grade-a', 'One Day', '4',
      ${opts.date ?? "2026-11-15"}, 'Sweep Oval', 'Completed', ${CLUB}, ${OPP}, 'Sweep CC', 'Rivals CC',
      '7/210', '10/150', ${CLUB}, ${CLUB}, 'Sweep CC won')
  `);
  await db.execute(sql`
    insert into central.match_batting (id, match_id, innings, club_id, team_name, bat_order,
      participant_id, player_name, runs, balls, fours, sixes, strike_rate, dismissal, dismissal_type, fielder)
    values (${lineId++}, ${id}, 1, ${CLUB}, 'Sweep CC', 1, ${GUID}, 'Robin Sweeper',
      88, 90, 9, 2, 97.7, 'not out', 'notout', null)
  `);
  await db.execute(sql`
    insert into central.match_bowling (id, match_id, innings, club_id, team_name, participant_id,
      player_name, overs, maidens, runs, wickets, economy, wides, no_balls)
    values (${lineId++}, ${id}, 2, ${CLUB}, 'Sweep CC', ${GUID}, 'Robin Sweeper', 8, 1, 30, 4, 3.75, 0, 0)
  `);
}

beforeAll(async () => {
  process.env.SOCIAL_SWEEP_SECRET = "sweep-test-secret";
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `sweep-${STAMP}`,
      centralClubId: CLUB,
      readsFromCentral: true,
      name: "Sweep Club",
      plan: "pro",
    })
    .returning();
  tenantId = t.id;
  invalidateTenantConfigCache(tenantId);
  await db.insert(playerIdMapTable).values({ tenantId, participantId: GUID, playerId: 41 });
  await db.insert(socialSettingsTable).values({ tenantId });
  // Years of history already in central before drafting is switched on.
  await centralMatch(BASE + 1, { date: "2019-01-12" });
  await centralMatch(BASE + 2, { date: "2021-02-20" });
});

afterAll(async () => {
  await db.execute(
    sql`delete from central.match_batting where match_id >= ${BASE} and match_id < ${BASE + 10}`,
  );
  await db.execute(
    sql`delete from central.match_bowling where match_id >= ${BASE} and match_id < ${BASE + 10}`,
  );
  await db.execute(
    sql`delete from central.matches where match_id >= ${BASE} and match_id < ${BASE + 10}`,
  );
  await db.delete(socialDraftsTable).where(eq(socialDraftsTable.tenantId, tenantId));
  // ensureSettings (run by the sweep) seeds default caption templates.
  await db.delete(captionTemplatesTable).where(eq(captionTemplatesTable.tenantId, tenantId));
  await db.delete(socialSettingsTable).where(eq(socialSettingsTable.tenantId, tenantId));
  await db.delete(playerIdMapTable).where(eq(playerIdMapTable.tenantId, tenantId));
  await db.delete(tenantsTable).where(eq(tenantsTable.id, tenantId));
});

async function centralDrafts() {
  return db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        like(socialDraftsTable.sourceKey, "matchSummary:central:%"),
      ),
    );
}

async function watermark() {
  const [s] = await db
    .select()
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  return s.centralSweepWatermark;
}

describe("central drafting sweep", () => {
  it("the first sweep records the watermark and drafts no history", async () => {
    await runDraftSweep(tenantId, { kind: "scheduled", now: NOW }, log);
    expect(await watermark()).toBe(BASE + 2);
    expect(await centralDrafts()).toHaveLength(0);
  });

  it("a new match past the watermark gets one draft, stamped when the sweep saw it", async () => {
    await centralMatch(BASE + 3);
    const summary = await runDraftSweep(tenantId, { kind: "scheduled", now: NOW }, log);
    expect(summary.matchSummaries).toBe(1);
    const drafts = await centralDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].sourceKey).toBe(draftKeys.centralMatchSummary(BASE + 3));
    expect(drafts[0].family).toBe("results");
    expect(drafts[0].sourceImportedAt?.toISOString()).toBe(NOW.toISOString());
    // Card input carries names, never central GUIDs.
    expect(JSON.stringify(drafts[0].cardInput)).not.toContain(GUID);
    expect(await watermark()).toBe(BASE + 3);
  });

  it("running the sweep again with no new data drafts nothing", async () => {
    const summary = await runDraftSweep(
      tenantId,
      { kind: "scheduled", now: new Date(NOW.getTime() + 60_000) },
      log,
    );
    expect(summary.matchSummaries).toBe(0);
    expect(await centralDrafts()).toHaveLength(1);
  });

  it("old or junior matches past the watermark are skipped but the watermark moves on", async () => {
    await centralMatch(BASE + 4, { date: "2018-03-01" });
    await centralMatch(BASE + 5, { grade: "Under 15 Boys" });
    await runDraftSweep(tenantId, { kind: "scheduled", now: NOW }, log);
    expect(await centralDrafts()).toHaveLength(1);
    expect(await watermark()).toBe(BASE + 5);
  });

  it("records the sweep time for sweep health", async () => {
    const [s] = await db
      .select()
      .from(socialSettingsTable)
      .where(eq(socialSettingsTable.tenantId, tenantId));
    expect(s.lastSweepAt).not.toBeNull();
  });
});

describe("POST /api/internal/draft-sweep", () => {
  it("rejects a missing or wrong secret with 401", async () => {
    expect((await request(app).post("/api/internal/draft-sweep").send({ tenantId })).status).toBe(
      401,
    );
    expect(
      (
        await request(app)
          .post("/api/internal/draft-sweep")
          .set("x-sweep-secret", "nope")
          .send({ tenantId })
      ).status,
    ).toBe(401);
  });

  it("sweeps the named tenant with the right secret", async () => {
    const res = await request(app)
      .post("/api/internal/draft-sweep")
      .set("x-sweep-secret", "sweep-test-secret")
      .send({ tenantId, scope: "fixtures" });
    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([expect.objectContaining({ tenantId, ok: true })]);
  });

  it("404s for an unknown tenant and 400s for a bad scope", async () => {
    const api = () =>
      request(app).post("/api/internal/draft-sweep").set("x-sweep-secret", "sweep-test-secret");
    expect((await api().send({ tenantId: 987654321 })).status).toBe(404);
    expect((await api().send({ tenantId, scope: "everything" })).status).toBe(400);
  });
});
