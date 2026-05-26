import { Router, type IRouter } from "express";
import { eq, ilike, or, desc, asc, count, and } from "drizzle-orm";
import { db, playerGradeStatsTable, playersTable } from "@workspace/db";
import {
  CreateStatBody,
  UpdateStatBody,
  UpdateStatParams,
  DeleteStatParams,
  GetStatParams,
  ListStatsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/stats", async (req, res): Promise<void> => {
  const query = ListStatsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const {
    search,
    grade,
    playerId,
    sortBy = "name",
    sortOrder = "asc",
    page = 1,
    limit = 20,
  } = query.data;

  const offset = (Number(page) - 1) * Number(limit);
  const lim = Number(limit);

  const conditions = [];
  if (search) {
    conditions.push(
      or(
        ilike(playerGradeStatsTable.surname, `%${search}%`),
        ilike(playerGradeStatsTable.givenName, `%${search}%`)
      )
    );
  }
  if (grade) {
    conditions.push(eq(playerGradeStatsTable.grade, grade));
  }
  if (playerId) {
    conditions.push(eq(playerGradeStatsTable.playerId, Number(playerId)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const orderCol = getStatOrderCol(sortBy, sortOrder);

  const [stats, totalResult] = await Promise.all([
    db
      .select()
      .from(playerGradeStatsTable)
      .where(whereClause)
      .orderBy(orderCol)
      .limit(lim)
      .offset(offset),
    db.select({ count: count() }).from(playerGradeStatsTable).where(whereClause),
  ]);

  res.json({
    stats,
    total: Number(totalResult[0]?.count ?? 0),
    page: Number(page),
    limit: lim,
  });
});

function getStatOrderCol(sortBy: string | undefined, sortOrder: string | undefined) {
  const dir = sortOrder === "desc" ? desc : asc;
  switch (sortBy) {
    case "games":
      return dir(playerGradeStatsTable.games);
    case "runs":
      return dir(playerGradeStatsTable.runs);
    case "wickets":
      return dir(playerGradeStatsTable.wickets);
    case "batAvg":
      return dir(playerGradeStatsTable.batAvg);
    case "bowlAvg":
      return dir(playerGradeStatsTable.bowlAvg);
    case "catches":
      return dir(playerGradeStatsTable.catches);
    case "name":
    default:
      return dir(playerGradeStatsTable.surname);
  }
}

router.post("/stats", async (req, res): Promise<void> => {
  const parsed = CreateStatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Get player info
  const [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.id, parsed.data.playerId));

  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const [stat] = await db
    .insert(playerGradeStatsTable)
    .values({
      ...parsed.data,
      surname: player.surname,
      givenName: player.givenName,
    })
    .returning();

  res.status(201).json(stat);
});

router.get("/stats/:id", async (req, res): Promise<void> => {
  const params = GetStatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [stat] = await db
    .select()
    .from(playerGradeStatsTable)
    .where(eq(playerGradeStatsTable.id, params.data.id));

  if (!stat) {
    res.status(404).json({ error: "Stat not found" });
    return;
  }

  res.json(stat);
});

router.patch("/stats/:id", async (req, res): Promise<void> => {
  const params = UpdateStatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateStatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [stat] = await db
    .update(playerGradeStatsTable)
    .set(parsed.data)
    .where(eq(playerGradeStatsTable.id, params.data.id))
    .returning();

  if (!stat) {
    res.status(404).json({ error: "Stat not found" });
    return;
  }

  res.json(stat);
});

router.delete("/stats/:id", async (req, res): Promise<void> => {
  const params = DeleteStatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [stat] = await db
    .delete(playerGradeStatsTable)
    .where(eq(playerGradeStatsTable.id, params.data.id))
    .returning();

  if (!stat) {
    res.status(404).json({ error: "Stat not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
