import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { and, eq, isNull } from "drizzle-orm";
import app from "../app";
import { encodeSession, SESSION_COOKIE } from "../lib/auth";
import {
  db,
  adminsTable,
  importsTable,
  playersTable,
  playerGradeSeasonStatsTable,
  baselineAdjustmentsTable,
} from "@workspace/db";
import { recomputeAggregates } from "../lib/recompute";

/**
 * Backfill (previous-season) reconcile flow for whole-season CSV imports.
 *
 * Each test seeds a single isolated player with a known season=NULL baseline in
 * a real grade, derives career totals from it, then uploads a one-row
 * PlayCricket CSV for that same player/grade and exercises the peel/add choice
 * and the delete-restores-baseline path. The grade is "B Grade" (not cap
 * eligible) so cap syncing is a no-op and can't interfere.
 */

const GRADE = "B Grade";
const CSV_GRADE = "B Grade"; // PLAYCRICKET_GRADE_MAP identity for B Grade.
const SEASON = 2017;
const SUFFIX = Date.now();
const SURNAME = `Backfilltest${SUFFIX}`;
const GIVEN = "Casey";

/** A minimal valid PlayCricket "Combined" CSV with one player row. */
function buildCsv(opts: {
  games: number;
  runs: number;
  wickets: number;
}): string {
  const headers = [
    "Player name",
    "Club Name",
    "Matches played",
    "Innings",
    "Batting Aggregate",
    "Not outs",
    "50s scored",
    "100s scored",
    "High Score",
    "High Score Dismissal Status",
    "Wickets",
    "Runs scored",
    "5 Wickets",
    "Bowling Best Innings",
    "Total Catches",
    "Run Outs Unassisted",
    "Run Outs Assisted",
    "Stumpings",
    "Grade name",
  ];
  const row = [
    `"${SURNAME}, ${GIVEN}"`,
    "Halls Head",
    String(opts.games),
    String(opts.games),
    String(opts.runs),
    "0",
    "0",
    "0",
    "50",
    "false",
    String(opts.wickets),
    "0",
    "0",
    "--",
    "0",
    "0",
    "0",
    "0",
    CSV_GRADE,
  ];
  return `${headers.join(",")}\n${row.join(",")}\n`;
}

