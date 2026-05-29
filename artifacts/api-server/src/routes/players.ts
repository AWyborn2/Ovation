import { Router, type IRouter } from "express";
import { eq, ilike, or, desc, asc, count, sql } from "drizzle-orm";
import {
  db,
  playersTable,
  playerGradeStatsTable,
  playerGradeSeasonStatsTable,
  premiershipsTable,
  premiershipPlayersTable,
  capRegisterTable,
  lifeMembersTable,
} from "@workspace/db";
import {
  CreatePlayerBody,
  UpdatePlayerBody,
  UpdatePlayerParams,
  DeletePlayerParams,
  GetPlayerParams,
  ListPlayersQueryParams,
  MergePlayerBody,
  MergePlayerParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { recomputeAggregates } from "../lib/recompute";

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

  const conditions: ReturnType<typeof ilike>[] = [];
  if (search) {
    conditions.push(
      ilike(playersTable.surname, `%${search}%`),
      ilike(playersTable.givenName, `%${search}%`),
    );
  }

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

    const whereClause =
      sql`${playersTable.id} = ANY(ARRAY[${sql.raw(playerIds.join(","))}]::int[])`;

    const orderCol = getPlayerOrderCol(sortBy, sortOrder);
    const [players, totalResult] = await Promise.all([
      db
        .select()
        .from(playersTable)
        .where(
          search ? sql`(${whereClause}) AND (${or(...conditions)})` : whereClause,
        )
        .orderBy(orderCol)
        .limit(lim)
        .offset(offset),
      db
        .select({ count: count() })
        .from(playersTable)
        .where(
          search ? sql`(${whereClause}) AND (${or(...conditions)})` : whereClause,
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

router.post("/players", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreatePlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [player] = await db
    .insert(playersTable)
    .values({
      surname: parsed.data.surname,
      givenName: parsed.data.givenName,
      deceased: parsed.data.deceased ?? false,
      imageUrl: parsed.data.imageUrl ?? null,
    })
    .returning();
  res.status(201).json(player);
});

router.get("/players/:id", async (req, res): Promise<void> => {
  const params = GetPlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [playerRow, stats, premRows] = await Promise.all([
    db.select().from(playersTable).where(eq(playersTable.id, params.data.id)).then((rows) => rows[0]),
    db.select().from(playerGradeStatsTable).where(eq(playerGradeStatsTable.playerId, params.data.id)).orderBy(asc(playerGradeStatsTable.grade)),
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
      .innerJoin(premiershipsTable, eq(premiershipsTable.id, premiershipPlayersTable.premiershipId))
      .where(eq(premiershipPlayersTable.playerId, params.data.id))
      .orderBy(desc(premiershipsTable.year), asc(premiershipsTable.grade)),
  ]);

  if (!playerRow) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  res.json({
    ...playerRow,
    premiershipsWon: premRows.length,
    premiershipsCaptained: premRows.filter((r) => r.isCaptain).length,
    stats,
    premierships: premRows,
  });
});

router.patch("/players/:id", requireAdmin, async (req, res): Promise<void> => {
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
  // Sync denormalised name into per-grade stats rows so the UI/leaderboards reflect renames.
  if (parsed.data.surname !== undefined || parsed.data.givenName !== undefined) {
    await db
      .update(playerGradeStatsTable)
      .set({
        surname: player.surname,
        givenName: player.givenName,
      })
      .where(eq(playerGradeStatsTable.playerId, player.id));
  }
  res.json(player);
});

router.delete("/players/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeletePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Cascade deletes wipe stats; recompute affected grades so summaries stay correct.
  const grades = await db
    .selectDistinct({ grade: playerGradeStatsTable.grade })
    .from(playerGradeStatsTable)
    .where(eq(playerGradeStatsTable.playerId, params.data.id));
  await db.transaction(async (tx) => {
    const [player] = await tx
      .delete(playersTable)
      .where(eq(playersTable.id, params.data.id))
      .returning();
    if (!player) {
      throw new Error("__NOT_FOUND__");
    }
    if (grades.length > 0) {
      await recomputeAggregates(tx, grades.map((g) => g.grade));
    }
  }).then(
    () => res.sendStatus(204),
    (err) => {
      if (err?.message === "__NOT_FOUND__") {
        res.status(404).json({ error: "Player not found" });
      } else {
        throw err;
      }
    },
  );
});

router.post("/players/:id/merge", requireAdmin, async (req, res): Promise<void> => {
  const params = MergePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = MergePlayerBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const duplicateId = params.data.id;
  const keeperId = body.data.keeperId;
  if (duplicateId === keeperId) {
    res.status(400).json({ error: "keeperId must differ from duplicate id" });
    return;
  }

  try {
    const keeper = await db.transaction(async (tx) => {
      const [dup] = await tx.select().from(playersTable).where(eq(playersTable.id, duplicateId));
      const [kpr] = await tx.select().from(playersTable).where(eq(playersTable.id, keeperId));
      if (!dup) throw new Error("__DUP_NOT_FOUND__");
      if (!kpr) throw new Error("__KEEPER_NOT_FOUND__");

      const dupGrades = await tx
        .selectDistinct({ grade: playerGradeSeasonStatsTable.grade })
        .from(playerGradeSeasonStatsTable)
        .where(eq(playerGradeSeasonStatsTable.playerId, duplicateId));

      // Reassign every reference from duplicate → keeper.
      await tx
        .update(playerGradeSeasonStatsTable)
        .set({ playerId: keeperId })
        .where(eq(playerGradeSeasonStatsTable.playerId, duplicateId));
      await tx
        .update(premiershipPlayersTable)
        .set({ playerId: keeperId })
        .where(eq(premiershipPlayersTable.playerId, duplicateId));
      await tx
        .update(capRegisterTable)
        .set({ playerId: keeperId })
        .where(eq(capRegisterTable.playerId, duplicateId));
      await tx
        .update(lifeMembersTable)
        .set({ playerId: keeperId })
        .where(eq(lifeMembersTable.playerId, duplicateId));

      // Delete duplicate (cascades aggregates rows).
      await tx.delete(playersTable).where(eq(playersTable.id, duplicateId));

      const affected = dupGrades.map((g) => g.grade);
      if (affected.length > 0) {
        await recomputeAggregates(tx, affected);
      }

      const [refreshed] = await tx.select().from(playersTable).where(eq(playersTable.id, keeperId));
      return refreshed;
    });

    res.json(keeper);
  } catch (err) {
    if ((err as Error)?.message === "__DUP_NOT_FOUND__") {
      res.status(404).json({ error: "Duplicate player not found" });
      return;
    }
    if ((err as Error)?.message === "__KEEPER_NOT_FOUND__") {
      res.status(404).json({ error: "Keeper player not found" });
      return;
    }
    throw err;
  }
});

export default router;
