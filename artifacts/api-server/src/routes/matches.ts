import { Router, type IRouter } from "express";
import { eq, and, ne, desc, asc, count, sql, type SQL } from "drizzle-orm";
import {
  db,
  matchesTable,
  matchPlayerLinesTable,
  matchOppositionLinesTable,
  matchHatTricksTable,
  playersTable,
  importsTable,
  clubsTable,
} from "@workspace/db";
import {
  ListMatchesQueryParams,
  GetMatchParams,
  UpdateMatchRoundParams,
  UpdateMatchRoundBody,
  SetMatchHatTrickParams,
  SetMatchHatTrickBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

// Columns selected from the club register to brand a match's opposition.
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
// the match has no matched opposition club so renderers can fall back.
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

async function loadMatchDetail(matchId: number) {
  const [match] = await db
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
      hhccBattedFirst: matchesTable.hhccBattedFirst,
      abandoned: matchesTable.abandoned,
      ...opponentClubColumns,
    })
    .from(matchesTable)
    .leftJoin(clubsTable, eq(clubsTable.id, matchesTable.opponentClubId))
    .where(eq(matchesTable.id, matchId));
  if (!match) return null;

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
    .where(eq(matchPlayerLinesTable.matchId, matchId))
    .orderBy(asc(matchPlayerLinesTable.battingPos), asc(playersTable.surname));

  // Display-only opposition lines (plain-text names, no player link).
  const oppositionLines = await db
    .select({
      id: matchOppositionLinesTable.id,
      name: matchOppositionLinesTable.name,
      batted: matchOppositionLinesTable.batted,
      battingPos: matchOppositionLinesTable.battingPos,
      runs: matchOppositionLinesTable.runs,
      balls: matchOppositionLinesTable.balls,
      fours: matchOppositionLinesTable.fours,
      sixes: matchOppositionLinesTable.sixes,
      notOut: matchOppositionLinesTable.notOut,
      dismissal: matchOppositionLinesTable.dismissal,
      bowled: matchOppositionLinesTable.bowled,
      overs: matchOppositionLinesTable.overs,
      maidens: matchOppositionLinesTable.maidens,
      runsConceded: matchOppositionLinesTable.runsConceded,
      wickets: matchOppositionLinesTable.wickets,
      wides: matchOppositionLinesTable.wides,
      noBalls: matchOppositionLinesTable.noBalls,
      catches: matchOppositionLinesTable.catches,
      stumpings: matchOppositionLinesTable.stumpings,
      runOuts: matchOppositionLinesTable.runOuts,
    })
    .from(matchOppositionLinesTable)
    .where(eq(matchOppositionLinesTable.matchId, matchId))
    .orderBy(asc(matchOppositionLinesTable.battingPos), asc(matchOppositionLinesTable.id));

  const hatTricks = await db
    .select({ playerId: matchHatTricksTable.playerId })
    .from(matchHatTricksTable)
    .where(eq(matchHatTricksTable.matchId, matchId));

  return {
    id: match.id,
    grade: match.grade,
    season: match.season,
    round: match.round,
    stage: match.stage,
    competition: match.competition,
    matchDate: match.matchDate,
    venue: match.venue,
    result: match.result,
    opponent: match.opponent,
    hhccScore: match.hhccScore,
    opponentScore: match.opponentScore,
    hhccBattedFirst: match.hhccBattedFirst,
    abandoned: match.abandoned,
    opponentClub: toOpponentClub(match),
    lines,
    oppositionLines,
    hatTrickPlayerIds: hatTricks.map((h) => h.playerId),
  };
}

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
    .leftJoin(
      matchPlayerLinesTable,
      eq(matchPlayerLinesTable.matchId, matchesTable.id),
    )
    .leftJoin(clubsTable, eq(clubsTable.id, matchesTable.opponentClubId))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(matchesTable.id, clubsTable.id)
    .orderBy(desc(matchesTable.season), desc(matchesTable.round), desc(matchesTable.id));

  res.json(
    rows.map(({ opponentClubId, opponentClubName, opponentClubShortName, opponentClubLogoUrl, opponentClubLogoUrl128, opponentClubPrimaryColour, opponentClubSecondaryColour, ...rest }) => ({
      ...rest,
      opponentClub: toOpponentClub({
        opponentClubId,
        opponentClubName,
        opponentClubShortName,
        opponentClubLogoUrl,
        opponentClubLogoUrl128,
        opponentClubPrimaryColour,
        opponentClubSecondaryColour,
      }),
    })),
  );
});

