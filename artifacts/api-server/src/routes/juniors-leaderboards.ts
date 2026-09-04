import { Router, type IRouter } from "express";
import { eq, and, desc, isNotNull, sql } from "drizzle-orm";
import {
  db,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorParticipantsTable,
  juniorPremiershipsTable,
  clubsTable,
} from "@workspace/db";
import {
  opponentClubColumns,
  toOpponentClub,
  seasonYear,
  toMatchSummary,
  isNotOut,
  ageGroupsForSeason,
  JUNIOR_MILESTONE_TIERS,
  JUNIOR_STAT_SINGULAR,
} from "../lib/junior-helpers";
import {
  ListJuniorLeaderboardQueryParams,
  GetJuniorSeasonTopPerformersQueryParams,
} from "@workspace/api-zod";
import { isCentralTenant } from "../lib/tenant";
import { overlayNativeOpponents } from "../lib/club-brand";
import {
  battingLeaders,
  bestBowlingFigures,
  bowlingLeaders,
  highestScoreInnings,
  rosterGamesByParticipant,
} from "../lib/junior-leaderboards";

/**
 * Junior aggregates: season overview, top performers, leaderboards, and
 * social-milestone tallies.
 *
 * JUNIORS read API — see routes/juniors.ts for the isolation and privacy
 * rules every handler here follows. Mounted by routes/juniors.ts.
 */
const router: IRouter = Router();

// ---------------------------------------------------------------------------
// GET /juniors/overview
// ---------------------------------------------------------------------------
router.get("/juniors/overview", async (req, res): Promise<void> => {
  // Junior data is tenant-local and central is seniors-only, so a central tenant
  // has no junior history of its own — return the empty overview rather than the
  // demo tenant's (Halls Head) juniors.
  if (await isCentralTenant(req)) {
    res.json({
      totals: { matches: 0, players: 0, premierships: 0, seasons: 0, ageGroups: 0 },
      latestSeason: null,
      recentMatches: [],
      topRunScorers: [],
      topWicketTakers: [],
    });
    return;
  }

  const [[matchCount], [playerCount], [premCount], [seasonCount], [ageCount]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(juniorMatchesTable),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(juniorParticipantsTable)
      .where(eq(juniorParticipantsTable.isPrivate, false)),
    db.select({ n: sql<number>`count(*)::int` }).from(juniorPremiershipsTable),
    db
      .select({
        n: sql<number>`count(distinct ${juniorMatchesTable.season})::int`,
      })
      .from(juniorMatchesTable),
    db
      .select({
        n: sql<number>`count(distinct ${juniorMatchesTable.ageGroup})::int`,
      })
      .from(juniorMatchesTable),
  ]);

  // Latest season = the season string with the newest parsed start year.
  const [latest] = await db
    .select({ season: juniorMatchesTable.season })
    .from(juniorMatchesTable)
    .where(isNotNull(juniorMatchesTable.season))
    .orderBy(desc(seasonYear), desc(juniorMatchesTable.id))
    .limit(1);
  const latestSeason = latest?.season ?? null;

  let recentMatches: ReturnType<typeof toMatchSummary>[] = [];
  let topRunScorers: Awaited<ReturnType<typeof battingLeaders>> = [];
  let topWicketTakers: Awaited<ReturnType<typeof bowlingLeaders>> = [];

  if (latestSeason !== null) {
    // Every match in the latest season, newest-first; keep the first per age group.
    const seasonRows = await db
      .select({ match: juniorMatchesTable, ...opponentClubColumns })
      .from(juniorMatchesTable)
      .leftJoin(clubsTable, eq(clubsTable.id, juniorMatchesTable.opponentClubId))
      .where(eq(juniorMatchesTable.season, latestSeason))
      .orderBy(desc(juniorMatchesTable.id));
    const seenAge = new Set<string>();
    const recentRows = seasonRows.filter((r) => {
      const key = r.match.ageGroup ?? "";
      if (seenAge.has(key)) return false;
      seenAge.add(key);
      return true;
    });
    // Overlay uploaded brands for opponent clubs that are themselves tenants.
    const recentOpps = await overlayNativeOpponents(recentRows.map(toOpponentClub));
    recentMatches = recentRows.map((r, i) => toMatchSummary(r.match, recentOpps[i]));

    [topRunScorers, topWicketTakers] = await Promise.all([
      battingLeaders(5, { season: latestSeason }),
      bowlingLeaders(5, { season: latestSeason }),
    ]);
  }

  res.json({
    totals: {
      matches: matchCount?.n ?? 0,
      players: playerCount?.n ?? 0,
      premierships: premCount?.n ?? 0,
      seasons: seasonCount?.n ?? 0,
      ageGroups: ageCount?.n ?? 0,
    },
    latestSeason,
    recentMatches,
    topRunScorers,
    topWicketTakers,
  });
});

