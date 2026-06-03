import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  awardsTable,
  awardWinnersTable,
  awardPointsConfigTable,
  type AwardPointsConfigRow,
} from "@workspace/db";
import {
  ListAwardPointsConfigsParams,
  UpsertAwardPointsConfigBody,
  UpsertAwardPointsConfigParams,
  UpdateAwardPointsConfigBody,
  UpdateAwardPointsConfigParams,
  DeleteAwardPointsConfigParams,
  GetPointsConfigLeaderboardParams,
  FinalisePointsConfigParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import {
  computeLeaderboard,
  configCategories,
  isLeaderboardVisible,
  type PointsCategories,
} from "../lib/points";

const router: IRouter = Router();

function serializeConfig(c: AwardPointsConfigRow) {
  return {
    id: c.id,
    awardId: c.awardId,
    season: c.season,
    includeFinals: c.includeFinals,
    leaderboardVisible: c.leaderboardVisible,
    categories: configCategories(c),
    finalisedAt: c.finalisedAt ? c.finalisedAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  };
}

/** Translate the nested categories object into flat DB columns. */
function categoriesToColumns(cats: PointsCategories) {
  return {
    runsEnabled: cats.runs.enabled,
    runsValue: cats.runs.value,
    wicketsEnabled: cats.wickets.enabled,
    wicketsValue: cats.wickets.value,
    catchesEnabled: cats.catches.enabled,
    catchesValue: cats.catches.value,
    stumpingsEnabled: cats.stumpings.enabled,
    stumpingsValue: cats.stumpings.value,
    runOutsEnabled: cats.runOuts.enabled,
    runOutsValue: cats.runOuts.value,
    gamesEnabled: cats.games.enabled,
    gamesValue: cats.games.value,
    fiftiesEnabled: cats.fifties.enabled,
    fiftiesValue: cats.fifties.value,
    hundredsEnabled: cats.hundreds.enabled,
    hundredsValue: cats.hundreds.value,
    fiveWicketsEnabled: cats.fiveWickets.enabled,
    fiveWicketsValue: cats.fiveWickets.value,
  };
}

async function leaderboardResponse(
  config: AwardPointsConfigRow,
  award: { id: number; key: string; title: string; pointsGrade: string | null; published: boolean },
  forcedVisible: boolean,
) {
  const grade = award.pointsGrade;
  const visible = forcedVisible || isLeaderboardVisible(config, award.published);
  const { entries, winnerPlayerIds } = grade
    ? await computeLeaderboard(config, grade)
    : { entries: [], winnerPlayerIds: [] };
  return {
    configId: config.id,
    awardId: award.id,
    awardKey: award.key,
    awardTitle: award.title,
    season: config.season,
    grade,
    visible,
    finalised: config.finalisedAt != null,
    entries: visible ? entries : [],
    winnerPlayerIds: visible ? winnerPlayerIds : [],
  };
}

// ---- Admin: points config ----

router.get("/awards/:id/points-config", requireAdmin, async (req, res): Promise<void> => {
  const params = ListAwardPointsConfigsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(awardPointsConfigTable)
    .where(eq(awardPointsConfigTable.awardId, params.data.id))
    .orderBy(desc(awardPointsConfigTable.season));
  res.json(rows.map(serializeConfig));
});

router.post("/awards/:id/points-config", requireAdmin, async (req, res): Promise<void> => {
  const params = UpsertAwardPointsConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpsertAwardPointsConfigBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [award] = await db.select().from(awardsTable).where(eq(awardsTable.id, params.data.id));
  if (!award) {
    res.status(404).json({ error: "Award not found" });
    return;
  }
  const base = {
    awardId: params.data.id,
    season: body.data.season,
    includeFinals: body.data.includeFinals ?? false,
    leaderboardVisible: body.data.leaderboardVisible ?? false,
  };
  const values = body.data.categories
    ? { ...base, ...categoriesToColumns(body.data.categories as PointsCategories) }
    : base;
  const [existing] = await db
    .select()
    .from(awardPointsConfigTable)
    .where(
      and(
        eq(awardPointsConfigTable.awardId, params.data.id),
        eq(awardPointsConfigTable.season, body.data.season),
      ),
    );
  let row: AwardPointsConfigRow;
  if (existing) {
    [row] = await db
      .update(awardPointsConfigTable)
      .set(values)
      .where(eq(awardPointsConfigTable.id, existing.id))
      .returning();
  } else {
    [row] = await db.insert(awardPointsConfigTable).values(values).returning();
  }
  res.json(serializeConfig(row));
});

router.patch("/points-configs/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAwardPointsConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateAwardPointsConfigBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const patch: Partial<AwardPointsConfigRow> = {};
  if (body.data.includeFinals !== undefined) patch.includeFinals = body.data.includeFinals;
  if (body.data.leaderboardVisible !== undefined) {
    patch.leaderboardVisible = body.data.leaderboardVisible;
  }
  if (body.data.categories !== undefined) {
    Object.assign(patch, categoriesToColumns(body.data.categories as PointsCategories));
  }
  if (Object.keys(patch).length === 0) {
    const [row] = await db
      .select()
      .from(awardPointsConfigTable)
      .where(eq(awardPointsConfigTable.id, params.data.id));
    if (!row) {
      res.status(404).json({ error: "Config not found" });
      return;
    }
    res.json(serializeConfig(row));
    return;
  }
  const [row] = await db
    .update(awardPointsConfigTable)
    .set(patch)
    .where(eq(awardPointsConfigTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Config not found" });
    return;
  }
  res.json(serializeConfig(row));
});

router.delete("/points-configs/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAwardPointsConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(awardPointsConfigTable)
    .where(eq(awardPointsConfigTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Config not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/points-configs/:id/leaderboard", requireAdmin, async (req, res): Promise<void> => {
  const params = GetPointsConfigLeaderboardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [config] = await db
    .select()
    .from(awardPointsConfigTable)
    .where(eq(awardPointsConfigTable.id, params.data.id));
  if (!config) {
    res.status(404).json({ error: "Config not found" });
    return;
  }
  const [award] = await db.select().from(awardsTable).where(eq(awardsTable.id, config.awardId));
  if (!award) {
    res.status(404).json({ error: "Award not found" });
    return;
  }
  res.json(await leaderboardResponse(config, award, true));
});

router.post("/points-configs/:id/finalise", requireAdmin, async (req, res): Promise<void> => {
  const params = FinalisePointsConfigParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [config] = await db
    .select()
    .from(awardPointsConfigTable)
    .where(eq(awardPointsConfigTable.id, params.data.id));
  if (!config) {
    res.status(404).json({ error: "Config not found" });
    return;
  }
  const [award] = await db.select().from(awardsTable).where(eq(awardsTable.id, config.awardId));
  if (!award) {
    res.status(404).json({ error: "Award not found" });
    return;
  }
  if (!award.pointsGrade) {
    res.status(409).json({ error: "Award has no points grade configured" });
    return;
  }

  const { entries, winnerPlayerIds } = await computeLeaderboard(config, award.pointsGrade);
  const nameById = new Map(entries.map((e) => [e.playerId, e.name]));

  // Replace any previously-finalised winners for this award+season so finalise
  // is idempotent and reflects the latest leaderboard.
  await db
    .delete(awardWinnersTable)
    .where(
      and(
        eq(awardWinnersTable.awardId, award.id),
        eq(awardWinnersTable.season, config.season),
      ),
    );
  if (winnerPlayerIds.length > 0) {
    await db.insert(awardWinnersTable).values(
      winnerPlayerIds.map((playerId, i) => ({
        awardId: award.id,
        season: config.season,
        playerId,
        name: nameById.get(playerId) ?? `#${playerId}`,
        displayOrder: i,
        published: award.published,
      })),
    );
  }
  await db
    .update(awardPointsConfigTable)
    .set({ finalisedAt: new Date() })
    .where(eq(awardPointsConfigTable.id, config.id));

  const winners = await db
    .select()
    .from(awardWinnersTable)
    .where(eq(awardWinnersTable.awardId, award.id))
    .orderBy(
      desc(awardWinnersTable.season),
      asc(awardWinnersTable.displayOrder),
      asc(awardWinnersTable.id),
    );
  res.json({ ...award, winners });
});

// ---- Public: visible leaderboards ----

router.get("/award-points", async (_req, res): Promise<void> => {
  const configs = await db
    .select()
    .from(awardPointsConfigTable)
    .where(eq(awardPointsConfigTable.leaderboardVisible, true));
  if (configs.length === 0) {
    res.json([]);
    return;
  }
  const awards = await db.select().from(awardsTable);
  const awardById = new Map(awards.map((a) => [a.id, a]));

  const out = [];
  for (const config of configs) {
    const award = awardById.get(config.awardId);
    if (!award || !award.published) continue;
    const lb = await leaderboardResponse(config, award, false);
    if (lb.visible) out.push(lb);
  }
  res.json(out);
});

export default router;