router.get("/matches/:id", async (req, res): Promise<void> => {
  const params = GetMatchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const detail = await loadMatchDetail(params.data.id);
  if (!detail) {
    res.status(404).json({ error: "Match not found" });
    return;
  }

  res.json(detail);
});

router.patch(
  "/matches/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateMatchRoundParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateMatchRoundBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
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

    // A match identity is a numeric round XOR a finals stage. A stage always
    // wins and clears the round; otherwise the round stands and the stage is
    // cleared. If neither is supplied, the identity is left unchanged.
    const hasRound = body.data.round != null;
    const hasStage = body.data.stage != null;
    const newStage = hasStage ? body.data.stage! : null;
    const newRound = hasStage ? null : (body.data.round ?? null);

    if (!hasRound && !hasStage) {
      res
        .status(400)
        .json({ error: "Provide a round or a finals stage to update the match." });
      return;
    }

    const seasonLabel = `${match.season}/${String((match.season + 1) % 100).padStart(2, "0")}`;
    const identityLabel = newStage
      ? `The ${newStage}`
      : `Round ${newRound}`;
    const conflictMessage = `${identityLabel} is already used by another ${match.grade} match in ${seasonLabel}.`;

    if (match.round !== newRound || match.stage !== newStage) {
      // Identity is unique per (grade, season). Check before writing so we can
      // return a clear 409 rather than a raw DB constraint error.
      const [conflict] = await db
        .select({ id: matchesTable.id })
        .from(matchesTable)
        .where(
          and(
            eq(matchesTable.grade, match.grade),
            eq(matchesTable.season, match.season),
            newRound == null
              ? sql`${matchesTable.round} IS NULL`
              : eq(matchesTable.round, newRound),
            newStage == null
              ? sql`${matchesTable.stage} IS NULL`
              : eq(matchesTable.stage, newStage),
            ne(matchesTable.id, match.id),
          ),
        );
      if (conflict) {
        res.status(409).json({ error: conflictMessage });
        return;
      }

      try {
        await db.transaction(async (tx) => {
          await tx
            .update(matchesTable)
            .set({ round: newRound, stage: newStage })
            .where(eq(matchesTable.id, match.id));
          // Keep the originating import row's round in sync so the admin
          // imports list doesn't show a stale round.
          await tx
            .update(importsTable)
            .set({ round: newRound })
            .where(eq(importsTable.id, match.importId));
        });
      } catch (err) {
        // Safety net for a concurrent insert racing past the check above.
        if ((err as { code?: string }).code === "23505") {
          res.status(409).json({ error: conflictMessage });
          return;
        }
        throw err;
      }
    }

    const detail = await loadMatchDetail(match.id);
    res.json(detail);
  },
);

// Admin: toggle a hat-trick flag for one player in a match. Uniqueness is
// enforced here (check-then insert/delete) rather than by a DB constraint —
// see lib/db/src/schema/matches.ts for why.
router.post(
  "/matches/:id/hat-tricks",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = SetMatchHatTrickParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = SetMatchHatTrickBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }

    const matchId = params.data.id;
    const { playerId, hatTrick } = body.data;

    // The player must have a line in this match for the flag to make sense.
    const [line] = await db
      .select({ id: matchPlayerLinesTable.id })
      .from(matchPlayerLinesTable)
      .where(
        and(
          eq(matchPlayerLinesTable.matchId, matchId),
          eq(matchPlayerLinesTable.playerId, playerId),
        ),
      );
    if (!line) {
      res
        .status(404)
        .json({ error: "Player did not play in this match." });
      return;
    }

    const [existing] = await db
      .select({ id: matchHatTricksTable.id })
      .from(matchHatTricksTable)
      .where(
        and(
          eq(matchHatTricksTable.matchId, matchId),
          eq(matchHatTricksTable.playerId, playerId),
        ),
      );

    if (hatTrick && !existing) {
      await db.insert(matchHatTricksTable).values({ matchId, playerId });
    } else if (!hatTrick && existing) {
      await db
        .delete(matchHatTricksTable)
        .where(eq(matchHatTricksTable.id, existing.id));
    }

    const detail = await loadMatchDetail(matchId);
    res.json(detail);
  },
);

export default router;