// ---------------------------------------------------------------------------
// GET /juniors/top-performers — latest-season top run scorers / wicket takers,
// optionally scoped to a single age group. Private participants always excluded.
// ---------------------------------------------------------------------------
router.get("/juniors/top-performers", async (req, res): Promise<void> => {
  const parsed = GetJuniorSeasonTopPerformersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
    return;
  }
  const ageGroup = parsed.data.ageGroup?.trim() || undefined;
  const allTime = parsed.data.allTime === true;
  const requestedSeason = parsed.data.season?.trim() || undefined;

  // Junior data is tenant-local (the native junior_* tables hold only the demo
  // tenant's juniors) — a central tenant gets the empty shape, never another
  // club's junior players.
  if (await isCentralTenant(req)) {
    res.json({ season: null, availableAgeGroups: [], topRunScorers: [], topWicketTakers: [] });
    return;
  }

  // All-time: aggregate across every season.
  if (allTime) {
    const [topRunScorers, topWicketTakers, availableAgeGroups] = await Promise.all([
      battingLeaders(5, { ageGroup }),
      bowlingLeaders(5, { ageGroup }),
      ageGroupsForSeason(null),
    ]);
    res.json({ season: null, availableAgeGroups, topRunScorers, topWicketTakers });
    return;
  }

  // Resolve the season: explicit request, else the latest season with matches.
  let season = requestedSeason ?? null;
  if (season === null) {
    const [latest] = await db
      .select({ season: juniorMatchesTable.season })
      .from(juniorMatchesTable)
      .where(isNotNull(juniorMatchesTable.season))
      .orderBy(desc(seasonYear), desc(juniorMatchesTable.id))
      .limit(1);
    season = latest?.season ?? null;
  }

  if (season === null) {
    res.json({ season: null, availableAgeGroups: [], topRunScorers: [], topWicketTakers: [] });
    return;
  }

  const [topRunScorers, topWicketTakers, availableAgeGroups] = await Promise.all([
    battingLeaders(5, { season, ageGroup }),
    bowlingLeaders(5, { season, ageGroup }),
    ageGroupsForSeason(season),
  ]);
  res.json({ season, availableAgeGroups, topRunScorers, topWicketTakers });
});

// ---------------------------------------------------------------------------
// GET /juniors/leaderboards
// ---------------------------------------------------------------------------
router.get("/juniors/leaderboards", async (req, res): Promise<void> => {
  // Central tenants have no native junior lines — empty boards, no leak.
  if (await isCentralTenant(req)) {
    res.json({ mostRuns: [], mostWickets: [], highestScores: [], bestBowling: [] });
    return;
  }
  const [mostRuns, mostWickets, highestScores, bestBowling] = await Promise.all([
    battingLeaders(25),
    bowlingLeaders(25),
    highestScoreInnings(25),
    bestBowlingFigures(25),
  ]);
  res.json({ mostRuns, mostWickets, highestScores, bestBowling });
});

