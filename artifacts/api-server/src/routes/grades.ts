import { Router, type IRouter } from "express";
import { eq, and, gt, desc, sum, count, sql } from "drizzle-orm";
import {
  db,
  gradeSummariesTable,
  playerGradeStatsTable,
  playersTable,
  recordsDisplaySettingsTable,
} from "@workspace/db";
import { UpdateRecordsDisplaySettingsBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

router.get("/grades", async (_req, res): Promise<void> => {
  const grades = await db
    .select()
    .from(gradeSummariesTable)
    .orderBy(gradeSummariesTable.grade);
  // CLUB TOTAL is an aggregate row stored alongside real grades; it isn't a
  // grade users can pick, so filter it out of the API response.
  res.json(grades.filter((g) => g.grade !== "CLUB TOTAL"));
});

router.get("/grades/:grade/leaderboard", async (req, res): Promise<void> => {
  const rawGrade = Array.isArray(req.params.grade) ? req.params.grade[0] : req.params.grade;
  const grade = decodeURIComponent(rawGrade);

  const stats = await db
    .select()
    .from(playerGradeStatsTable)
    .where(eq(playerGradeStatsTable.grade, grade))
    .orderBy(desc(playerGradeStatsTable.games));

  res.json(stats);
});

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [playerCount] = await db.select({ count: count() }).from(playersTable);
  const [totals] = await db
    .select({
      totalGames: sum(playersTable.totalGames),
      totalRuns: sum(playersTable.totalRuns),
      totalWickets: sum(playersTable.totalWickets),
    })
    .from(playersTable);

  const allGradeSummaries = await db.select().from(gradeSummariesTable);
  // CLUB TOTAL is an aggregate row, not a real grade — exclude from counts and lists.
  const gradeSummaries = allGradeSummaries.filter((g) => g.grade !== "CLUB TOTAL");
  const gradesCount = gradeSummaries.length;

  // Top performers from club totals
  const [topRunScorer] = await db
    .select()
    .from(playersTable)
    .orderBy(desc(playersTable.totalRuns))
    .limit(1);

  const [topWicketTaker] = await db
    .select()
    .from(playersTable)
    .orderBy(desc(playersTable.totalWickets))
    .limit(1);

  // Top fielder by total catches across grades
  const catchLeaders = await db
    .select({
      playerId: playerGradeStatsTable.playerId,
      totalCatches: sum(playerGradeStatsTable.catches),
    })
    .from(playerGradeStatsTable)
    .groupBy(playerGradeStatsTable.playerId)
    .orderBy(desc(sum(playerGradeStatsTable.catches)))
    .limit(1);

  let topFielder = null;
  if (catchLeaders[0]) {
    const [fielder] = await db
      .select()
      .from(playersTable)
      .where(eq(playersTable.id, catchLeaders[0].playerId));
    topFielder = fielder;
  }

  res.json({
    totalPlayers: Number(playerCount?.count ?? 0),
    totalGames: Number(totals?.totalGames ?? 0),
    totalRuns: Number(totals?.totalRuns ?? 0),
    totalWickets: Number(totals?.totalWickets ?? 0),
    gradesCount,
    topRunScorer: topRunScorer ?? null,
    topWicketTaker: topWicketTaker ?? null,
    topFielder: topFielder ?? null,
    gradeSummaries,
  });
});

