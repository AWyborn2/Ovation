import { Router, type IRouter } from "express";
import { eq, and, desc, sum, count, lt, gt, sql, type SQL } from "drizzle-orm";
import {
  db,
  gradeSummariesTable,
  playerGradeStatsTable,
  playerGradeSeasonStatsTable,
  playersTable,
  matchesTable,
  matchPlayerLinesTable,
  clubsTable,
  recordsDisplaySettingsTable,
} from "@workspace/db";
import {
  UpdateRecordsDisplaySettingsBody,
  GetSeniorSeasonTopPerformersQueryParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

// Fill-in players are stored on match lines for scorecard history but have no
// real player record; they must never surface in any derived stat/leaderboard.
const FILL_IN_FLOOR = 90000;

// Branding columns for a match's opposition club (mirrors matches.ts).
const opponentClubColumns = {
  opponentClubId: clubsTable.id,
  opponentClubName: clubsTable.name,
  opponentClubShortName: clubsTable.shortName,
  opponentClubLogoUrl: clubsTable.logoUrl,
  opponentClubLogoUrl128: clubsTable.logoUrl128,
  opponentClubPrimaryColour: clubsTable.primaryColour,
  opponentClubSecondaryColour: clubsTable.secondaryColour,
};

function toOpponentClub(row: {
  opponentClubId: number | null;
  opponentClubName: string | null;
  opponentClubShortName: string | null;
  opponentClubLogoUrl: string | null;
  opponentClubLogoUrl128: string | null;
  opponentClubPrimaryColour: string | null;
  opponentClubSecondaryColour: string | null;
}) {
  if (row.opponentClubId == null || row.opponentClubName == null) return null;
  return {
    id: row.opponentClubId,
    name: row.opponentClubName,
    shortName: row.opponentClubShortName,
    logoUrl: row.opponentClubLogoUrl,
    logoUrl128: row.opponentClubLogoUrl128,
    primaryColour: row.opponentClubPrimaryColour,
    secondaryColour: row.opponentClubSecondaryColour,
  };
}

// Hide empty placeholder / "bye" fixture shells (mirrors matches.ts).
const notEmptyFixture: SQL = sql`NOT (
  (${matchesTable.opponent} IS NULL OR btrim(${matchesTable.opponent}) = '')
  AND COALESCE(${matchesTable.abandoned}, false) = false
  AND (${matchesTable.result} IS NULL OR btrim(${matchesTable.result}) = '')
  AND (${matchesTable.hhccScore} IS NULL OR btrim(${matchesTable.hhccScore}) = '')
  AND (${matchesTable.opponentScore} IS NULL OR btrim(${matchesTable.opponentScore}) = '')
  AND NOT EXISTS (SELECT 1 FROM match_player_lines mpl WHERE mpl.match_id = ${matchesTable.id})
  AND NOT EXISTS (SELECT 1 FROM match_opposition_lines mol WHERE mol.match_id = ${matchesTable.id})
)`;

// Parse the free-text match_date ("12:20 PM, Saturday, 14 Mar 2026") for ordering.
const matchDateExpr = sql`CASE WHEN ${matchesTable.matchDate} ~ '^[0-9]{1,2}:[0-9]{2} (AM|PM), [A-Za-z]+, [0-9]{1,2} [A-Za-z]{3} [0-9]{4}$' THEN to_timestamp(${matchesTable.matchDate}, 'HH12:MI AM, Day, DD Mon YYYY') END`;

function seasonLabel(season: number): string {
  return `${season}/${String((season + 1) % 100).padStart(2, "0")}`;
}

// Collapse a joined match row into a MatchSummary (mirrors matches.ts list shape).
function toRecentMatch(row: {
  id: number;
  grade: string;
  season: number;
  round: number | null;
  stage: string | null;
  competition: string | null;
  matchDate: string | null;
  venue: string | null;
  result: string | null;
  opponent: string | null;
  hhccScore: string | null;
  opponentScore: string | null;
  abandoned: boolean | null;
  playerCount: number;
  opponentClubId: number | null;
  opponentClubName: string | null;
  opponentClubShortName: string | null;
  opponentClubLogoUrl: string | null;
  opponentClubLogoUrl128: string | null;
  opponentClubPrimaryColour: string | null;
  opponentClubSecondaryColour: string | null;
}) {
  return {
    id: row.id,
    grade: row.grade,
    season: row.season,
    round: row.round,
    stage: row.stage,
    competition: row.competition,
    matchDate: row.matchDate,
    venue: row.venue,
    result: row.result,
    opponent: row.opponent,
    hhccScore: row.hhccScore,
    opponentScore: row.opponentScore,
    abandoned: row.abandoned ?? false,
    playerCount: row.playerCount,
    opponentClub: toOpponentClub(row),
  };
}

// Latest-season top run scorers / wicket takers, aggregated across every grade a
// player turned out in that season. Fill-ins are excluded; an optional grade
// scopes the list to a single grade. Players with a zero tally are dropped.
async function seasonLeaders(
  season: number,
  metric: "runs" | "wickets",
  grade?: string,
): Promise<{ playerId: number; givenName: string; surname: string; value: number }[]> {
  const col =
    metric === "runs"
      ? playerGradeSeasonStatsTable.runs
      : playerGradeSeasonStatsTable.wickets;
  const conds: SQL[] = [
    eq(playerGradeSeasonStatsTable.season, season),
    lt(playerGradeSeasonStatsTable.playerId, FILL_IN_FLOOR),
  ];
  if (grade) conds.push(eq(playerGradeSeasonStatsTable.grade, grade));

  const rows = await db
    .select({
      playerId: playerGradeSeasonStatsTable.playerId,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
      value: sum(col).mapWith(Number),
    })
    .from(playerGradeSeasonStatsTable)
    .innerJoin(playersTable, eq(playersTable.id, playerGradeSeasonStatsTable.playerId))
    .where(and(...conds))
    .groupBy(playerGradeSeasonStatsTable.playerId, playersTable.givenName, playersTable.surname)
    .having(gt(sum(col), 0))
    .orderBy(desc(sum(col)))
    .limit(5);

  return rows.map((r) => ({
    playerId: r.playerId,
    givenName: r.givenName,
    surname: r.surname,
    value: Number(r.value ?? 0),
  }));
}

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

// Seniors home overview: club totals, latest season's most recent match per
// grade, and that season's club-wide top run scorers / wicket takers.
router.get("/overview", async (_req, res): Promise<void> => {
  // Club totals (mirrors /dashboard's all-time figures).
  const [playerCount] = await db.select({ count: count() }).from(playersTable);
  const [totals] = await db
    .select({
      totalGames: sum(playersTable.totalGames),
      totalRuns: sum(playersTable.totalRuns),
      totalWickets: sum(playersTable.totalWickets),
    })
    .from(playersTable);
  const allGradeSummaries = await db.select().from(gradeSummariesTable);
  const gradesCount = allGradeSummaries.filter((g) => g.grade !== "CLUB TOTAL").length;

  // Latest season = newest season with a real (non-empty) fixture.
  const [latest] = await db
    .select({ season: matchesTable.season })
    .from(matchesTable)
    .where(notEmptyFixture)
    .orderBy(desc(matchesTable.season))
    .limit(1);
  const latestSeason = latest?.season ?? null;

  let recentMatches: ReturnType<typeof toRecentMatch>[] = [];
  let topRunScorers: Awaited<ReturnType<typeof seasonLeaders>> = [];
  let topWicketTakers: Awaited<ReturnType<typeof seasonLeaders>> = [];

  if (latestSeason !== null) {
    // All real fixtures in the latest season, newest-first within each grade.
    const rows = await db
      .select({
        id: matchesTable.id,
        grade: matchesTable.grade,
        season: matchesTable.season,
        round: matchesTable.round,
        stage: matchesTable.stage,
        competition: matchesTable.competition,
        matchDate: matchesTable.matchDate,
        venue: matchesTable.venue,
        result: matchesTable.result,
        opponent: matchesTable.opponent,
        hhccScore: matchesTable.hhccScore,
        opponentScore: matchesTable.opponentScore,
        abandoned: matchesTable.abandoned,
        playerCount: count(matchPlayerLinesTable.id),
        ...opponentClubColumns,
      })
      .from(matchesTable)
      .leftJoin(matchPlayerLinesTable, eq(matchPlayerLinesTable.matchId, matchesTable.id))
      .leftJoin(clubsTable, eq(clubsTable.id, matchesTable.opponentClubId))
      .where(and(eq(matchesTable.season, latestSeason), notEmptyFixture))
      .groupBy(matchesTable.id, clubsTable.id)
      .orderBy(
        matchesTable.grade,
        sql`${matchDateExpr} desc nulls last`,
        desc(matchesTable.round),
        desc(matchesTable.id),
      );

    // Keep only the most recent match per grade (first row per grade above).
    const seen = new Set<string>();
    recentMatches = rows
      .filter((r) => {
        if (seen.has(r.grade)) return false;
        seen.add(r.grade);
        return true;
      })
      .map(toRecentMatch);

    [topRunScorers, topWicketTakers] = await Promise.all([
      seasonLeaders(latestSeason, "runs"),
      seasonLeaders(latestSeason, "wickets"),
    ]);
  }

  res.json({
    latestSeason,
    latestSeasonLabel: latestSeason === null ? null : seasonLabel(latestSeason),
    totals: {
      players: Number(playerCount?.count ?? 0),
      games: Number(totals?.totalGames ?? 0),
      runs: Number(totals?.totalRuns ?? 0),
      wickets: Number(totals?.totalWickets ?? 0),
      grades: gradesCount,
    },
    recentMatches,
    topRunScorers,
    topWicketTakers,
  });
});

// Latest-season top performers, optionally scoped to a single grade.
router.get("/overview/top-performers", async (req, res): Promise<void> => {
  const parsed = GetSeniorSeasonTopPerformersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
    return;
  }
  const grade = parsed.data.grade?.trim() || undefined;

  const [latest] = await db
    .select({ season: matchesTable.season })
    .from(matchesTable)
    .where(notEmptyFixture)
    .orderBy(desc(matchesTable.season))
    .limit(1);
  const latestSeason = latest?.season ?? null;

  if (latestSeason === null) {
    res.json({ topRunScorers: [], topWicketTakers: [] });
    return;
  }

  const [topRunScorers, topWicketTakers] = await Promise.all([
    seasonLeaders(latestSeason, "runs", grade),
    seasonLeaders(latestSeason, "wickets", grade),
  ]);
  res.json({ topRunScorers, topWicketTakers });
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