// ---------------------------------------------------------------------------
// GET /juniors/leaderboard — rich combined batting + bowling aggregate, one row
// per HH junior, filterable by age group + season. Aggregated in JS from
// Halls Head lines only (inner-join participants is_private=false excludes
// opposition AND private players). Junior data never touches a senior table.
// ---------------------------------------------------------------------------
router.get("/juniors/leaderboard", async (req, res): Promise<void> => {
  const parsed = ListJuniorLeaderboardQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.issues });
    return;
  }
  const { season, ageGroup } = parsed.data;

  // Central tenants have no native junior lines — empty leaderboard, no leak.
  if (await isCentralTenant(req)) {
    res.json([]);
    return;
  }

  const matchConds = [eq(juniorMatchBattingTable.isHallsHead, true)];
  if (season) matchConds.push(eq(juniorMatchesTable.season, season));
  if (ageGroup) matchConds.push(eq(juniorMatchesTable.ageGroup, ageGroup));

  const bowlConds = [eq(juniorMatchBowlingTable.isHallsHead, true)];
  if (season) bowlConds.push(eq(juniorMatchesTable.season, season));
  if (ageGroup) bowlConds.push(eq(juniorMatchesTable.ageGroup, ageGroup));

  const [battingRows, bowlingRows] = await Promise.all([
    db
      .select({
        participantId: juniorParticipantsTable.participantId,
        displayName: juniorParticipantsTable.displayName,
        runs: juniorMatchBattingTable.runs,
        dismissal: juniorMatchBattingTable.dismissal,
      })
      .from(juniorMatchBattingTable)
      .innerJoin(
        juniorParticipantsTable,
        eq(juniorParticipantsTable.participantId, juniorMatchBattingTable.participantId),
      )
      .innerJoin(juniorMatchesTable, eq(juniorMatchesTable.id, juniorMatchBattingTable.matchId))
      .where(and(eq(juniorParticipantsTable.isPrivate, false), ...matchConds)),
    db
      .select({
        participantId: juniorParticipantsTable.participantId,
        displayName: juniorParticipantsTable.displayName,
        wickets: juniorMatchBowlingTable.wickets,
        runs: juniorMatchBowlingTable.runs,
      })
      .from(juniorMatchBowlingTable)
      .innerJoin(
        juniorParticipantsTable,
        eq(juniorParticipantsTable.participantId, juniorMatchBowlingTable.participantId),
      )
      .innerJoin(juniorMatchesTable, eq(juniorMatchesTable.id, juniorMatchBowlingTable.matchId))
      .where(and(eq(juniorParticipantsTable.isPrivate, false), ...bowlConds)),
  ]);

  type Agg = {
    participantId: string;
    displayName: string;
    innings: number;
    notOuts: number;
    runs: number;
    highScore: number | null;
    outs: number;
    hundreds: number;
    fifties: number;
    wickets: number;
    runsConceded: number;
    bestWickets: number;
    bestRuns: number;
    fiveWickets: number;
    hasBowled: boolean;
  };
  const aggByPlayer = new Map<string, Agg>();
  const ensure = (participantId: string, displayName: string | null): Agg => {
    let a = aggByPlayer.get(participantId);
    if (!a) {
      a = {
        participantId,
        displayName: displayName ?? "",
        innings: 0,
        notOuts: 0,
        runs: 0,
        highScore: null,
        outs: 0,
        hundreds: 0,
        fifties: 0,
        wickets: 0,
        runsConceded: 0,
        bestWickets: -1,
        bestRuns: 0,
        fiveWickets: 0,
        hasBowled: false,
      };
      aggByPlayer.set(participantId, a);
    }
    return a;
  };

  for (const r of battingRows) {
    const a = ensure(r.participantId, r.displayName);
    a.innings += 1;
    const runs = r.runs ?? 0;
    a.runs += runs;
    if (a.highScore === null || runs > a.highScore) a.highScore = runs;
    if (isNotOut(r.dismissal)) a.notOuts += 1;
    else a.outs += 1;
    if (runs >= 100) a.hundreds += 1;
    else if (runs >= 50) a.fifties += 1;
  }

  for (const r of bowlingRows) {
    const a = ensure(r.participantId, r.displayName);
    a.hasBowled = true;
    const wkts = r.wickets ?? 0;
    const conceded = r.runs ?? 0;
    a.wickets += wkts;
    a.runsConceded += conceded;
    if (wkts >= 5) a.fiveWickets += 1;
    // Best bowling: most wickets, then fewest runs.
    if (wkts > a.bestWickets || (wkts === a.bestWickets && conceded < a.bestRuns)) {
      a.bestWickets = wkts;
      a.bestRuns = conceded;
    }
  }

  // Canonical Games (roster appearances) under the same season/age scope, so the
  // "Mat" column matches the directory / Most Games / Most Wickets tabs instead
  // of counting only matches batted (which under-counts roster appearances).
  const rosterGames = await rosterGamesByParticipant({ season, ageGroup });

  const rows = Array.from(aggByPlayer.values()).map((a) => ({
    participantId: a.participantId,
    displayName: a.displayName,
    matches: rosterGames.get(a.participantId) ?? 0,
    innings: a.innings,
    notOuts: a.notOuts,
    runs: a.runs,
    highScore: a.highScore,
    battingAverage: a.outs > 0 ? Math.round((a.runs / a.outs) * 100) / 100 : null,
    hundreds: a.hundreds,
    fifties: a.fifties,
    wickets: a.wickets,
    runsConceded: a.runsConceded,
    bowlingAverage: a.wickets > 0 ? Math.round((a.runsConceded / a.wickets) * 100) / 100 : null,
    bestBowling: a.hasBowled && a.bestWickets >= 0 ? `${a.bestWickets}/${a.bestRuns}` : null,
    fiveWickets: a.fiveWickets,
  }));

  // Default ordering: most runs first, then most wickets.
  rows.sort((x, y) => y.runs - x.runs || y.wickets - x.wickets);
  res.json(rows);
});

