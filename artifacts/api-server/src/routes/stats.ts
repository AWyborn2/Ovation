import { Router, type IRouter } from "express";
import { eq, ilike, or, desc, asc, count, and, isNull } from "drizzle-orm";
import {
  db,
  playerGradeStatsTable,
  playerGradeSeasonStatsTable,
  playersTable,
} from "@workspace/db";
import {
  CreateStatBody,
  UpdateStatBody,
  UpdateStatParams,
  DeleteStatParams,
  GetStatParams,
  ListStatsQueryParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { recomputeAggregates } from "../lib/recompute";

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
    season,
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
        ilike(playerGradeStatsTable.givenName, `%${search}%`),
      ),
    );
  }
  if (grade) {
    conditions.push(eq(playerGradeStatsTable.grade, grade));
  }
  if (playerId) {
    conditions.push(eq(playerGradeStatsTable.playerId, Number(playerId)));
  }
  if (season !== undefined) {
    conditions.push(eq(playerGradeStatsTable.season, Number(season)));
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
    case "season":
      return dir(playerGradeStatsTable.season);
    case "name":
    default:
      return dir(playerGradeStatsTable.surname);
  }
}

/**
 * Snapshot fields that POST/PATCH expose to admins. Mirrors the columns of
 * `player_grade_season_stats` that aren't (importId, playerId, grade, season).
 */
type SnapshotPatch = {
  games?: number | null;
  innings?: number | null;
  notOuts?: number | null;
  runs?: number | null;
  highScore?: string | null;
  fifties?: number | null;
  hundreds?: number | null;
  wickets?: number | null;
  runsConceded?: number | null;
  bestBowling?: string | null;
  fiveWickets?: number | null;
  catches?: number | null;
  stumpings?: number | null;
  runOuts?: number | null;
};

function pickSnapshotFields(src: Record<string, unknown>): SnapshotPatch {
  const keys: (keyof SnapshotPatch)[] = [
    "games",
    "innings",
    "notOuts",
    "runs",
    "highScore",
    "fifties",
    "hundreds",
    "wickets",
    "runsConceded",
    "bestBowling",
    "fiveWickets",
    "catches",
    "stumpings",
    "runOuts",
  ];
  const out: SnapshotPatch = {};
  for (const k of keys) {
    if (k in src) (out as Record<string, unknown>)[k] = src[k] as never;
  }
  return out;
}

router.post("/stats", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateStatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [player] = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.id, parsed.data.playerId));
  if (!player) {
    res.status(404).json({ error: "Player not found" });
    return;
  }

  const snapshotFields = pickSnapshotFields(parsed.data as Record<string, unknown>);
  const season = parsed.data.season ?? null;

  await db.transaction(async (tx) => {
    await tx.insert(playerGradeSeasonStatsTable).values({
      playerId: parsed.data.playerId,
      grade: parsed.data.grade,
      season,
      ...snapshotFields,
    });
    await recomputeAggregates(tx, [parsed.data.grade]);
  });

  // Return the freshly recomputed aggregate row for this (player, grade).
  const [row] = await db
    .select()
    .from(playerGradeStatsTable)
    .where(
      and(
        eq(playerGradeStatsTable.playerId, parsed.data.playerId),
        eq(playerGradeStatsTable.grade, parsed.data.grade),
      ),
    );
  res.status(201).json(row);
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

router.patch("/stats/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateStatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateStatBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [agg] = await db
    .select()
    .from(playerGradeStatsTable)
    .where(eq(playerGradeStatsTable.id, params.data.id));
  if (!agg) {
    res.status(404).json({ error: "Stat not found" });
    return;
  }

  const snapshotFields = pickSnapshotFields(body.data as Record<string, unknown>);

  await db.transaction(async (tx) => {
    // Replace the season=NULL baseline snapshot for this (player, grade) with
    // the admin's values, leaving per-season imported snapshots untouched.
    await tx
      .delete(playerGradeSeasonStatsTable)
      .where(
        and(
          eq(playerGradeSeasonStatsTable.playerId, agg.playerId),
          eq(playerGradeSeasonStatsTable.grade, agg.grade),
          isNull(playerGradeSeasonStatsTable.season),
        ),
      );
    await tx.insert(playerGradeSeasonStatsTable).values({
      playerId: agg.playerId,
      grade: agg.grade,
      season: null,
      ...snapshotFields,
    });
    await recomputeAggregates(tx, [agg.grade]);
  });

  const [row] = await db
    .select()
    .from(playerGradeStatsTable)
    .where(
      and(
        eq(playerGradeStatsTable.playerId, agg.playerId),
        eq(playerGradeStatsTable.grade, agg.grade),
      ),
    );
  res.json(row);
});

router.delete("/stats/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteStatParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [agg] = await db
    .select()
    .from(playerGradeStatsTable)
    .where(eq(playerGradeStatsTable.id, params.data.id));
  if (!agg) {
    res.status(404).json({ error: "Stat not found" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(playerGradeSeasonStatsTable)
      .where(
        and(
          eq(playerGradeSeasonStatsTable.playerId, agg.playerId),
          eq(playerGradeSeasonStatsTable.grade, agg.grade),
        ),
      );
    await recomputeAggregates(tx, [agg.grade]);
  });
  res.sendStatus(204);
});

export default router;
