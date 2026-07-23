import { Router, type IRouter } from "express";
import {
  eq,
  and,
  desc,
  ilike,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";
import {
  db,
  juniorMatchesTable,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorMatchRostersTable,
  juniorParticipantsTable,
  juniorPremiershipsTable,
  juniorPremiershipPlayersTable,
  juniorOfficeBearersTable,
  juniorMatchDisplaySettingsTable,
  juniorParticipantMergesTable,
  clubsTable,
  playersTable,
} from "@workspace/db";
import {
  getPrivateIds,
  splitScores,
  MASK_NAME,
  opponentClubColumns,
  toOpponentClub,
  seasonYear,
  toMatchSummary,
  isNotOut,
  ageGroupsForSeason,
  JUNIOR_MILESTONE_TIERS,
  JUNIOR_STAT_SINGULAR,
  serializeJuniorMatchDisplaySettings,
  officeBearersOrdered,
} from "../lib/junior-helpers";
import {
  ListJuniorMatchesQueryParams,
  GetJuniorMatchParams,
  ListJuniorPlayersQueryParams,
  GetJuniorPlayerParams,
  CreateJuniorOfficeBearerBody,
  UpdateJuniorOfficeBearerBody,
  UpdateJuniorOfficeBearerParams,
  DeleteJuniorOfficeBearerParams,
  ListJuniorLeaderboardQueryParams,
  GetJuniorSeasonTopPerformersQueryParams,
  UpdateJuniorMatchDisplaySettingsBody,
  UpdateJuniorPremiershipParams,
  UpdateJuniorPremiershipBody,
  ListJuniorPlayersBySeniorParams,
  SetJuniorSeniorLinkParams,
  SetJuniorSeniorLinkBody,
  ClearJuniorSeniorLinkParams,
} from "@workspace/api-zod";
import { requireAdmin, resolveAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { shouldReadCentral } from "../lib/tenant";
import {
  BALLS_PER_OVER,
  oversToBalls,
  ballsToOvers,
} from "../lib/junior-cricket";
import { overlayNativeOpponents } from "../lib/club-brand";
import { getOrCreateSettings } from "../lib/settings";

import {
  battingLeaders,
  bestBowlingFigures,
  bowlingLeaders,
  highestScoreInnings,
  rosterGamesByParticipant,
} from "../lib/junior-leaderboards";

const router: IRouter = Router();

/**
 * JUNIORS read API. This data is kept COMPLETELY SEPARATE from the senior
 * records by club decision — no query here ever touches a senior table, and the
 * only senior link (junior_participants.senior_player_id) is surfaced as a
 * cross-reference id, never merged into any figure.
 *
 * The handful of `is_private` participants are hidden everywhere: in scorecards
 * their lines are MASKED (kept so the card still adds up, but name removed and
 * not linkable); in every directory / leaderboard / aggregate they are EXCLUDED
 * (the leaderboard queries inner-join junior_participants and filter is_private,
 * which naturally drops both opposition players and private participants).
 */

type MatchRow = typeof juniorMatchesTable.$inferSelect;

// Ball-notation helpers live in ../lib/junior-cricket (shared with the
// juniors admin routes): overs are cricket ball notation, never decimal.

// ---------------------------------------------------------------------------
// GET /juniors/overview
// ---------------------------------------------------------------------------
router.get("/juniors/overview", async (req, res): Promise<void> => {
  // Junior data is tenant-local and central is seniors-only, so a central tenant
  // has no junior history of its own — return the empty overview rather than the
  // demo tenant's (Halls Head) juniors.
  if (await shouldReadCentral(req)) {
    res.json({
      totals: { matches: 0, players: 0, premierships: 0, seasons: 0, ageGroups: 0 },
      latestSeason: null,
      recentMatches: [],
      topRunScorers: [],
      topWicketTakers: [],
    });
    return;
  }

  const [[matchCount], [playerCount], [premCount], [seasonCount], [ageCount]] =
    await Promise.all([
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
  if (await shouldReadCentral(req)) {
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
// GET /juniors/filters
// ---------------------------------------------------------------------------
router.get("/juniors/filters", async (req, res): Promise<void> => {
  // Central tenants have no native junior history — empty filters, no leak.
  if (await shouldReadCentral(req)) {
    res.json({ seasons: [], ageGroups: [] });
    return;
  }
  const seasonRows = await db
    .selectDistinct({ season: juniorMatchesTable.season })
    .from(juniorMatchesTable)
    .where(isNotNull(juniorMatchesTable.season))
    .orderBy(desc(juniorMatchesTable.season));
  const ageRows = await db
    .selectDistinct({ ageGroup: juniorMatchesTable.ageGroup })
    .from(juniorMatchesTable)
    .where(isNotNull(juniorMatchesTable.ageGroup))
    .orderBy(juniorMatchesTable.ageGroup);

  res.json({
    seasons: seasonRows.map((r) => r.season).filter(Boolean),
    ageGroups: ageRows.map((r) => r.ageGroup).filter(Boolean),
  });
});

// ---------------------------------------------------------------------------
// GET /juniors/matches
// ---------------------------------------------------------------------------
router.get("/juniors/matches", async (req, res): Promise<void> => {
  const query = ListJuniorMatchesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  // Central tenants have no native junior matches — empty list, no leak.
  if (await shouldReadCentral(req)) {
    res.json([]);
    return;
  }
  const { season, ageGroup } = query.data;
  const conds = [];
  if (season) conds.push(eq(juniorMatchesTable.season, season));
  if (ageGroup) conds.push(eq(juniorMatchesTable.ageGroup, ageGroup));

  const rows = await db
    .select({ match: juniorMatchesTable, ...opponentClubColumns })
    .from(juniorMatchesTable)
    .leftJoin(clubsTable, eq(clubsTable.id, juniorMatchesTable.opponentClubId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(seasonYear), desc(juniorMatchesTable.id));

  const opps = await overlayNativeOpponents(rows.map(toOpponentClub));
  res.json(rows.map((r, i) => toMatchSummary(r.match, opps[i])));
});

// ---------------------------------------------------------------------------
// GET /juniors/matches/{id}
// ---------------------------------------------------------------------------
router.get("/juniors/matches/:id", async (req, res): Promise<void> => {
  const params = GetJuniorMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const matchId = params.data.id;

  // Central tenants have no native junior matches — 404, never the demo club's.
  if (await shouldReadCentral(req)) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  const [matchRow] = await db
    .select({ match: juniorMatchesTable, ...opponentClubColumns })
    .from(juniorMatchesTable)
    .leftJoin(clubsTable, eq(clubsTable.id, juniorMatchesTable.opponentClubId))
    .where(eq(juniorMatchesTable.id, matchId));
  if (!matchRow) {
    res.status(404).json({ error: "Match not found" });
    return;
  }
  const match = matchRow.match;
  // Overlay the opponent's uploaded brand if that club is a tenant, so the
  // junior scorecard + junior match-summary share card show its crest/colours.
  const [opponentClub] = await overlayNativeOpponents([toOpponentClub(matchRow)]);

  const privateIds = await getPrivateIds(getTenantId(req));
  const [battingRows, bowlingRows, rosterRows] = await Promise.all([
    db
      .select()
      .from(juniorMatchBattingTable)
      .where(eq(juniorMatchBattingTable.matchId, matchId))
      .orderBy(juniorMatchBattingTable.innings, juniorMatchBattingTable.batOrder),
    db
      .select()
      .from(juniorMatchBowlingTable)
      .where(eq(juniorMatchBowlingTable.matchId, matchId))
      .orderBy(juniorMatchBowlingTable.innings, juniorMatchBowlingTable.id),
    db
      .select()
      .from(juniorMatchRostersTable)
      .where(eq(juniorMatchRostersTable.matchId, matchId))
      .orderBy(juniorMatchRostersTable.id),
  ]);

  const isPriv = (pid: string | null) => !!pid && privateIds.has(pid);

  const battingLine = (b: typeof juniorMatchBattingTable.$inferSelect) => {
    const priv = isPriv(b.participantId);
    return {
      id: b.id,
      participantId: priv ? null : b.participantId,
      playerName: priv ? MASK_NAME : (b.playerName ?? ""),
      isHallsHead: b.isHallsHead,
      isPrivate: priv,
      batOrder: b.batOrder,
      runs: b.runs,
      balls: b.balls,
      fours: b.fours,
      sixes: b.sixes,
      strikeRate: b.strikeRate,
      dismissal: b.dismissal,
    };
  };
  const bowlingLine = (b: typeof juniorMatchBowlingTable.$inferSelect) => {
    const priv = isPriv(b.participantId);
    return {
      id: b.id,
      participantId: priv ? null : b.participantId,
      playerName: priv ? MASK_NAME : (b.playerName ?? ""),
      isHallsHead: b.isHallsHead,
      isPrivate: priv,
      overs: b.overs,
      maidens: b.maidens,
      runs: b.runs,
      wickets: b.wickets,
      economy: b.economy,
      wides: b.wides,
      noBalls: b.noBalls,
    };
  };

  const inningsNums = Array.from(
    new Set([
      ...battingRows.map((b) => b.innings ?? 1),
      ...bowlingRows.map((b) => b.innings ?? 1),
    ]),
  ).sort((a, b) => a - b);

  const innings = inningsNums.map((n) => {
    const bats = battingRows.filter((b) => (b.innings ?? 1) === n);
    const bowls = bowlingRows.filter((b) => (b.innings ?? 1) === n);
    return {
      innings: n,
      battingTeam: bats[0]?.battingTeam ?? null,
      isHallsHead: bats[0]?.isHallsHead ?? false,
      batting: bats.map(battingLine),
      bowling: bowls.map(bowlingLine),
    };
  });

  const rosters = rosterRows.map((r) => {
    const priv = isPriv(r.participantId);
    return {
      id: r.id,
      participantId: priv ? null : r.participantId,
      playerName: priv ? MASK_NAME : (r.playerName ?? ""),
      teamName: r.teamName,
      isHallsHead: r.isHallsHead,
      isPrivate: priv,
    };
  });

  const { hhScore, opponentScore } = splitScores(match);
  res.json({
    id: match.id,
    playhqMatchId: match.playhqMatchId,
    season: match.season,
    grade: match.grade,
    ageGroup: match.ageGroup,
    teamName: match.teamName,
    competition: match.competition,
    association: match.association,
    round: match.round,
    matchDate: match.matchDate,
    venue: match.venue,
    venueOval: match.venueOval,
    venueAddress: match.venueAddress,
    venueSuburb: match.venueSuburb,
    status: match.status,
    opponentName: match.opponentName,
    hhResult: match.hhResult,
    winner: match.winner,
    tossWinner: match.tossWinner,
    hhBattedFirst: match.hhBattedFirst,
    hhScore,
    opponentScore,
    // Raw team columns as stored (the admin scorecard editor patches these
    // directly rather than inverting the hh/opponent score mapping).
    team1: match.team1,
    team2: match.team2,
    team1Score: match.team1Score,
    team2Score: match.team2Score,
    opponentClub,
    innings,
    rosters,
  });
});

// ---------------------------------------------------------------------------
// GET /juniors/players
// ---------------------------------------------------------------------------
router.get("/juniors/players", async (req, res): Promise<void> => {
  const query = ListJuniorPlayersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const { search, season, ageGroup, includePrivate } = query.data;

  // Central tenants have no native junior participants — empty list, no leak.
  if (await shouldReadCentral(req)) {
    res.json([]);
    return;
  }

  // includePrivate is honoured ONLY for a signed-in admin (the junior players
  // admin needs private rows so the privacy flag can be turned back off);
  // for everyone else the flag is silently ignored and privacy holds.
  const withPrivate = includePrivate === true && !!(await resolveAdmin(req));

  const conds = [eq(juniorParticipantsTable.tenantId, getTenantId(req))];
  if (!withPrivate) conds.push(eq(juniorParticipantsTable.isPrivate, false));
  if (search) conds.push(ilike(juniorParticipantsTable.displayName, `%${search}%`));

  // Season / age-group filters restrict to participants who actually appeared in
  // a matching match. Appearance = ANY HH line (batting OR bowling OR roster);
  // restricting to rosters alone would drop players who batted/bowled but have no
  // roster row, so we union all three line types before joining the match filter.
  if (season || ageGroup) {
    const seasonCond = season ? sql`m.season = ${season}` : sql`TRUE`;
    const ageCond = ageGroup ? sql`m.age_group = ${ageGroup}` : sql`TRUE`;
    const appearanceRes = await db.execute(sql`
      SELECT DISTINCT t.participant_id AS pid
      FROM (
        SELECT participant_id, match_id FROM junior_match_batting WHERE is_halls_head AND participant_id IS NOT NULL
        UNION
        SELECT participant_id, match_id FROM junior_match_bowling WHERE is_halls_head AND participant_id IS NOT NULL
        UNION
        SELECT participant_id, match_id FROM junior_match_rosters WHERE is_halls_head AND participant_id IS NOT NULL
      ) t
      JOIN junior_matches m ON m.id = t.match_id
      WHERE ${seasonCond} AND ${ageCond}
    `);
    const ids = (appearanceRes.rows as { pid: string | null }[])
      .map((r) => r.pid)
      .filter((x): x is string => !!x);
    if (ids.length === 0) {
      res.json([]);
      return;
    }
    conds.push(inArray(juniorParticipantsTable.participantId, ids));
  }

  const participants = await db
    .select()
    .from(juniorParticipantsTable)
    .where(and(...conds))
    .orderBy(juniorParticipantsTable.displayName);

  // Aggregate runs / wickets / games across HH appearances, keyed by pid. The
  // "matches" column uses the canonical roster-appearances count
  // (rosterGamesByParticipant) so the directory + Most Games board show the SAME
  // games figure as every other leaderboard tab, rather than a union of
  // batting/bowling/roster match ids. All three figures honour the season/age
  // filter when present (so a filtered row stays internally consistent — games,
  // runs and wickets all describe the same scope); unfiltered they are all-time,
  // which is what the always-unfiltered Most Games board reads.
  const battingAggConds = [
    eq(juniorMatchBattingTable.isHallsHead, true),
    isNotNull(juniorMatchBattingTable.participantId),
  ];
  const bowlingAggConds = [
    eq(juniorMatchBowlingTable.isHallsHead, true),
    isNotNull(juniorMatchBowlingTable.participantId),
  ];
  if (season) {
    battingAggConds.push(eq(juniorMatchesTable.season, season));
    bowlingAggConds.push(eq(juniorMatchesTable.season, season));
  }
  if (ageGroup) {
    battingAggConds.push(eq(juniorMatchesTable.ageGroup, ageGroup));
    bowlingAggConds.push(eq(juniorMatchesTable.ageGroup, ageGroup));
  }
  const [runsRows, wktsRows, matchesBy] = await Promise.all([
    db
      .select({
        pid: juniorMatchBattingTable.participantId,
        runs: sql<number>`coalesce(sum(${juniorMatchBattingTable.runs}),0)::int`,
      })
      .from(juniorMatchBattingTable)
      .innerJoin(
        juniorMatchesTable,
        eq(juniorMatchesTable.id, juniorMatchBattingTable.matchId),
      )
      .where(and(...battingAggConds))
      .groupBy(juniorMatchBattingTable.participantId),
    db
      .select({
        pid: juniorMatchBowlingTable.participantId,
        wickets: sql<number>`coalesce(sum(${juniorMatchBowlingTable.wickets}),0)::int`,
      })
      .from(juniorMatchBowlingTable)
      .innerJoin(
        juniorMatchesTable,
        eq(juniorMatchesTable.id, juniorMatchBowlingTable.matchId),
      )
      .where(and(...bowlingAggConds))
      .groupBy(juniorMatchBowlingTable.participantId),
    rosterGamesByParticipant({ season, ageGroup }),
  ]);

  const runsBy = new Map(runsRows.map((r) => [r.pid, r.runs]));
  const wktsBy = new Map(wktsRows.map((r) => [r.pid, r.wickets]));

  res.json(
    participants.map((p) => ({
      participantId: p.participantId,
      displayName: p.displayName ?? "",
      firstSeason: p.firstSeason,
      lastSeason: p.lastSeason,
      teams: p.teams,
      matches: matchesBy.get(p.participantId) ?? 0,
      runs: runsBy.get(p.participantId) ?? 0,
      wickets: wktsBy.get(p.participantId) ?? 0,
      seniorPlayerId: p.seniorPlayerId,
      ...(withPrivate ? { isPrivate: p.isPrivate } : {}),
    })),
  );
});

// ---------------------------------------------------------------------------
// GET /juniors/players/by-senior/{playerId}
//
// Junior participants cross-linked to a senior player. Registered BEFORE
// /juniors/players/:id so "by-senior" is not swallowed by the :id param. The
// link is junior_participants.senior_player_id — a profile cross-reference
// only; this endpoint returns identities, never any figure, so junior and
// senior stats stay completely separate.
// ---------------------------------------------------------------------------
router.get(
  "/juniors/players/by-senior/:playerId",
  async (req, res): Promise<void> => {
    const params = ListJuniorPlayersBySeniorParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    // Central tenants have no native junior participants — empty list, no leak.
    if (await shouldReadCentral(req)) {
      res.json([]);
      return;
    }

    const rows = await db
      .select({
        participantId: juniorParticipantsTable.participantId,
        displayName: juniorParticipantsTable.displayName,
        firstSeason: juniorParticipantsTable.firstSeason,
        lastSeason: juniorParticipantsTable.lastSeason,
      })
      .from(juniorParticipantsTable)
      .where(
        and(
          eq(juniorParticipantsTable.seniorPlayerId, params.data.playerId),
          eq(juniorParticipantsTable.tenantId, getTenantId(req)),
          eq(juniorParticipantsTable.isPrivate, false),
        ),
      )
      .orderBy(juniorParticipantsTable.displayName);

    res.json(
      rows.map((r) => ({
        participantId: r.participantId,
        displayName: r.displayName ?? "",
        firstSeason: r.firstSeason,
        lastSeason: r.lastSeason,
      })),
    );
  },
);

// ---------------------------------------------------------------------------
// PUT /juniors/participants/{id}/senior-link (admin)
// DELETE /juniors/participants/{id}/senior-link (admin)
//
// Set / clear the junior→senior profile cross-reference at admin discretion.
// The write touches ONLY junior_participants. The lone read of the senior
// players table is a referential existence check (the same EXISTS check the
// juniors ETL performs when re-applying links) — it returns a boolean, never a
// figure, so the juniors-isolation rule (junior and senior STATS never
// combine) is untouched. Multiple junior participants may link to one senior
// player: PlayHQ occasionally minted duplicate GUIDs for the same child.
// ---------------------------------------------------------------------------
router.put(
  "/juniors/participants/:id/senior-link",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = SetJuniorSeniorLinkParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = SetJuniorSeniorLinkBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    if (await shouldReadCentral(req)) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }

    const [senior] = await db
      .select({ id: playersTable.id })
      .from(playersTable)
      .where(eq(playersTable.id, body.data.seniorPlayerId));
    if (!senior) {
      res.status(404).json({ error: "Senior player not found" });
      return;
    }

    const [updated] = await db
      .update(juniorParticipantsTable)
      .set({ seniorPlayerId: body.data.seniorPlayerId })
      .where(
        and(
          eq(juniorParticipantsTable.participantId, params.data.id),
          eq(juniorParticipantsTable.tenantId, getTenantId(req)),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }

    res.json({
      participantId: updated.participantId,
      displayName: updated.displayName ?? "",
      seniorPlayerId: updated.seniorPlayerId,
    });
  },
);

router.delete(
  "/juniors/participants/:id/senior-link",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = ClearJuniorSeniorLinkParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (await shouldReadCentral(req)) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }

    const [updated] = await db
      .update(juniorParticipantsTable)
      .set({ seniorPlayerId: null })
      .where(
        and(
          eq(juniorParticipantsTable.participantId, params.data.id),
          eq(juniorParticipantsTable.tenantId, getTenantId(req)),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    res.status(204).end();
  },
);

// ---------------------------------------------------------------------------
// GET /juniors/players/{id}
// ---------------------------------------------------------------------------
router.get("/juniors/players/:id", async (req, res): Promise<void> => {
  const params = GetJuniorPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  let pid = params.data.id;

  // Central tenants have no native junior participants — 404, never the demo club's.
  if (await shouldReadCentral(req)) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const tenantId = getTenantId(req);
  const loadParticipant = async (id: string) => {
    const [row] = await db
      .select()
      .from(juniorParticipantsTable)
      .where(
        and(
          eq(juniorParticipantsTable.participantId, id),
          eq(juniorParticipantsTable.tenantId, tenantId),
        ),
      );
    return row;
  };

  let participant = await loadParticipant(pid);

  // Absorbed duplicate GUIDs alias to their keeper so old bookmarks and
  // shared links keep working after an admin merge. The map is flat by
  // construction; the hop loop is defensive only (cycle/cap ⇒ treat as miss).
  if (!participant) {
    let cur = pid;
    for (let hop = 0; hop < 16; hop++) {
      const [merge] = await db
        .select({
          keeper: juniorParticipantMergesTable.keeperParticipantId,
        })
        .from(juniorParticipantMergesTable)
        .where(
          and(
            eq(juniorParticipantMergesTable.tenantId, tenantId),
            eq(juniorParticipantMergesTable.duplicateParticipantId, cur),
          ),
        );
      if (!merge) break;
      cur = merge.keeper;
      const resolved = await loadParticipant(cur);
      if (resolved) {
        participant = resolved;
        // The rest of the handler (and the response's participantId) uses the
        // keeper GUID, so client URLs self-heal on the next navigation.
        pid = cur;
        break;
      }
    }
  }

  if (!participant || participant.isPrivate) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  // All HH batting/bowling lines for this player, joined to their match context.
  const battingRows = await db
    .select({
      line: juniorMatchBattingTable,
      match: juniorMatchesTable,
    })
    .from(juniorMatchBattingTable)
    .innerJoin(
      juniorMatchesTable,
      eq(juniorMatchesTable.id, juniorMatchBattingTable.matchId),
    )
    .where(
      and(
        eq(juniorMatchBattingTable.participantId, pid),
        eq(juniorMatchBattingTable.isHallsHead, true),
      ),
    );
  const bowlingRows = await db
    .select({
      line: juniorMatchBowlingTable,
      match: juniorMatchesTable,
    })
    .from(juniorMatchBowlingTable)
    .innerJoin(
      juniorMatchesTable,
      eq(juniorMatchesTable.id, juniorMatchBowlingTable.matchId),
    )
    .where(
      and(
        eq(juniorMatchBowlingTable.participantId, pid),
        eq(juniorMatchBowlingTable.isHallsHead, true),
      ),
    );
  const rosterRows = await db
    .select({ match: juniorMatchesTable })
    .from(juniorMatchRostersTable)
    .innerJoin(
      juniorMatchesTable,
      eq(juniorMatchesTable.id, juniorMatchRostersTable.matchId),
    )
    .where(
      and(
        eq(juniorMatchRostersTable.participantId, pid),
        eq(juniorMatchRostersTable.isHallsHead, true),
      ),
    );

  // Batting totals.
  let runs = 0,
    ballsFaced = 0,
    notOuts = 0,
    fours = 0,
    sixes = 0,
    highScore: number | null = null;
  for (const { line } of battingRows) {
    runs += line.runs ?? 0;
    ballsFaced += line.balls ?? 0;
    fours += line.fours ?? 0;
    sixes += line.sixes ?? 0;
    if (isNotOut(line.dismissal)) notOuts += 1;
    if (line.runs != null && (highScore == null || line.runs > highScore))
      highScore = line.runs;
  }
  const battingInnings = battingRows.length;
  const outs = battingInnings - notOuts;
  const battingTotals = {
    matches: new Set(battingRows.map((r) => r.match.id)).size,
    innings: battingInnings,
    runs,
    ballsFaced,
    notOuts,
    fours,
    sixes,
    highScore,
    average: outs > 0 ? Math.round((runs / outs) * 100) / 100 : null,
  };

  // Bowling totals. Overs accumulate in BALLS (ball notation is not decimal).
  let bBalls = 0,
    bMaidens = 0,
    bRuns = 0,
    bWickets = 0,
    bestWickets: number | null = null,
    bestRuns: number | null = null;
  for (const { line } of bowlingRows) {
    bBalls += oversToBalls(line.overs);
    bMaidens += line.maidens ?? 0;
    bRuns += line.runs ?? 0;
    bWickets += line.wickets ?? 0;
    const w = line.wickets ?? 0;
    const r = line.runs ?? 0;
    if (
      bestWickets == null ||
      w > bestWickets ||
      (w === bestWickets && bestRuns != null && r < bestRuns)
    ) {
      bestWickets = w;
      bestRuns = r;
    }
  }
  const bowlingTotals = {
    matches: new Set(bowlingRows.map((r) => r.match.id)).size,
    overs: ballsToOvers(bBalls),
    maidens: bMaidens,
    runs: bRuns,
    wickets: bWickets,
    bestWickets,
    bestRuns,
    economy:
      bBalls > 0
        ? Math.round((bRuns / (bBalls / BALLS_PER_OVER)) * 100) / 100
        : null,
  };

  // Per-match lines (batting + bowling merged by match), newest season first.
  const battingByMatch = new Map(battingRows.map((r) => [r.match.id, r]));
  const bowlingByMatch = new Map(bowlingRows.map((r) => [r.match.id, r]));
  const matchMeta = new Map<number, MatchRow>();
  for (const r of battingRows) matchMeta.set(r.match.id, r.match);
  for (const r of bowlingRows) matchMeta.set(r.match.id, r.match);
  for (const r of rosterRows) matchMeta.set(r.match.id, r.match);

  const sortedMatches = Array.from(matchMeta.values()).sort((a, b) => {
    const ya = Number(a.season?.slice(0, 4) ?? 0);
    const yb = Number(b.season?.slice(0, 4) ?? 0);
    if (yb !== ya) return yb - ya;
    return b.id - a.id;
  });

  const matches = sortedMatches.map((m) => {
    const b = battingByMatch.get(m.id);
    const bw = bowlingByMatch.get(m.id);
    return {
      matchId: m.id,
      season: m.season,
      ageGroup: m.ageGroup,
      round: m.round,
      matchDate: m.matchDate,
      opponentName: m.opponentName,
      hhResult: m.hhResult,
      batting: b
        ? {
            id: b.line.id,
            participantId: pid,
            playerName: participant.displayName ?? "",
            isHallsHead: true,
            isPrivate: false,
            batOrder: b.line.batOrder,
            runs: b.line.runs,
            balls: b.line.balls,
            fours: b.line.fours,
            sixes: b.line.sixes,
            strikeRate: b.line.strikeRate,
            dismissal: b.line.dismissal,
          }
        : null,
      bowling: bw
        ? {
            id: bw.line.id,
            participantId: pid,
            playerName: participant.displayName ?? "",
            isHallsHead: true,
            isPrivate: false,
            overs: bw.line.overs,
            maidens: bw.line.maidens,
            runs: bw.line.runs,
            wickets: bw.line.wickets,
            economy: bw.line.economy,
            wides: bw.line.wides,
            noBalls: bw.line.noBalls,
          }
        : null,
    };
  });

  // Per-season breakdown derived from the merged match list.
  const seasonMap = new Map<
    string,
    { season: string; teams: Set<string>; matches: Set<number>; runs: number; wickets: number }
  >();
  for (const m of sortedMatches) {
    const key = m.season ?? "—";
    let s = seasonMap.get(key);
    if (!s) {
      s = { season: key, teams: new Set(), matches: new Set(), runs: 0, wickets: 0 };
      seasonMap.set(key, s);
    }
    s.matches.add(m.id);
    if (m.ageGroup) s.teams.add(m.ageGroup);
    const b = battingByMatch.get(m.id);
    const bw = bowlingByMatch.get(m.id);
    s.runs += b?.line.runs ?? 0;
    s.wickets += bw?.line.wickets ?? 0;
  }
  const seasons = Array.from(seasonMap.values())
    .sort((a, b) => Number(b.season.slice(0, 4) || 0) - Number(a.season.slice(0, 4) || 0))
    .map((s) => ({
      season: s.season,
      teams: Array.from(s.teams).join(", ") || null,
      matches: s.matches.size,
      runs: s.runs,
      wickets: s.wickets,
    }));

  res.json({
    participantId: participant.participantId,
    displayName: participant.displayName ?? "",
    firstSeason: participant.firstSeason,
    lastSeason: participant.lastSeason,
    teams: participant.teams,
    seniorPlayerId: participant.seniorPlayerId,
    batting: battingTotals,
    bowling: bowlingTotals,
    seasons,
    matches,
  });
});

// ---------------------------------------------------------------------------
// GET /juniors/leaderboards
// ---------------------------------------------------------------------------
router.get("/juniors/leaderboards", async (req, res): Promise<void> => {
  // Central tenants have no native junior lines — empty boards, no leak.
  if (await shouldReadCentral(req)) {
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
  if (await shouldReadCentral(req)) {
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
      .innerJoin(
        juniorMatchesTable,
        eq(juniorMatchesTable.id, juniorMatchBattingTable.matchId),
      )
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
      .innerJoin(
        juniorMatchesTable,
        eq(juniorMatchesTable.id, juniorMatchBowlingTable.matchId),
      )
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
    battingAverage:
      a.outs > 0 ? Math.round((a.runs / a.outs) * 100) / 100 : null,
    hundreds: a.hundreds,
    fifties: a.fifties,
    wickets: a.wickets,
    runsConceded: a.runsConceded,
    bowlingAverage:
      a.wickets > 0 ? Math.round((a.runsConceded / a.wickets) * 100) / 100 : null,
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
  if (await shouldReadCentral(req)) {
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
      b.threshold - a.threshold ||
      b.value - a.value ||
      a.playerName.localeCompare(b.playerName),
  );
  res.json(milestones);
});

// ---------------------------------------------------------------------------
// Juniors Matches page display settings (admin-controlled defaults).
// One row per tenant; mirrors the senior match-display-settings pattern but
// keyed on age group (no roundOrder — junior rounds are free text).
// ---------------------------------------------------------------------------
router.get("/juniors/match-display-settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings(juniorMatchDisplaySettingsTable, getTenantId(req));
  res.json(serializeJuniorMatchDisplaySettings(settings));
});

router.patch(
  "/juniors/match-display-settings",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = UpdateJuniorMatchDisplaySettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    const tenantId = getTenantId(req);
    await getOrCreateSettings(juniorMatchDisplaySettingsTable, tenantId);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.defaultAgeGroup !== undefined)
      patch.defaultAgeGroup = parsed.data.defaultAgeGroup;
    if (parsed.data.defaultSeasonMode !== undefined)
      patch.defaultSeasonMode = parsed.data.defaultSeasonMode;
    if (parsed.data.defaultSeason !== undefined)
      patch.defaultSeason = parsed.data.defaultSeason;
    if (parsed.data.ageGroupOrder !== undefined)
      patch.ageGroupOrder = parsed.data.ageGroupOrder;
    const [updated] = await db
      .update(juniorMatchDisplaySettingsTable)
      .set(patch)
      .where(eq(juniorMatchDisplaySettingsTable.tenantId, tenantId))
      .returning();
    res.json(serializeJuniorMatchDisplaySettings(updated));
  },
);

// ---------------------------------------------------------------------------
// GET /juniors/premierships
// ---------------------------------------------------------------------------
router.get("/juniors/premierships", async (req, res): Promise<void> => {
  // Junior data is tenant-local / seniors-only in central — empty for central tenants.
  if (await shouldReadCentral(req)) {
    res.json([]);
    return;
  }
  const privateIds = await getPrivateIds(getTenantId(req));
  const prems = await db
    .select()
    .from(juniorPremiershipsTable)
    .orderBy(desc(juniorPremiershipsTable.season), desc(juniorPremiershipsTable.id));
  const players = await db
    .select()
    .from(juniorPremiershipPlayersTable)
    .orderBy(juniorPremiershipPlayersTable.id);

  const byPrem = new Map<number, typeof players>();
  for (const p of players) {
    const list = byPrem.get(p.premiershipId) ?? [];
    list.push(p);
    byPrem.set(p.premiershipId, list);
  }

  res.json(
    prems.map((pr) => ({
      id: pr.id,
      season: pr.season,
      ageGroup: pr.ageGroup,
      teamName: pr.teamName,
      competition: pr.competition,
      association: pr.association,
      matchDate: pr.matchDate,
      venue: pr.venue,
      venueOval: pr.venueOval,
      opponent: pr.opponent,
      hhScore: pr.hhScore,
      oppScore: pr.oppScore,
      resultText: pr.resultText,
      mom: pr.mom,
      matchId: pr.matchId,
      players: (byPrem.get(pr.id) ?? []).map((pl) => {
        const priv = !!pl.participantId && privateIds.has(pl.participantId);
        return {
          id: pl.id,
          participantId: priv ? null : pl.participantId,
          playerName: priv ? MASK_NAME : (pl.playerName ?? ""),
          isCaptain: pl.isCaptain,
        };
      }),
    })),
  );
});

// ---------------------------------------------------------------------------
// PATCH /juniors/premierships/:id (admin) — set man-of-the-match + captain
// flags. Junior premierships come from the dump (no create/delete here); admins
// only enrich them with captain + MoM, which the ETL preserves across reloads.
// ---------------------------------------------------------------------------
router.patch(
  "/juniors/premierships/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateJuniorPremiershipParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateJuniorPremiershipBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const id = params.data.id;

    const [prem] = await db
      .select()
      .from(juniorPremiershipsTable)
      .where(eq(juniorPremiershipsTable.id, id));
    if (!prem) {
      res.status(404).json({ error: "Premiership not found" });
      return;
    }

    const { mom, captainPlayerIds } = body.data;
    await db.transaction(async (tx) => {
      if (mom !== undefined) {
        await tx
          .update(juniorPremiershipsTable)
          .set({ mom: mom ?? null })
          .where(eq(juniorPremiershipsTable.id, id));
      }
      if (captainPlayerIds !== undefined) {
        await tx
          .update(juniorPremiershipPlayersTable)
          .set({ isCaptain: false })
          .where(eq(juniorPremiershipPlayersTable.premiershipId, id));
        if (captainPlayerIds.length > 0) {
          await tx
            .update(juniorPremiershipPlayersTable)
            .set({ isCaptain: true })
            .where(
              and(
                eq(juniorPremiershipPlayersTable.premiershipId, id),
                inArray(juniorPremiershipPlayersTable.id, captainPlayerIds),
              ),
            );
        }
      }
    });

    const privateIds = await getPrivateIds(getTenantId(req));
    const [updated] = await db
      .select()
      .from(juniorPremiershipsTable)
      .where(eq(juniorPremiershipsTable.id, id));
    const players = await db
      .select()
      .from(juniorPremiershipPlayersTable)
      .where(eq(juniorPremiershipPlayersTable.premiershipId, id))
      .orderBy(juniorPremiershipPlayersTable.id);

    res.json({
      id: updated.id,
      season: updated.season,
      ageGroup: updated.ageGroup,
      teamName: updated.teamName,
      competition: updated.competition,
      association: updated.association,
      matchDate: updated.matchDate,
      venue: updated.venue,
      venueOval: updated.venueOval,
      opponent: updated.opponent,
      hhScore: updated.hhScore,
      oppScore: updated.oppScore,
      resultText: updated.resultText,
      mom: updated.mom,
      matchId: updated.matchId,
      players: players.map((pl) => {
        const priv = !!pl.participantId && privateIds.has(pl.participantId);
        return {
          id: pl.id,
          participantId: priv ? null : pl.participantId,
          playerName: priv ? MASK_NAME : (pl.playerName ?? ""),
          isCaptain: pl.isCaptain,
        };
      }),
    });
  },
);

// ---------------------------------------------------------------------------
// Junior office bearers — admin-managed, kept COMPLETELY SEPARATE from the
// senior club_roles table. Public list returns published rows only.
// ---------------------------------------------------------------------------
router.get("/juniors/office-bearers", async (req, res): Promise<void> => {
  // Curated content is tenant-scoped: only this tenant's published rows.
  const rows = await officeBearersOrdered().where(
    and(
      eq(juniorOfficeBearersTable.published, true),
      eq(juniorOfficeBearersTable.tenantId, getTenantId(req)),
    ),
  );
  res.json(rows);
});

router.get(
  "/juniors/office-bearers/all",
  requireAdmin,
  async (req, res): Promise<void> => {
    const rows = await officeBearersOrdered().where(
      eq(juniorOfficeBearersTable.tenantId, getTenantId(req)),
    );
    res.json(rows);
  },
);

router.post(
  "/juniors/office-bearers",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = CreateJuniorOfficeBearerBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .insert(juniorOfficeBearersTable)
      .values({
        season: parsed.data.season,
        role: parsed.data.role,
        name: parsed.data.name,
        participantId: parsed.data.participantId ?? null,
        displayOrder: parsed.data.displayOrder ?? 0,
        published: parsed.data.published ?? false,
      })
      .returning();
    res.status(201).json(row);
  },
);

router.patch(
  "/juniors/office-bearers/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateJuniorOfficeBearerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateJuniorOfficeBearerBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [row] = await db
      .update(juniorOfficeBearersTable)
      .set(body.data)
      .where(eq(juniorOfficeBearersTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Junior office bearer not found" });
      return;
    }
    res.json(row);
  },
);

router.delete(
  "/juniors/office-bearers/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteJuniorOfficeBearerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .delete(juniorOfficeBearersTable)
      .where(eq(juniorOfficeBearersTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Junior office bearer not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