// ---------------------------------------------------------------------------
// GET /juniors/social-milestones — career run/wicket/games tallies per HH
// junior that have crossed a celebratory threshold, for the admin junior social
// downloads. Aggregated in JS from Halls Head lines only (inner-join
// participants is_private=false excludes opposition AND private players), so the
// 6 private juniors never surface. Junior data never touches a senior table.
// ---------------------------------------------------------------------------
router.get("/juniors/social-milestones", async (req, res): Promise<void> => {
  // Central tenants have no native junior lines — no milestones, no leak.
  if (await isCentralTenant(req)) {
    res.json([]);
    return;
  }
  const [battingRows, bowlingRows] = await Promise.all([
    db
      .select({
        participantId: juniorParticipantsTable.participantId,
        displayName: juniorParticipantsTable.displayName,
        matchId: juniorMatchBattingTable.matchId,
        runs: juniorMatchBattingTable.runs,
      })
      .from(juniorMatchBattingTable)
      .innerJoin(
        juniorParticipantsTable,
        eq(juniorParticipantsTable.participantId, juniorMatchBattingTable.participantId),
      )
      .where(
        and(
          eq(juniorParticipantsTable.isPrivate, false),
          eq(juniorMatchBattingTable.isHallsHead, true),
        ),
      ),
    db
      .select({
        participantId: juniorParticipantsTable.participantId,
        displayName: juniorParticipantsTable.displayName,
        matchId: juniorMatchBowlingTable.matchId,
        wickets: juniorMatchBowlingTable.wickets,
      })
      .from(juniorMatchBowlingTable)
      .innerJoin(
        juniorParticipantsTable,
        eq(juniorParticipantsTable.participantId, juniorMatchBowlingTable.participantId),
      )
      .where(
        and(
          eq(juniorParticipantsTable.isPrivate, false),
          eq(juniorMatchBowlingTable.isHallsHead, true),
        ),
      ),
  ]);

  type Career = {
    participantId: string;
    displayName: string;
    runs: number;
    wickets: number;
    matchIds: Set<number>;
  };
  const byPlayer = new Map<string, Career>();
  const ensure = (participantId: string, displayName: string | null): Career => {
    let c = byPlayer.get(participantId);
    if (!c) {
      c = {
        participantId,
        displayName: displayName ?? "",
        runs: 0,
        wickets: 0,
        matchIds: new Set(),
      };
      byPlayer.set(participantId, c);
    }
    return c;
  };

  for (const r of battingRows) {
    const c = ensure(r.participantId, r.displayName);
    c.runs += r.runs ?? 0;
    c.matchIds.add(r.matchId);
  }
  for (const r of bowlingRows) {
    const c = ensure(r.participantId, r.displayName);
    c.wickets += r.wickets ?? 0;
    c.matchIds.add(r.matchId);
  }

  // Highest crossed threshold (and its tier position) for a stat value.
  const crossed = (
    value: number,
    tiers: readonly number[],
  ): { threshold: number; tierIndex: number } | null => {
    let hit: { threshold: number; tierIndex: number } | null = null;
    tiers.forEach((t, i) => {
      if (value >= t) hit = { threshold: t, tierIndex: i };
    });
    return hit;
  };

  type Milestone = {
    participantId: string;
    playerName: string;
    statKey: "runs" | "wickets" | "games";
    statLabel: string;
    value: number;
    threshold: number;
    tierLabel: string;
    tierIndex: number;
  };
  const milestones: Milestone[] = [];
  for (const c of byPlayer.values()) {
    const stats: Array<["runs" | "wickets" | "games", number]> = [
      ["runs", c.runs],
      ["wickets", c.wickets],
      ["games", c.matchIds.size],
    ];
    for (const [statKey, value] of stats) {
      const hit = crossed(value, JUNIOR_MILESTONE_TIERS[statKey]);
      if (!hit) continue;
      milestones.push({
        participantId: c.participantId,
        playerName: c.displayName,
        statKey,
        statLabel: `Career ${JUNIOR_STAT_SINGULAR[statKey]}s`,
        value,
        threshold: hit.threshold,
        tierLabel: `${hit.threshold} ${JUNIOR_STAT_SINGULAR[statKey]} Club`,
        tierIndex: hit.tierIndex,
      });
    }
  }

  // Most impressive first: higher threshold, then higher tally, then name.
  milestones.sort(
    (a, b) =>
      b.threshold - a.threshold || b.value - a.value || a.playerName.localeCompare(b.playerName),
  );
  res.json(milestones);
});

export default router;
