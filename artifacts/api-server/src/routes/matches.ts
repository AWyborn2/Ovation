import { Router, type IRouter } from "express";
import { eq, and, desc, asc, count, type SQL } from "drizzle-orm";
import {
  db,
  matchesTable,
  matchPlayerLinesTable,
  playersTable,
} from "@workspace/db";
import { ListMatchesQueryParams, GetMatchParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/matches", async (req, res): Promise<void> => {
  const query = ListMatchesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { grade, season } = query.data;
  const conditions: SQL[] = [];
  if (grade) conditions.push(eq(matchesTable.grade, grade));
  if (season !== undefined) conditions.push(eq(matchesTable.season, season));

  const rows = await db
    .select({
      id: matchesTable.id,
      grade: matchesTable.grade,
      season: matchesTable.season,
      round: matchesTable.round,
      competition: matchesTable.competition,
      matchDate: matchesTable.matchDate,
      venue: matchesTable.venue,
      result: matchesTable.result,
      opponent: matchesTable.opponent,
      hhccScore: matchesTable.hhccScore,
      opponentScore: matchesTable.opponentScore,
      abandoned: matchesTable.abandoned,
      playerCount: count(matchPlayerLinesTable.id),
    })
    .from(matchesTable)
    .leftJoin(
      matchPlayerLinesTable,
      eq(matchPlayerLinesTable.matchId, matchesTable.id),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(matchesTable.id)
    .orderBy(desc(matchesTable.season), desc(matchesTable.round), desc(matchesTable.id));

  res.json(rows);
});

router.get("/matches/:id", async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [match] = await db
    .select()
    .from(matchesTable)
    .where(eq(matchesTable.id, params.data.id));
  if (!match) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  const lines = await db
    .select({
      id: matchPlayerLinesTable.id,
      playerId: matchPlayerLinesTable.playerId,
      surname: playersTable.surname,
      givenName: playersTable.givenName,
      batted: matchPlayerLinesTable.batted,
      battingPos: matchPlayerLinesTable.battingPos,
      runs: matchPlayerLinesTable.runs,
      balls: matchPlayerLinesTable.balls,
      fours: matchPlayerLinesTable.fours,
      sixes: matchPlayerLinesTable.sixes,
      notOut: matchPlayerLinesTable.notOut,
      dismissal: matchPlayerLinesTable.dismissal,
      bowled: matchPlayerLinesTable.bowled,
      overs: matchPlayerLinesTable.overs,
      maidens: matchPlayerLinesTable.maidens,
      runsConceded: matchPlayerLinesTable.runsConceded,
      wickets: matchPlayerLinesTable.wickets,
      wides: matchPlayerLinesTable.wides,
      noBalls: matchPlayerLinesTable.noBalls,
      catches: matchPlayerLinesTable.catches,
      stumpings: matchPlayerLinesTable.stumpings,
      runOuts: matchPlayerLinesTable.runOuts,
    })
    .from(matchPlayerLinesTable)
    .innerJoin(playersTable, eq(playersTable.id, matchPlayerLinesTable.playerId))
    .where(eq(matchPlayerLinesTable.matchId, params.data.id))
    .orderBy(asc(matchPlayerLinesTable.battingPos), asc(playersTable.surname));

  res.json({
    id: match.id,
    grade: match.grade,
    season: match.season,
    round: match.round,
    competition: match.competition,
    matchDate: match.matchDate,
    venue: match.venue,
    result: match.result,
    opponent: match.opponent,
    hhccScore: match.hhccScore,
    opponentScore: match.opponentScore,
    abandoned: match.abandoned,
    lines,
  });
});

export default router;
