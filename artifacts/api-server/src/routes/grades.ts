import { Router, type IRouter } from "express";
import { eq, desc, sum, count } from "drizzle-orm";
import { db, gradeSummariesTable, playerGradeStatsTable, playersTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/grades", async (_req, res): Promise<void> => {
  const grades = await db
    .select()
    .from(gradeSummariesTable)
    .orderBy(gradeSummariesTable.grade);
  res.json(grades);
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

  const gradeSummaries = await db.select().from(gradeSummariesTable);
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
  const [mostGames] = await db
    .select()
    .from(playerGradeStatsTable)
    .orderBy(desc(playerGradeStatsTable.games))
    .limit(1);

  const [mostRuns] = await db
    .select()
    .from(playerGradeStatsTable)
    .orderBy(desc(playerGradeStatsTable.runs))
    .limit(1);

  const [mostWickets] = await db
    .select()
    .from(playerGradeStatsTable)
    .orderBy(desc(playerGradeStatsTable.wickets))
    .limit(1);

  const [mostCatches] = await db
    .select()
    .from(playerGradeStatsTable)
    .orderBy(desc(playerGradeStatsTable.catches))
    .limit(1);

  const [mostFifties] = await db
    .select()
    .from(playerGradeStatsTable)
    .orderBy(desc(playerGradeStatsTable.fifties))
    .limit(1);

  const [mostHundreds] = await db
    .select()
    .from(playerGradeStatsTable)
    .orderBy(desc(playerGradeStatsTable.hundreds))
    .limit(1);

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

export default router;
