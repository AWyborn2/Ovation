import { Router, type IRouter } from "express";
import { eq, ilike, or, desc, asc, count, sql } from "drizzle-orm";
import {
  db,
  playersTable,
  playerGradeStatsTable,
  premiershipsTable,
  premiershipPlayersTable,
} from "@workspace/db";
import {
  CreatePlayerBody,
  UpdatePlayerBody,
  UpdatePlayerParams,
  DeletePlayerParams,
  GetPlayerParams,
  ListPlayersQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/players", async (req, res): Promise<void> => {
  const query = ListPlayersQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const {
    search,
    grade,
    sortBy = "name",
    sortOrder = "asc",
    page = 1,
    limit = 20,
  } = query.data;

  const offset = (Number(page) - 1) * Number(limit);
  const lim = Number(limit);

  // Build conditions
  const conditions: ReturnType<typeof ilike>[] = [];
  if (search) {
    conditions.push(
      ilike(playersTable.surname, `%${search}%`),
      ilike(playersTable.givenName, `%${search}%`)
    );
  }

  // If filtering by grade, we need to join with stats
  if (grade) {
    const playersInGrade = await db
      .selectDistinct({ playerId: playerGradeStatsTable.playerId })
      .from(playerGradeStatsTable)
      .where(eq(playerGradeStatsTable.grade, grade));

    const playerIds = playersInGrade.map((r) => r.playerId);
    if (playerIds.length === 0) {
      res.json({ players: [], total: 0, page: Number(page), limit: lim });
      return;
    }

    const whereClause = playerIds.length > 0
      ? sql`${playersTable.id} = ANY(ARRAY[${sql.raw(playerIds.join(","))}]::int[])`
      : undefined;

    const orderCol = getPlayerOrderCol(sortBy, sortOrder);
    const [players, totalResult] = await Promise.all([
      db
        .select()
        .from(playersTable)
        .where(
          search
            ? sql`(${whereClause}) AND (${or(...conditions)})`
            : whereClause
        )
        .orderBy(orderCol)
        .limit(lim)
        .offset(offset),
      db.select({ count: count() }).from(playersTable).where(
        search
          ? sql`(${whereClause}) AND (${or(...conditions)})`
          : whereClause
      ),
    ]);

    res.json({
      players,
      total: Number(totalResult[0]?.count ?? 0),
      page: Number(page),
      limit: lim,
    });
    return;
  }

  const whereClause = search ? or(...conditions) : undefined;
  const orderCol = getPlayerOrderCol(sortBy, sortOrder);

  const [players, totalResult] = await Promise.all([
    db
      .select()
      .from(playersTable)
      .where(whereClause)
      .orderBy(orderCol)
      .limit(lim)
      .offset(offset),
    db.select({ count: count() }).from(playersTable).where(whereClause),
  ]);

  res.json({
    players,
    total: Number(totalResult[0]?.count ?? 0),
    page: Number(page),
    limit: lim,
  });
});

function getPlayerOrderCol(sortBy: string | undefined, sortOrder: string | undefined) {
  const dir = sortOrder === "desc" ? desc : asc;
  switch (sortBy) {
    case "games":
      return dir(playersTable.totalGames);
    case "runs":
      return dir(playersTable.totalRuns);
    case "wickets":
      return dir(playersTable.totalWickets);
    case "name":
    default:
      return dir(playersTable.surname);
  }
}

router.post("/players", async (req, res): Promise<void> => {
  const parsed = CreatePlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [player] = await db.insert(playersTable).values(parsed.data).returning();
  res.status(201).json(player);
});

router.get("/players/:id", async (req, res): Promise<void> => {
  const params = GetPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [playerRow, stats, premRows] = await Promise.all([
    db
      .select()
      .from(playersTable)
      .where(eq(playersTable.id, params.data.id))
      .then((rows) => rows[0]),
    db
      .select()
      .from(playerGradeStatsTable)
      .where(eq(playerGradeStatsTable.playerId, params.data.id))
      .orderBy(asc(playerGradeStatsTable.grade)),
    db
      .select({
        id: premiershipsTable.id,
        year: premiershipsTable.year,
        grade: premiershipsTable.grade,
        competition: premiershipsTable.competition,
        venue: premiershipsTable.venue,
        matchDate: premiershipsTable.matchDate,
        result: premiershipsTable.result,
        mom: premiershipsTable.mom,
        isCaptain: premiershipPlayersTable.isCaptain,
      })
      .from(premiershipPlayersTable)
      .innerJoin(
        premiershipsTable,
        eq(premiershipsTable.id, premiershipPlayersTable.premiershipId),
      )
      .where(eq(premiershipPlayersTable.playerId, params.data.id))
      .orderBy(desc(premiershipsTable.year), asc(premiershipsTable.grade)),
  ]);

  if (!playerRow) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const premiershipsWon = premRows.length;
  const premiershipsCaptained = premRows.filter((r) => r.isCaptain).length;

  res.json({
    ...playerRow,
    premiershipsWon,
    premiershipsCaptained,
    stats,
    premierships: premRows,
  });
});

router.patch("/players/:id", async (req, res): Promise<void> => {
  const params = UpdatePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [player] = await db
    .update(playersTable)
    .set(parsed.data)
    .where(eq(playersTable.id, params.data.id))
    .returning();

  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.json(player);
});

router.delete("/players/:id", async (req, res): Promise<void> => {
  const params = DeletePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [player] = await db
    .delete(playersTable)
    .where(eq(playersTable.id, params.data.id))
    .returning();

  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
