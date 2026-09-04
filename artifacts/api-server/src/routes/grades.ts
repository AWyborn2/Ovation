import { Router, type IRouter, type Request } from "express";
import { eq, and, desc, sum, count, gt, sql } from "drizzle-orm";
import {
  db,
  gradeSummariesTable,
  playerGradeStatsTable,
  playersTable,
  matchesTable,
  matchPlayerLinesTable,
  clubsTable,
  capRegisterTable,
  recordsDisplaySettingsTable,
  playerIdMapTable,
  type PlayerGradeStat,
} from "@workspace/db";
import {
  UpdateRecordsDisplaySettingsBody,
  GetSeniorSeasonTopPerformersQueryParams,
  GetGradeLeaderboardQueryParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { page } from "../lib/page";
import { dataSource } from "../lib/tenant";
import { getTenantId } from "../middlewares/tenant-context";
import { resolveCuration } from "../lib/central-curation";
import { getOrCreateSettings } from "../lib/settings";
import { overlayNativeOpponents, overlayCentralOpponents } from "../lib/club-brand";
import {
  opponentClubColumns,
  notEmptyFixture,
  matchDateExpr,
  seasonLabel,
  toRecentMatch,
  seasonLeaders,
  allTimeLeaders,
  seasonOptions,
  gradesForSeason,
  serializeRecordsDisplaySettings,
} from "../lib/grades-helpers";

const router: IRouter = Router();

router.get("/grades", async (req, res): Promise<void> => {
  // Central tenants get their grade summary cards derived from the central PCA
  // database (per-grade aggregates), filtered to their club. Native tenants
  // (Halls Head) keep the curated grade_summaries table below.
  const source = await dataSource(req);
  if (source.kind === "central") {
    const { centralGradeSummaries } = await import("@workspace/db/central-queries");
    const summaries = await centralGradeSummaries(source.clubId);
    res.json(summaries.map((s, i) => ({ id: i + 1, ...s })));
    return;
  }

  const grades = await db
    .select()
    .from(gradeSummariesTable)
    .orderBy(gradeSummariesTable.grade);
  // The A Grade card reports "players" as the size of the club's cap list, so
  // this count must be tenant-scoped — unfiltered it showed every club's caps
  // added together.
  const [aGradeCapCount] = await db
    .select({ value: count() })
    .from(capRegisterTable)
    .where(
      and(
        eq(capRegisterTable.tenantId, getTenantId(req)),
        eq(capRegisterTable.category, "male"),
      ),
    );
  res.json(
    grades
      .filter((g) => g.grade !== "CLUB TOTAL")
      .map((g) =>
        g.grade === "A Grade"
          ? { ...g, players: aGradeCapCount?.value ?? g.players }
          : g,
      ),
  );
});

// Load one grade's full leaderboard from the correct data source for this
// request's tenant (central or native), newest/biggest first. Extracted so
// batch consumers (the carousel-set generator) reuse the exact same rows the
// route serves. Pagination is applied by the caller.
export async function loadGradeLeaderboard(
  req: Request,
  grade: string,
): Promise<PlayerGradeStat[]> {
  const source = await dataSource(req);
  if (source.kind === "central") {
    const { centralGradeLeaderboard } = await import("@workspace/db/central-queries");
    const tenantId = getTenantId(req);
    const [clubId, mapRows, curation] = await Promise.all([
      source.clubId,
      db
        .select({
          participantId: playerIdMapTable.participantId,
          playerId: playerIdMapTable.playerId,
        })
        .from(playerIdMapTable)
        .where(eq(playerIdMapTable.tenantId, tenantId)),
      resolveCuration(tenantId),
    ]);
    const intByGuid = new Map(mapRows.map((m) => [m.participantId, m.playerId]));
    return centralGradeLeaderboard(grade, {
      clubId,
      intByGuid,
      nameByGuid: curation.nameByGuid,
    });
  }

  return db
    .select()
    .from(playerGradeStatsTable)
    .where(eq(playerGradeStatsTable.grade, grade))
    .orderBy(desc(playerGradeStatsTable.games));
}

router.get("/grades/:grade/leaderboard", async (req, res): Promise<void> => {
  const rawGrade = Array.isArray(req.params.grade) ? req.params.grade[0] : req.params.grade;
  const grade = decodeURIComponent(rawGrade);

  // Optional and additive: no params means the whole grade, exactly as before,
  // so existing web and mobile callers are unchanged. Applied to BOTH read
  // paths — paginating only the native one would make the two branches disagree
  // about what a page contains.
  const query = GetGradeLeaderboardQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { limit, offset } = query.data;

  // Sliced after the (possibly cached) read rather than pushed into the query:
  // centralGradeLeaderboard caches on (grade, clubId, crosswalk), so paging
  // inside it would cache a separate copy of the club's history per page; the
  // native path's full grade is already in memory too.
  const rows = await loadGradeLeaderboard(req, grade);
  res.json(page(rows, limit, offset));
});

router.get("/dashboard", async (req, res): Promise<void> => {
  // Central tenants: totals, top performers and grade summaries all derived from
  // the central PCA database, filtered to their club. Top-performer GUIDs are
  // mapped to the tenant's int player ids via player_id_map.
  const source = await dataSource(req);
  if (source.kind === "central") {
    const { centralDashboard } = await import("@workspace/db/central-queries");
    const tenantId = getTenantId(req);
    const [dash, mapRows] = await Promise.all([
      centralDashboard(source.clubId),
      db
        .select({ participantId: playerIdMapTable.participantId, playerId: playerIdMapTable.playerId })
        .from(playerIdMapTable)
        .where(eq(playerIdMapTable.tenantId, tenantId)),
    ]);
    const intByGuid = new Map(mapRows.map((m) => [m.participantId, m.playerId]));
    const splitName = (dn: string | null) => {
      const parts = (dn ?? "").trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return { givenName: "", surname: "" };
      if (parts.length === 1) return { givenName: parts[0], surname: "" };
      return { givenName: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
    };
    const toPerformer = (
      p: { participantId: string; displayName: string | null; value: number } | null,
    ) =>
      p
        ? { id: intByGuid.get(p.participantId) ?? 0, ...splitName(p.displayName), value: p.value }
        : null;
    res.json({
      totalPlayers: dash.totalPlayers,
      totalGames: dash.totalGames,
      totalRuns: dash.totalRuns,
      totalWickets: dash.totalWickets,
      gradesCount: dash.gradesCount,
      topRunScorer: toPerformer(dash.topRunScorer),
      topWicketTaker: toPerformer(dash.topWicketTaker),
      topFielder: toPerformer(dash.topFielder),
      gradeSummaries: dash.gradeSummaries.map((s, i) => ({ id: i + 1, ...s })),
    });
    return;
  }

  const [playerCount] = await db.select({ count: count() }).from(playersTable);
  const [totals] = await db
    .select({
      totalGames: sum(playersTable.totalGames),
      totalRuns: sum(playersTable.totalRuns),
      totalWickets: sum(playersTable.totalWickets),
    })
    .from(playersTable);

  const allGradeSummaries = await db.select().from(gradeSummariesTable);
  const gradeSummaries = allGradeSummaries.filter((g) => g.grade !== "CLUB TOTAL");
  const gradesCount = gradeSummaries.length;

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

router.get("/overview", async (req, res): Promise<void> => {
  const source = await dataSource(req);
  if (source.kind === "central") {
    const central = await import("@workspace/db/central-queries");
    const clubId = source.clubId;
    const tenantId = getTenantId(req);
    const [totals, seasons, mapRows] = await Promise.all([
      central.centralClubTotals(clubId),
      central.centralClubSeasons(clubId),
      db
        .select({
          participantId: playerIdMapTable.participantId,
          playerId: playerIdMapTable.playerId,
        })
        .from(playerIdMapTable)
        .where(eq(playerIdMapTable.tenantId, tenantId)),
    ]);
    const intByGuid = new Map(mapRows.map((m) => [m.participantId, m.playerId]));
    const latestSeason = seasons[0] ?? null;

    let recentMatches: Awaited<ReturnType<typeof central.centralClubMatches>> = [];
    let topRunScorers: { playerId: number; givenName: string; surname: string; value: number }[] = [];
    let topWicketTakers: typeof topRunScorers = [];

    if (latestSeason !== null) {
      const seasonMatches = await central.centralClubMatches(clubId, { season: latestSeason });
      const seen = new Set<string>();
      recentMatches = seasonMatches.filter((m) => {
        if (seen.has(m.grade)) return false;
        seen.add(m.grade);
        return true;
      });
      // Show an opponent's own uploaded brand (crest/colours) where that club is
      // a tenant — central.clubs has no logo, so this is its source.
      const overlaid = await overlayCentralOpponents(
        recentMatches.map((m) => m.opponentClub),
      );
      recentMatches = recentMatches.map((m, i) => ({ ...m, opponentClub: overlaid[i] }));
      const splitName = (dn: string | null) => {
        const parts = (dn ?? "").trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) return { givenName: "", surname: "" };
        if (parts.length === 1) return { givenName: parts[0], surname: "" };
        return { givenName: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
      };
      const toLeader = (l: { participantId: string; displayName: string | null; value: number }) => ({
        playerId: intByGuid.get(l.participantId) ?? 0,
        ...splitName(l.displayName),
        value: l.value,
      });
      const [runs, wkts] = await Promise.all([
        central.centralSeasonLeaders(clubId, latestSeason, "runs"),
        central.centralSeasonLeaders(clubId, latestSeason, "wickets"),
      ]);
      topRunScorers = runs.map(toLeader);
      topWicketTakers = wkts.map(toLeader);
    }

    res.json({
      latestSeason,
      latestSeasonLabel: latestSeason === null ? null : seasonLabel(latestSeason),
      availableSeasons: seasons.map((s) => ({ season: s, label: seasonLabel(s) })),
      totals,
      recentMatches,
      topRunScorers,
      topWicketTakers,
    });
    return;
  }

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
        clubScore: matchesTable.hhccScore,
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

    const seen = new Set<string>();
    recentMatches = rows
      .filter((r) => {
        if (seen.has(r.grade)) return false;
        seen.add(r.grade);
        return true;
      })
      .map(toRecentMatch);

    // Overlay uploaded brands for opponent clubs that are themselves tenants.
    const overlaid = await overlayNativeOpponents(
      recentMatches.map((m) => m.opponentClub),
    );
    recentMatches = recentMatches.map((m, i) => ({ ...m, opponentClub: overlaid[i] }));

    [topRunScorers, topWicketTakers] = await Promise.all([
      seasonLeaders(latestSeason, "runs"),
      seasonLeaders(latestSeason, "wickets"),
    ]);
  }

  res.json({
    latestSeason,
    latestSeasonLabel: latestSeason === null ? null : seasonLabel(latestSeason),
    availableSeasons: await seasonOptions(),
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

router.get("/overview/top-performers", async (req, res): Promise<void> => {
  const parsed = GetSeniorSeasonTopPerformersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
    return;
  }
  const grade = parsed.data.grade?.trim() || undefined;
  const allTime = parsed.data.allTime === true;
  const requestedSeason = parsed.data.season ?? null;

  // Central tenants: leaders, season default and grade chips all come from the
  // central PCA database filtered to the tenant's club — never the native
  // (Halls Head) snapshot tables. GUIDs map to tenant int ids via player_id_map.
  const source = await dataSource(req);
  if (source.kind === "central") {
    const central = await import("@workspace/db/central-queries");
    const clubId = source.clubId;
    const tenantId = getTenantId(req);
    const mapRows = await db
      .select({
        participantId: playerIdMapTable.participantId,
        playerId: playerIdMapTable.playerId,
      })
      .from(playerIdMapTable)
      .where(eq(playerIdMapTable.tenantId, tenantId));
    const intByGuid = new Map(mapRows.map((m) => [m.participantId, m.playerId]));
    const splitName = (dn: string | null) => {
      const parts = (dn ?? "").trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return { givenName: "", surname: "" };
      if (parts.length === 1) return { givenName: parts[0], surname: "" };
      return { givenName: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
    };
    const toLeader = (l: { participantId: string; displayName: string | null; value: number }) => ({
      playerId: intByGuid.get(l.participantId) ?? 0,
      ...splitName(l.displayName),
      value: l.value,
    });

    if (allTime) {
      const [runs, wkts, availableGrades] = await Promise.all([
        central.centralAllTimeLeaders(clubId, "runs", grade),
        central.centralAllTimeLeaders(clubId, "wickets", grade),
        central.centralGradesForSeason(clubId, null),
      ]);
      res.json({
        season: null,
        seasonLabel: null,
        availableGrades,
        topRunScorers: runs.map(toLeader),
        topWicketTakers: wkts.map(toLeader),
      });
      return;
    }

    let season = requestedSeason;
    if (season === null) {
      const seasons = await central.centralClubSeasons(clubId);
      season = seasons[0] ?? null;
    }
    if (season === null) {
      res.json({
        season: null,
        seasonLabel: null,
        availableGrades: [],
        topRunScorers: [],
        topWicketTakers: [],
      });
      return;
    }

    const [runs, wkts, availableGrades] = await Promise.all([
      central.centralSeasonLeaders(clubId, season, "runs", grade),
      central.centralSeasonLeaders(clubId, season, "wickets", grade),
      central.centralGradesForSeason(clubId, season),
    ]);
    res.json({
      season,
      seasonLabel: seasonLabel(season),
      availableGrades,
      topRunScorers: runs.map(toLeader),
      topWicketTakers: wkts.map(toLeader),
    });
    return;
  }

  if (allTime) {
    const [topRunScorers, topWicketTakers, availableGrades] = await Promise.all([
      allTimeLeaders("runs", grade),
      allTimeLeaders("wickets", grade),
      gradesForSeason(null),
    ]);
    res.json({
      season: null,
      seasonLabel: null,
      availableGrades,
      topRunScorers,
      topWicketTakers,
    });
    return;
  }

  let season = requestedSeason;
  if (season === null) {
    const [latest] = await db
      .select({ season: matchesTable.season })
      .from(matchesTable)
      .where(notEmptyFixture)
      .orderBy(desc(matchesTable.season))
      .limit(1);
    season = latest?.season ?? null;
  }

  if (season === null) {
    res.json({
      season: null,
      seasonLabel: null,
      availableGrades: [],
      topRunScorers: [],
      topWicketTakers: [],
    });
    return;
  }

  const [topRunScorers, topWicketTakers, availableGrades] = await Promise.all([
    seasonLeaders(season, "runs", grade),
    seasonLeaders(season, "wickets", grade),
    gradesForSeason(season),
  ]);
  res.json({
    season,
    seasonLabel: seasonLabel(season),
    availableGrades,
    topRunScorers,
    topWicketTakers,
  });
});

router.get("/records", async (req, res): Promise<void> => {
  const source = await dataSource(req);
  if (source.kind === "central") {
    const { centralClubRecords } = await import("@workspace/db/central-queries");
    const tenantId = getTenantId(req);
    const [records, mapRows] = await Promise.all([
      centralClubRecords(source.clubId),
      db
        .select({
          participantId: playerIdMapTable.participantId,
          playerId: playerIdMapTable.playerId,
        })
        .from(playerIdMapTable)
        .where(eq(playerIdMapTable.tenantId, tenantId)),
    ]);
    const intByGuid = new Map(mapRows.map((m) => [m.participantId, m.playerId]));
    const split = (dn: string | null) => {
      const parts = (dn ?? "").trim().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return { givenName: "", surname: "" };
      if (parts.length === 1) return { givenName: parts[0], surname: "" };
      return { givenName: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
    };
    const holder = (h: { participantId: string; displayName: string | null; value: number; grades: string[] } | null) =>
      h ? { playerId: intByGuid.get(h.participantId) ?? 0, ...split(h.displayName), value: h.value, grades: h.grades } : null;
    const innings = (
      h: { participantId: string; displayName: string | null; grade: string | null; value: string } | null,
      field: "highScore" | "bestBowling",
    ) =>
      h
        ? {
            id: 0,
            playerId: intByGuid.get(h.participantId) ?? 0,
            ...split(h.displayName),
            grade: h.grade,
            games: null, innings: null, notOuts: null, runs: null, batAvg: null,
            highScore: field === "highScore" ? h.value : null,
            fifties: null, hundreds: null, wickets: null, runsConceded: null, bowlAvg: null,
            bestBowling: field === "bestBowling" ? h.value : null,
            fiveWickets: null, catches: null, stumpings: null, runOuts: null,
          }
        : null;
    res.json({
      mostGames: holder(records.mostGames),
      mostRuns: holder(records.mostRuns),
      mostWickets: holder(records.mostWickets),
      highestScore: innings(records.highestScore, "highScore"),
      bestBowling: innings(records.bestBowling, "bestBowling"),
      mostCatches: holder(records.mostCatches),
      mostFifties: holder(records.mostFifties),
      mostHundreds: holder(records.mostHundreds),
    });
    return;
  }

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
      .orderBy(sql`${sum(col)} desc nulls last`)
      .limit(1);
    if (!row) return null;
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

router.get("/records-display-settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings(recordsDisplaySettingsTable, getTenantId(req));
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
    const tenantId = getTenantId(req);
    await getOrCreateSettings(recordsDisplaySettingsTable, tenantId);
    const [row] = await db
      .update(recordsDisplaySettingsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(recordsDisplaySettingsTable.tenantId, tenantId))
      .returning();
    res.json(serializeRecordsDisplaySettings(row));
  },
);

export default router;
