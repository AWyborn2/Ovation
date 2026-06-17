import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db, awardsTable, awardWinnersTable } from "@workspace/db";
import {
  CreateAwardBody,
  UpdateAwardBody,
  UpdateAwardParams,
  DeleteAwardParams,
  CreateAwardWinnerBody,
  CreateAwardWinnerParams,
  UpdateAwardWinnerBody,
  UpdateAwardWinnerParams,
  DeleteAwardWinnerParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";

const router: IRouter = Router();

async function loadWinners(awardIds: number[], publishedOnly: boolean) {
  if (awardIds.length === 0) return new Map<number, (typeof awardWinnersTable.$inferSelect)[]>();
  const where = publishedOnly
    ? and(inArray(awardWinnersTable.awardId, awardIds), eq(awardWinnersTable.published, true))
    : inArray(awardWinnersTable.awardId, awardIds);
  const rows = await db
    .select()
    .from(awardWinnersTable)
    .where(where)
    .orderBy(
      desc(awardWinnersTable.season),
      asc(awardWinnersTable.displayOrder),
      asc(awardWinnersTable.id),
    );
  const byAward = new Map<number, typeof rows>();
  for (const r of rows) {
    if (!byAward.has(r.awardId)) byAward.set(r.awardId, []);
    byAward.get(r.awardId)!.push(r);
  }
  return byAward;
}

// Public: only published awards, with only their published winners.
router.get("/awards", async (req, res): Promise<void> => {
  const awards = await db
    .select()
    .from(awardsTable)
    .where(and(eq(awardsTable.tenantId, getTenantId(req)), eq(awardsTable.published, true)))
    .orderBy(asc(awardsTable.displayOrder), asc(awardsTable.id));

  const byAward = await loadWinners(awards.map((a) => a.id), true);
  res.json(awards.map((a) => ({ ...a, winners: byAward.get(a.id) ?? [] })));
});

// Admin: every award (incl. drafts) with every winner (incl. unpublished).
router.get("/admin/awards", requireAdmin, async (_req, res): Promise<void> => {
  const awards = await db
    .select()
    .from(awardsTable)
    .orderBy(asc(awardsTable.displayOrder), asc(awardsTable.id));

  const byAward = await loadWinners(awards.map((a) => a.id), false);
  res.json(awards.map((a) => ({ ...a, winners: byAward.get(a.id) ?? [] })));
});

router.post("/awards", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateAwardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(awardsTable)
    .values({
      key: parsed.data.key,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      displayOrder: parsed.data.displayOrder ?? 0,
      votingEnabled: parsed.data.votingEnabled ?? false,
      mechanism: parsed.data.mechanism ?? "manual",
      published: parsed.data.published ?? false,
      pointsGrade: parsed.data.pointsGrade ?? null,
    })
    .returning();
  res.status(201).json({ ...row, winners: [] });
});

router.patch("/awards/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateAwardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateAwardBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .update(awardsTable)
    .set(body.data)
    .where(eq(awardsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Award not found" });
    return;
  }
  const byAward = await loadWinners([row.id], false);
  res.json({ ...row, winners: byAward.get(row.id) ?? [] });
});

router.delete("/awards/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteAwardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(awardsTable)
    .where(eq(awardsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Award not found" });
    return;
  }
  res.sendStatus(204);
});

router.post(
  "/awards/:id/winners",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = CreateAwardWinnerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = CreateAwardWinnerBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [award] = await db
      .select()
      .from(awardsTable)
      .where(eq(awardsTable.id, params.data.id));
    if (!award) {
      res.status(404).json({ error: "Award not found" });
      return;
    }
    const [row] = await db
      .insert(awardWinnersTable)
      .values({
        awardId: params.data.id,
        season: body.data.season,
        playerId: body.data.playerId ?? null,
        name: body.data.name,
        displayOrder: body.data.displayOrder ?? 0,
        published: body.data.published ?? true,
      })
      .returning();
    res.status(201).json(row);
  },
);

router.patch(
  "/award-winners/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpdateAwardWinnerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateAwardWinnerBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [row] = await db
      .update(awardWinnersTable)
      .set(body.data)
      .where(eq(awardWinnersTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Winner not found" });
      return;
    }
    res.json(row);
  },
);

router.delete(
  "/award-winners/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteAwardWinnerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .delete(awardWinnersTable)
      .where(eq(awardWinnersTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Winner not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