describe("backfill CSV import — peel/add/delete (integration)", () => {
  let adminId: number;
  let adminCookie: string;
  let playerId: number;
  const importIds: number[] = [];

  // Baseline figures the player starts with (season=NULL).
  const BASELINE = { games: 30, runs: 900, wickets: 20 };
  // The season being backfilled (a subset of the baseline so peel doesn't floor).
  const SEASON_FIGS = { games: 10, runs: 300, wickets: 6 };

  beforeAll(async () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET ?? "test-secret-for-backfill-flow";
    const [admin] = await db
      .insert(adminsTable)
      .values({
        username: `test_admin_backfill_${SUFFIX}`,
        displayName: "Backfill Test Admin",
        passwordHash: "x",
      })
      .returning();
    adminId = admin.id;
    adminCookie = `${SESSION_COOKIE}=${encodeSession({ adminId, issuedAt: Date.now() })}`;

    const [player] = await db
      .insert(playersTable)
      .values({ surname: SURNAME, givenName: GIVEN })
      .returning();
    playerId = player.id;

    // Seed the season=NULL baseline snapshot, then derive aggregates + career.
    await db.insert(playerGradeSeasonStatsTable).values({
      importId: null,
      playerId,
      grade: GRADE,
      season: null,
      games: BASELINE.games,
      innings: BASELINE.games,
      notOuts: 0,
      runs: BASELINE.runs,
      fifties: 0,
      hundreds: 0,
      wickets: BASELINE.wickets,
      runsConceded: 0,
      fiveWickets: 0,
      catches: 0,
      stumpings: 0,
      runOuts: 0,
    });
    await db.transaction(async (tx) => {
      await recomputeAggregates(tx, [GRADE]);
    });
  });

  afterAll(async () => {
    for (const id of importIds) {
      await db.delete(importsTable).where(eq(importsTable.id, id));
    }
    await db
      .delete(baselineAdjustmentsTable)
      .where(eq(baselineAdjustmentsTable.playerId, playerId));
    await db.delete(playerGradeSeasonStatsTable).where(eq(playerGradeSeasonStatsTable.playerId, playerId));
    await db.delete(playersTable).where(eq(playersTable.id, playerId));
    await db.delete(adminsTable).where(eq(adminsTable.id, adminId));
  });

  async function careerTotals() {
    const [p] = await db
      .select({
        games: playersTable.totalGames,
        runs: playersTable.totalRuns,
        wickets: playersTable.totalWickets,
      })
      .from(playersTable)
      .where(eq(playersTable.id, playerId));
    return {
      games: p.games ?? 0,
      runs: p.runs ?? 0,
      wickets: p.wickets ?? 0,
    };
  }

  async function baselineTotals() {
    const rows = await db
      .select()
      .from(playerGradeSeasonStatsTable)
      .where(
        and(
          eq(playerGradeSeasonStatsTable.playerId, playerId),
          eq(playerGradeSeasonStatsTable.grade, GRADE),
          isNull(playerGradeSeasonStatsTable.season),
        ),
      );
    return rows.reduce(
      (acc, r) => ({
        games: acc.games + (r.games ?? 0),
        runs: acc.runs + (r.runs ?? 0),
        wickets: acc.wickets + (r.wickets ?? 0),
      }),
      { games: 0, runs: 0, wickets: 0 },
    );
  }

  /** Upload a one-row CSV and return the preview body. */
  async function uploadCsv(figs: typeof SEASON_FIGS) {
    const csv = buildCsv(figs);
    const res = await request(app)
      .post("/api/imports/playcricket-csv")
      .set("Cookie", adminCookie)
      .field("season", String(SEASON))
      .attach("file", Buffer.from(csv, "utf8"), "backfill.csv");
    expect(res.status).toBe(200);
    importIds.push(res.body.importId);
    return res.body;
  }

  it("preview attaches backfill figures for the matched player", async () => {
    const body = await uploadCsv(SEASON_FIGS);
    const me = body.players.find(
      (p: { surname: string }) => p.surname === SURNAME,
    );
    expect(me).toBeTruthy();
    expect(me.status).toBe("matched");
    expect(me.backfill).toBeTruthy();
    expect(me.backfill.seasonGames).toBe(SEASON_FIGS.games);
    expect(me.backfill.baselineGames).toBe(BASELINE.games);
    expect(me.backfill.careerGames).toBe(BASELINE.games);

    // Cancel this preview so it doesn't interfere with later commits.
    const id = body.importId as number;
    await request(app).delete(`/api/imports/${id}`).set("Cookie", adminCookie);
  });

  it("peel keeps career totals invariant and reduces the baseline", async () => {
    const careerBefore = await careerTotals();
    expect(careerBefore).toEqual(BASELINE);

    const preview = await uploadCsv(SEASON_FIGS);
    const commit = await request(app)
      .post(`/api/imports/${preview.importId}/commit`)
      .set("Cookie", adminCookie)
      .send({ resolutions: [], reconcileMode: "peel" });
    expect(commit.status).toBe(200);
    expect(commit.body.reconcileMode).toBe("peel");

    // Career invariant: baseline shrank by exactly the itemised season.
    expect(await careerTotals()).toEqual(BASELINE);
    expect(await baselineTotals()).toEqual({
      games: BASELINE.games - SEASON_FIGS.games,
      runs: BASELINE.runs - SEASON_FIGS.runs,
      wickets: BASELINE.wickets - SEASON_FIGS.wickets,
    });

    // A baseline adjustment row records the peel for reversal on delete.
    const adj = await db
      .select()
      .from(baselineAdjustmentsTable)
      .where(
        and(
          eq(baselineAdjustmentsTable.playerId, playerId),
          eq(baselineAdjustmentsTable.grade, GRADE),
          eq(baselineAdjustmentsTable.season, SEASON),
        ),
      );
    expect(adj).toHaveLength(1);
    expect(adj[0].games).toBe(SEASON_FIGS.games);

    // Deleting the import reverses the peel: baseline and career restored.
    const del = await request(app)
      .delete(`/api/imports/${preview.importId}`)
      .set("Cookie", adminCookie);
    expect(del.status).toBe(204);
    expect(await baselineTotals()).toEqual(BASELINE);
    expect(await careerTotals()).toEqual(BASELINE);
    const adjAfter = await db
      .select()
      .from(baselineAdjustmentsTable)
      .where(
        and(
          eq(baselineAdjustmentsTable.playerId, playerId),
          eq(baselineAdjustmentsTable.season, SEASON),
        ),
      );
    expect(adjAfter).toHaveLength(0);
  });

  it("add increases career totals and leaves the baseline untouched", async () => {
    expect(await careerTotals()).toEqual(BASELINE);

    const preview = await uploadCsv(SEASON_FIGS);
    const commit = await request(app)
      .post(`/api/imports/${preview.importId}/commit`)
      .set("Cookie", adminCookie)
      .send({ resolutions: [], reconcileMode: "add" });
    expect(commit.status).toBe(200);
    expect(commit.body.reconcileMode).toBe("add");

    // Career grew by the season; baseline (season=NULL) is unchanged.
    expect(await careerTotals()).toEqual({
      games: BASELINE.games + SEASON_FIGS.games,
      runs: BASELINE.runs + SEASON_FIGS.runs,
      wickets: BASELINE.wickets + SEASON_FIGS.wickets,
    });
    expect(await baselineTotals()).toEqual(BASELINE);
    const adj = await db
      .select()
      .from(baselineAdjustmentsTable)
      .where(
        and(
          eq(baselineAdjustmentsTable.playerId, playerId),
          eq(baselineAdjustmentsTable.season, SEASON),
        ),
      );
    expect(adj).toHaveLength(0);

    // Delete restores career to baseline (additive season removed).
    const del = await request(app)
      .delete(`/api/imports/${preview.importId}`)
      .set("Cookie", adminCookie);
    expect(del.status).toBe(204);
    expect(await careerTotals()).toEqual(BASELINE);
  });

  it("peel flags a negative warning when the season exceeds the baseline", async () => {
    const tooBig = {
      games: BASELINE.games + 5,
      runs: BASELINE.runs + 50,
      wickets: BASELINE.wickets + 2,
    };
    const preview = await uploadCsv(tooBig);
    const commit = await request(app)
      .post(`/api/imports/${preview.importId}/commit`)
      .set("Cookie", adminCookie)
      .send({ resolutions: [], reconcileMode: "peel" });
    expect(commit.status).toBe(200);
    expect(commit.body.negativeWarnings.length).toBeGreaterThan(0);
    const warn = commit.body.negativeWarnings.find(
      (w: { playerId: number }) => w.playerId === playerId,
    );
    expect(warn).toBeTruthy();
    expect(warn.seasonGames).toBe(tooBig.games);
    expect(warn.baselineGames).toBe(BASELINE.games);

    // Baseline floored at zero; delete restores it.
    expect((await baselineTotals()).games).toBe(0);
    const del = await request(app)
      .delete(`/api/imports/${preview.importId}`)
      .set("Cookie", adminCookie);
    expect(del.status).toBe(204);
    expect(await baselineTotals()).toEqual(BASELINE);
  });
});
