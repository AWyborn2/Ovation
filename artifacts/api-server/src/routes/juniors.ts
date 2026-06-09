import { Router, type IRouter } from "express";
import {
  eq,
  and,
  asc,
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
  clubsTable,
} from "@workspace/db";
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
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

const JUNIOR_DISPLAY_SETTINGS_ID = 1;

// Columns selected from the shared clubs register to brand a junior match's
// opposition. clubs is a neutral reference table (not a senior stat table), so
// reading it here does not blend junior and senior data.
const opponentClubColumns = {
  opponentClubId: clubsTable.id,
  opponentClubName: clubsTable.name,
  opponentClubShortName: clubsTable.shortName,
  opponentClubLogoUrl: clubsTable.logoUrl,
  opponentClubLogoUrl128: clubsTable.logoUrl128,
  opponentClubPrimaryColour: clubsTable.primaryColour,
  opponentClubSecondaryColour: clubsTable.secondaryColour,
};

type OpponentClubRow = {
  opponentClubId: number | null;
  opponentClubName: string | null;
  opponentClubShortName: string | null;
  opponentClubLogoUrl: string | null;
  opponentClubLogoUrl128: string | null;
  opponentClubPrimaryColour: string | null;
  opponentClubSecondaryColour: string | null;
};

// Collapse the joined club columns into a nullable branding object. Null when
// the junior match has no matched opposition club so renderers fall back.
function toOpponentClub(row: OpponentClubRow) {
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

const MASK_NAME = "Private Player";

type MatchRow = typeof juniorMatchesTable.$inferSelect;

/**
 * Leading-year of a "2024/25" style season, for newest-first ordering. Parsed
 * once at load time into season_start_year (see juniors-etl.sql); fall back to
 * parsing the season text inline for any row that predates that column.
 */
const seasonYear = sql<number>`coalesce(${juniorMatchesTable.seasonStartYear}, nullif(substring(${juniorMatchesTable.season} from 1 for 4), '')::int)`;

async function getPrivateIds(): Promise<Set<string>> {
  const rows = await db
    .select({ id: juniorParticipantsTable.participantId })
    .from(juniorParticipantsTable)
    .where(eq(juniorParticipantsTable.isPrivate, true));
  return new Set(rows.map((r) => r.id));
}

/** Resolve Halls Head vs opposition score from the match's two team columns. */
function splitScores(m: MatchRow): {
  hhScore: string | null;
  opponentScore: string | null;
} {
  if (m.opponentName && m.team1 && m.team1 === m.opponentName) {
    return { hhScore: m.team2Score ?? null, opponentScore: m.team1Score ?? null };
  }
  return { hhScore: m.team1Score ?? null, opponentScore: m.team2Score ?? null };
}

function toMatchSummary(
  m: MatchRow,
  club: ReturnType<typeof toOpponentClub> = null,
) {
  const { hhScore, opponentScore } = splitScores(m);
  return {
    id: m.id,
    season: m.season,
    grade: m.grade,
    ageGroup: m.ageGroup,
    teamName: m.teamName,
    competition: m.competition,
    round: m.round,
    matchDate: m.matchDate,
    venue: m.venue,
    status: m.status,
    opponentName: m.opponentName,
    hhResult: m.hhResult,
    hhScore,
    opponentScore,
    hhBattedFirst: m.hhBattedFirst,
    isHallsHead: true,
    opponentClub: club,
  };
}

// Junior overs are stored in cricket ball notation (e.g. 4.5 = 4 overs 5 balls,
// 6 balls per over), NOT decimal — so they must be converted to balls before
// summing, then back. Summing the raw reals would corrupt totals and economy.
const BALLS_PER_OVER = 6;

function oversToBalls(overs: number | null): number {
  if (!overs) return 0;
  const whole = Math.floor(overs);
  const balls = Math.round((overs - whole) * 10);
  return whole * BALLS_PER_OVER + balls;
}

function ballsToOvers(balls: number): number {
  return Math.floor(balls / BALLS_PER_OVER) + (balls % BALLS_PER_OVER) / 10;
}

/** A dismissal counts as "not out" when there is no out-dismissal recorded. */
function isNotOut(dismissal: string | null): boolean {
  if (!dismissal) return true;
  const d = dismissal.trim().toLowerCase();
  if (d === "") return true;
  return d.includes("not out") || d.startsWith("retired");
}

// ---------------------------------------------------------------------------
// GET /juniors/overview
// ---------------------------------------------------------------------------
router.get("/juniors/overview", async (_req, res): Promise<void> => {
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
    recentMatches = seasonRows
      .filter((r) => {
        const key = r.match.ageGroup ?? "";
        if (seenAge.has(key)) return false;
        seenAge.add(key);
        return true;
      })
      .map((r) => toMatchSummary(r.match, toOpponentClub(r)));

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

  // Age groups that actually have leaderboard records in the resolved season
  // (or every age group ever, for the all-time list) — derived from the SAME
  // source as the leaders (HH lines + non-private participants) so a chip never
  // appears for an age group whose matches have no recorded stats. Unions the
  // batting and bowling sides since a player may only appear in one.
  async function ageGroupsForSeason(season: string | null): Promise<string[]> {
    const battingConds = [
      isNotNull(juniorMatchesTable.ageGroup),
      eq(juniorMatchBattingTable.isHallsHead, true),
      eq(juniorParticipantsTable.isPrivate, false),
    ];
    const bowlingConds = [
      isNotNull(juniorMatchesTable.ageGroup),
      eq(juniorMatchBowlingTable.isHallsHead, true),
      eq(juniorParticipantsTable.isPrivate, false),
    ];
    if (season !== null) {
      battingConds.push(eq(juniorMatchesTable.season, season));
      bowlingConds.push(eq(juniorMatchesTable.season, season));
    }
    const [batting, bowling] = await Promise.all([
      db
        .selectDistinct({ ageGroup: juniorMatchesTable.ageGroup })
        .from(juniorMatchBattingTable)
        .innerJoin(
          juniorParticipantsTable,
          eq(juniorParticipantsTable.participantId, juniorMatchBattingTable.participantId),
        )
        .innerJoin(
          juniorMatchesTable,
          eq(juniorMatchesTable.id, juniorMatchBattingTable.matchId),
        )
        .where(and(...battingConds)),
      db
        .selectDistinct({ ageGroup: juniorMatchesTable.ageGroup })
        .from(juniorMatchBowlingTable)
        .innerJoin(
          juniorParticipantsTable,
          eq(juniorParticipantsTable.participantId, juniorMatchBowlingTable.participantId),
        )
        .innerJoin(
          juniorMatchesTable,
          eq(juniorMatchesTable.id, juniorMatchBowlingTable.matchId),
        )
        .where(and(...bowlingConds)),
    ]);
    const set = new Set<string>();
    for (const r of [...batting, ...bowling]) {
      if (r.ageGroup) set.add(r.ageGroup);
    }
    return [...set].sort();
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
router.get("/juniors/filters", async (_req, res): Promise<void> => {
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

  res.json(rows.map((r) => toMatchSummary(r.match, toOpponentClub(r))));
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
  const opponentClub = toOpponentClub(matchRow);

  const privateIds = await getPrivateIds();
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
    round: match.round,
    matchDate: match.matchDate,
    venue: match.venue,
    status: match.status,
    opponentName: match.opponentName,
    hhResult: match.hhResult,
    winner: match.winner,
    tossWinner: match.tossWinner,
    hhBattedFirst: match.hhBattedFirst,
    hhScore,
    opponentScore,
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
  const { search, season, ageGroup } = query.data;

  const conds = [eq(juniorParticipantsTable.isPrivate, false)];
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

  // Aggregate runs / wickets / matches across HH appearances, keyed by pid.
  const [runsRows, wktsRows, matchRows] = await Promise.all([
    db
      .select({
        pid: juniorMatchBattingTable.participantId,
        runs: sql<number>`coalesce(sum(${juniorMatchBattingTable.runs}),0)::int`,
      })
      .from(juniorMatchBattingTable)
      .where(
        and(
          eq(juniorMatchBattingTable.isHallsHead, true),
          isNotNull(juniorMatchBattingTable.participantId),
        ),
      )
      .groupBy(juniorMatchBattingTable.participantId),
    db
      .select({
        pid: juniorMatchBowlingTable.participantId,
        wickets: sql<number>`coalesce(sum(${juniorMatchBowlingTable.wickets}),0)::int`,
      })
      .from(juniorMatchBowlingTable)
      .where(
        and(
          eq(juniorMatchBowlingTable.isHallsHead, true),
          isNotNull(juniorMatchBowlingTable.participantId),
        ),
      )
      .groupBy(juniorMatchBowlingTable.participantId),
    db.execute(sql`
      SELECT participant_id AS pid, count(DISTINCT match_id)::int AS matches
      FROM (
        SELECT participant_id, match_id FROM junior_match_batting WHERE is_halls_head AND participant_id IS NOT NULL
        UNION
        SELECT participant_id, match_id FROM junior_match_bowling WHERE is_halls_head AND participant_id IS NOT NULL
        UNION
        SELECT participant_id, match_id FROM junior_match_rosters WHERE is_halls_head AND participant_id IS NOT NULL
      ) t
      GROUP BY participant_id
    `),
  ]);

  const runsBy = new Map(runsRows.map((r) => [r.pid, r.runs]));
  const wktsBy = new Map(wktsRows.map((r) => [r.pid, r.wickets]));
  const matchesBy = new Map<string, number>(
    (matchRows.rows as { pid: string; matches: number }[]).map((r) => [
      r.pid,
      Number(r.matches),
    ]),
  );

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
    })),
  );
});