router.get("/records", async (_req, res): Promise<void> => {
  async function topAggregate(
    col:
      | typeof playerGradeStatsTable.games
      | typeof playerGradeStatsTable.runs
      | typeof playerGradeStatsTable.wickets
      | typeof playerGradeStatsTable.catches
      | typeof playerGradeStatsTable.fifties
      | typeof playerGradeStatsTable.hundreds,
  ): Promise<{
    playerId: number;
    givenName: string;
    surname: string;
    value: number;
    grades: string[];
  } | null> {
    const [row] = await db
      .select({
        playerId: playerGradeStatsTable.playerId,
        givenName: playerGradeStatsTable.givenName,
        surname: playerGradeStatsTable.surname,
        value: sum(col).as("value"),
      })
      .from(playerGradeStatsTable)
      .groupBy(
        playerGradeStatsTable.playerId,
        playerGradeStatsTable.givenName,
        playerGradeStatsTable.surname,
      )
      // NULLS LAST: Postgres sorts NULL first on DESC, so a player whose every
      // row for this stat is NULL would otherwise float to the top and report 0.
      .orderBy(sql`${sum(col)} desc nulls last`)
      .limit(1);
    if (!row) return null;
    // Every grade this leader actually appeared in (games > 0), so the
    // club-wide aggregate cards can show their grade badges.
    const gradeRows = await db
      .selectDistinct({ grade: playerGradeStatsTable.grade })
      .from(playerGradeStatsTable)
      .where(
        and(
          eq(playerGradeStatsTable.playerId, row.playerId),
          gt(playerGradeStatsTable.games, 0),
        ),
      );
    return {
      playerId: row.playerId,
      givenName: row.givenName,
      surname: row.surname,
      value: Number(row.value ?? 0),
      grades: gradeRows.map((g) => g.grade),
    };
  }

  const mostGames = await topAggregate(playerGradeStatsTable.games);
  const mostRuns = await topAggregate(playerGradeStatsTable.runs);
  const mostWickets = await topAggregate(playerGradeStatsTable.wickets);
  const mostCatches = await topAggregate(playerGradeStatsTable.catches);
  const mostFifties = await topAggregate(playerGradeStatsTable.fifties);
  const mostHundreds = await topAggregate(playerGradeStatsTable.hundreds);

  // Highest score and best bowling need custom logic (strings like "200", "162*", "8/12")
  // We parse numeric values from strings for comparison
  const allStats = await db
    .select({
      id: playerGradeStatsTable.id,
      playerId: playerGradeStatsTable.playerId,
      surname: playerGradeStatsTable.surname,
      givenName: playerGradeStatsTable.givenName,
      grade: playerGradeStatsTable.grade,
      games: playerGradeStatsTable.games,
      innings: playerGradeStatsTable.innings,
      notOuts: playerGradeStatsTable.notOuts,
      runs: playerGradeStatsTable.runs,
      batAvg: playerGradeStatsTable.batAvg,
      highScore: playerGradeStatsTable.highScore,
      fifties: playerGradeStatsTable.fifties,
      hundreds: playerGradeStatsTable.hundreds,
      wickets: playerGradeStatsTable.wickets,
      runsConceded: playerGradeStatsTable.runsConceded,
      bowlAvg: playerGradeStatsTable.bowlAvg,
      bestBowling: playerGradeStatsTable.bestBowling,
      fiveWickets: playerGradeStatsTable.fiveWickets,
      catches: playerGradeStatsTable.catches,
      stumpings: playerGradeStatsTable.stumpings,
      runOuts: playerGradeStatsTable.runOuts,
    })
    .from(playerGradeStatsTable);

  function parseHighScore(hs: string | null): number {
    if (!hs) return 0;
    return parseInt(hs.replace("*", ""), 10) || 0;
  }

  function parseBestBowling(bb: string | null): number {
    if (!bb || bb === "") return 0;
    const parts = bb.split("/");
    return parseInt(parts[0], 10) || 0;
  }

  const highestScoreStat = allStats
    .filter((s) => s.highScore)
    .sort((a, b) => parseHighScore(b.highScore) - parseHighScore(a.highScore))[0] ?? null;

  const bestBowlingStat = allStats
    .filter((s) => s.bestBowling && s.bestBowling !== "")
    .sort((a, b) => parseBestBowling(b.bestBowling) - parseBestBowling(a.bestBowling))[0] ?? null;

  res.json({
    mostGames: mostGames ?? null,
    mostRuns: mostRuns ?? null,
    mostWickets: mostWickets ?? null,
    highestScore: highestScoreStat,
    bestBowling: bestBowlingStat,
    mostCatches: mostCatches ?? null,
    mostFifties: mostFifties ?? null,
    mostHundreds: mostHundreds ?? null,
  });
});

// Singleton app-config controlling how the public Records page behaves by
// default: which tab opens first, the default grade for the By Grade tab, the
// default grade filter for Partnerships, and the default sort for the Centuries
// and 5-Wicket Hauls tables. Visitors can still change everything after load.
const RECORDS_SETTINGS_ID = 1;

async function ensureRecordsDisplaySettings() {
  const [existing] = await db
    .select()
    .from(recordsDisplaySettingsTable)
    .where(eq(recordsDisplaySettingsTable.id, RECORDS_SETTINGS_ID));
  if (existing) return existing;
  const [created] = await db
    .insert(recordsDisplaySettingsTable)
    .values({ id: RECORDS_SETTINGS_ID })
    .returning();
  return created;
}

function serializeRecordsDisplaySettings(
  row: typeof recordsDisplaySettingsTable.$inferSelect,
) {
  return {
    defaultTab: row.defaultTab as
      | "total"
      | "by-grade"
      | "partnerships"
      | "centuries"
      | "five-for",
    byGradeDefaultGrade: row.byGradeDefaultGrade,
    partnershipsDefaultGrade: row.partnershipsDefaultGrade,
    centuriesSort: row.centuriesSort,
    fiveForSort: row.fiveForSort,
  };
}

router.get("/records-display-settings", async (_req, res): Promise<void> => {
  const settings = await ensureRecordsDisplaySettings();
  res.json(serializeRecordsDisplaySettings(settings));
});

router.patch(
  "/records-display-settings",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = UpdateRecordsDisplaySettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const CENTURIES_SORT = /^(grade|batsman|score|season)-(asc|desc)$/;
    const FIVE_FOR_SORT = /^(grade|bowler|figures|season)-(asc|desc)$/;
    if (
      parsed.data.centuriesSort !== undefined &&
      !CENTURIES_SORT.test(parsed.data.centuriesSort)
    ) {
      res.status(400).json({ error: "Invalid centuriesSort value" });
      return;
    }
    if (
      parsed.data.fiveForSort !== undefined &&
      !FIVE_FOR_SORT.test(parsed.data.fiveForSort)
    ) {
      res.status(400).json({ error: "Invalid fiveForSort value" });
      return;
    }
    await ensureRecordsDisplaySettings();
    const [row] = await db
      .update(recordsDisplaySettingsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(recordsDisplaySettingsTable.id, RECORDS_SETTINGS_ID))
      .returning();
    res.json(serializeRecordsDisplaySettings(row));
  },
);

export default router;
