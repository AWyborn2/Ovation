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
} from "@workspace/db";
import {
  ListJuniorMatchesQueryParams,
  GetJuniorMatchParams,
  ListJuniorPlayersQueryParams,
  GetJuniorPlayerParams,
} from "@workspace/api-zod";

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

function toMatchSummary(m: MatchRow) {
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

  const recentRows = await db
    .select()
    .from(juniorMatchesTable)
    .orderBy(desc(seasonYear), desc(juniorMatchesTable.id))
    .limit(6);

  const [topRunScorers, topWicketTakers] = await Promise.all([
    battingLeaders(5),
    bowlingLeaders(5),
  ]);

  res.json({
    totals: {
      matches: matchCount?.n ?? 0,
      players: playerCount?.n ?? 0,
      premierships: premCount?.n ?? 0,
      seasons: seasonCount?.n ?? 0,
      ageGroups: ageCount?.n ?? 0,
    },
    recentMatches: recentRows.map(toMatchSummary),
    topRunScorers,
    topWicketTakers,
  });
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
    .select()
    .from(juniorMatchesTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(seasonYear), desc(juniorMatchesTable.id));

  res.json(rows.map(toMatchSummary));
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

  const [match] = await db
    .select()
    .from(juniorMatchesTable)
    .where(eq(juniorMatchesTable.id, matchId));
  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

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
async function battingLeaders(limit: number) {
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
    .where(
      and(
        eq(juniorMatchBattingTable.isHallsHead, true),
        eq(juniorParticipantsTable.isPrivate, false),
      ),
    )
    .groupBy(juniorParticipantsTable.participantId, juniorParticipantsTable.displayName)
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

async function bowlingLeaders(limit: number) {
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
    .where(
      and(
        eq(juniorMatchBowlingTable.isHallsHead, true),
        eq(juniorParticipantsTable.isPrivate, false),
      ),
    )
    .groupBy(juniorParticipantsTable.participantId, juniorParticipantsTable.displayName)
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

export default router;