// ---------------------------------------------------------------------------
// GET /juniors/players/{id}
// ---------------------------------------------------------------------------
router.get("/juniors/players/:id", async (req, res): Promise<void> => {
  const params = GetJuniorPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const pid = params.data.id;

  const [participant] = await db
    .select()
    .from(juniorParticipantsTable)
    .where(eq(juniorParticipantsTable.participantId, pid));
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
router.get("/juniors/leaderboards", async (_req, res): Promise<void> => {
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
        matchId: juniorMatchBattingTable.matchId,
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
        matchId: juniorMatchBowlingTable.matchId,
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
    matchIds: Set<number>;
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
        matchIds: new Set(),
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
    a.matchIds.add(r.matchId);
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
    a.matchIds.add(r.matchId);
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

  const rows = Array.from(aggByPlayer.values()).map((a) => ({
    participantId: a.participantId,
    displayName: a.displayName,
    matches: a.matchIds.size,
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
const JUNIOR_MILESTONE_TIERS = {
  runs: [250, 500, 1000, 1500, 2000, 2500, 3000],
  wickets: [25, 50, 75, 100, 150, 200],
  games: [25, 50, 75, 100, 150],
} as const;

const JUNIOR_STAT_SINGULAR = { runs: "Run", wickets: "Wicket", games: "Game" } as const;

router.get("/juniors/social-milestones", async (_req, res): Promise<void> => {
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
// Singleton row id=1; mirrors the senior match-display-settings pattern but
// keyed on age group (no roundOrder — junior rounds are free text).
// ---------------------------------------------------------------------------
async function ensureJuniorMatchDisplaySettings() {
  const [existing] = await db
    .select()
    .from(juniorMatchDisplaySettingsTable)
    .where(eq(juniorMatchDisplaySettingsTable.id, JUNIOR_DISPLAY_SETTINGS_ID));
  if (existing) return existing;
  const [created] = await db
    .insert(juniorMatchDisplaySettingsTable)
    .values({ id: JUNIOR_DISPLAY_SETTINGS_ID })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [row] = await db
    .select()
    .from(juniorMatchDisplaySettingsTable)
    .where(eq(juniorMatchDisplaySettingsTable.id, JUNIOR_DISPLAY_SETTINGS_ID));
  return row;
}

function serializeJuniorMatchDisplaySettings(
  s: Awaited<ReturnType<typeof ensureJuniorMatchDisplaySettings>>,
) {
  return {
    defaultAgeGroup: s.defaultAgeGroup ?? "",
    defaultSeasonMode: s.defaultSeasonMode ?? "latest",
    defaultSeason: s.defaultSeason ?? null,
    ageGroupOrder: s.ageGroupOrder ?? [],
  };
}

router.get("/juniors/match-display-settings", async (_req, res): Promise<void> => {
  const settings = await ensureJuniorMatchDisplaySettings();
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
    await ensureJuniorMatchDisplaySettings();
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
      .where(eq(juniorMatchDisplaySettingsTable.id, JUNIOR_DISPLAY_SETTINGS_ID))
      .returning();
    res.json(serializeJuniorMatchDisplaySettings(updated));
  },
);

// ---------------------------------------------------------------------------
// GET /juniors/premierships
// ---------------------------------------------------------------------------
router.get("/juniors/premierships", async (_req, res): Promise<void> => {
  const privateIds = await getPrivateIds();
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
      matchDate: pr.matchDate,
      opponent: pr.opponent,
      hhScore: pr.hhScore,
      oppScore: pr.oppScore,
      resultText: pr.resultText,
      matchId: pr.matchId,
      players: (byPrem.get(pr.id) ?? []).map((pl) => {
        const priv = !!pl.participantId && privateIds.has(pl.participantId);
        return {
          participantId: priv ? null : pl.participantId,
          playerName: priv ? MASK_NAME : (pl.playerName ?? ""),
        };
      }),
    })),
  );
});

// ---------------------------------------------------------------------------
// Leaderboard helpers — all inner-join junior_participants and filter
// is_private, which excludes both opposition players and private participants.
// ---------------------------------------------------------------------------
// Optional scope for the leader helpers. season/ageGroup narrow the aggregate to
// a single junior season and/or age group (used by the home overview's
// latest-season leaders and the /juniors/top-performers filter); omitting both
// gives the all-time club-wide list. junior_matches is always joined so these
// filters are available; the 1:1 join never changes the aggregate when unfiltered.
type LeaderScope = { season?: string; ageGroup?: string };

async function battingLeaders(limit: number, scope: LeaderScope = {}) {
  const conds = [
    eq(juniorMatchBattingTable.isHallsHead, true),
    eq(juniorParticipantsTable.isPrivate, false),
  ];
  if (scope.season) conds.push(eq(juniorMatchesTable.season, scope.season));
  if (scope.ageGroup) conds.push(eq(juniorMatchesTable.ageGroup, scope.ageGroup));
  const rows = await db
    .select({
      participantId: juniorParticipantsTable.participantId,
      displayName: juniorParticipantsTable.displayName,
      runs: sql<number>`coalesce(sum(${juniorMatchBattingTable.runs}),0)::int`,
      innings: sql<number>`count(*)::int`,
      highScore: sql<number>`max(${juniorMatchBattingTable.runs})`,
      outs: sql<number>`count(*) filter (where ${juniorMatchBattingTable.dismissal} is not null and ${juniorMatchBattingTable.dismissal} <> '' and lower(${juniorMatchBattingTable.dismissal}) not like '%not out%' and lower(${juniorMatchBattingTable.dismissal}) not like 'retired%')::int`,
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
    .where(and(...conds))
    .groupBy(juniorParticipantsTable.participantId, juniorParticipantsTable.displayName)
    .having(sql`sum(${juniorMatchBattingTable.runs}) > 0`)
    .orderBy(sql`sum(${juniorMatchBattingTable.runs}) desc nulls last`)
    .limit(limit);
  return rows.map((r) => ({
    participantId: r.participantId,
    displayName: r.displayName ?? "",
    runs: r.runs,
    innings: r.innings,
    highScore: r.highScore,
    average: r.outs > 0 ? Math.round((r.runs / r.outs) * 100) / 100 : null,
  }));
}

async function bowlingLeaders(limit: number, scope: LeaderScope = {}) {
  const conds = [
    eq(juniorMatchBowlingTable.isHallsHead, true),
    eq(juniorParticipantsTable.isPrivate, false),
  ];
  if (scope.season) conds.push(eq(juniorMatchesTable.season, scope.season));
  if (scope.ageGroup) conds.push(eq(juniorMatchesTable.ageGroup, scope.ageGroup));
  const rows = await db
    .select({
      participantId: juniorParticipantsTable.participantId,
      displayName: juniorParticipantsTable.displayName,
      wickets: sql<number>`coalesce(sum(${juniorMatchBowlingTable.wickets}),0)::int`,
      matches: sql<number>`count(distinct ${juniorMatchBowlingTable.matchId})::int`,
      bestWickets: sql<number>`max(${juniorMatchBowlingTable.wickets})`,
      runs: sql<number>`coalesce(sum(${juniorMatchBowlingTable.runs}),0)::int`,
      // Ball notation → balls (whole*6 + tenths) before summing, not decimal overs.
      balls: sql<number>`coalesce(sum(floor(${juniorMatchBowlingTable.overs}) * ${BALLS_PER_OVER} + round((${juniorMatchBowlingTable.overs} - floor(${juniorMatchBowlingTable.overs})) * 10)), 0)::int`,
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
    .where(and(...conds))
    .groupBy(juniorParticipantsTable.participantId, juniorParticipantsTable.displayName)
    .having(sql`sum(${juniorMatchBowlingTable.wickets}) > 0`)
    .orderBy(sql`sum(${juniorMatchBowlingTable.wickets}) desc nulls last`)
    .limit(limit);
  return rows.map((r) => ({
    participantId: r.participantId,
    displayName: r.displayName ?? "",
    wickets: r.wickets,
    matches: r.matches,
    bestWickets: r.bestWickets,
    economy:
      r.balls > 0
        ? Math.round((r.runs / (r.balls / BALLS_PER_OVER)) * 100) / 100
        : null,
  }));
}

async function highestScoreInnings(limit: number) {
  const rows = await db
    .select({
      participantId: juniorParticipantsTable.participantId,
      displayName: juniorParticipantsTable.displayName,
      runs: juniorMatchBattingTable.runs,
      balls: juniorMatchBattingTable.balls,
      season: juniorMatchesTable.season,
      ageGroup: juniorMatchesTable.ageGroup,
      matchId: juniorMatchesTable.id,
      opponentName: juniorMatchesTable.opponentName,
      matchDate: juniorMatchesTable.matchDate,
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
    .where(
      and(
        eq(juniorMatchBattingTable.isHallsHead, true),
        eq(juniorParticipantsTable.isPrivate, false),
        isNotNull(juniorMatchBattingTable.runs),
      ),
    )
    .orderBy(desc(juniorMatchBattingTable.runs))
    .limit(limit);
  return rows.map((r) => ({
    participantId: r.participantId,
    displayName: r.displayName ?? "",
    runs: r.runs ?? 0,
    balls: r.balls,
    season: r.season,
    ageGroup: r.ageGroup,
    matchId: r.matchId,
    opponentName: r.opponentName,
    matchDate: r.matchDate,
  }));
}

async function bestBowlingFigures(limit: number) {
  const rows = await db
    .select({
      participantId: juniorParticipantsTable.participantId,
      displayName: juniorParticipantsTable.displayName,
      wickets: juniorMatchBowlingTable.wickets,
      runs: juniorMatchBowlingTable.runs,
      season: juniorMatchesTable.season,
      ageGroup: juniorMatchesTable.ageGroup,
      matchId: juniorMatchesTable.id,
      opponentName: juniorMatchesTable.opponentName,
      matchDate: juniorMatchesTable.matchDate,
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
    .where(
      and(
        eq(juniorMatchBowlingTable.isHallsHead, true),
        eq(juniorParticipantsTable.isPrivate, false),
        isNotNull(juniorMatchBowlingTable.wickets),
      ),
    )
    .orderBy(
      desc(juniorMatchBowlingTable.wickets),
      juniorMatchBowlingTable.runs,
    )
    .limit(limit);
  return rows.map((r) => ({
    participantId: r.participantId,
    displayName: r.displayName ?? "",
    wickets: r.wickets ?? 0,
    runs: r.runs ?? 0,
    season: r.season,
    ageGroup: r.ageGroup,
    matchId: r.matchId,
    opponentName: r.opponentName,
    matchDate: r.matchDate,
  }));
}

// ---------------------------------------------------------------------------
// Junior office bearers — admin-managed, kept COMPLETELY SEPARATE from the
// senior club_roles table. Public list returns published rows only.
// ---------------------------------------------------------------------------
const officeBearersOrdered = () =>
  db
    .select()
    .from(juniorOfficeBearersTable)
    .orderBy(
      desc(juniorOfficeBearersTable.season),
      asc(juniorOfficeBearersTable.displayOrder),
      asc(juniorOfficeBearersTable.id),
    );

router.get("/juniors/office-bearers", async (_req, res): Promise<void> => {
  const rows = await officeBearersOrdered().where(
    eq(juniorOfficeBearersTable.published, true),
  );
  res.json(rows);
});

router.get(
  "/juniors/office-bearers/all",
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await officeBearersOrdered();
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
