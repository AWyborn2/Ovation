import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, capRegisterTable } from "@workspace/db";
import {
  CreateCapBody,
  UpdateCapBody,
  UpdateCapParams,
  DeleteCapParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

router.get("/caps", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(capRegisterTable)
    .orderBy(asc(capRegisterTable.capNumber));
  res.json(rows);
});

router.post("/caps", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const category = parsed.data.category ?? "male";
    const [row] = await db
      .insert(capRegisterTable)
      .values({
        capNumber: parsed.data.capNumber,
        category,
        name: parsed.data.name,
        deceased: parsed.data.deceased ?? false,
        inStats: parsed.data.inStats ?? false,
        gamesAGrade: parsed.data.gamesAGrade ?? 0,
        playerId: parsed.data.playerId ?? null,
      })
      .returning();
    res.status(201).json(row);
  } catch (e) {
    const msg = (e as Error).message ?? "Insert failed";
    if (/duplicate|unique/i.test(msg)) {
      const category = parsed.data.category ?? "male";
      const label = category === "female" ? "Female A Grade" : "A Grade Male";
      res.status(409).json({ error: `Cap #${parsed.data.capNumber} already exists in the ${label} list.` });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

router.patch("/caps/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateCapParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateCapBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  try {
    const [row] = await db
      .update(capRegisterTable)
      .set(body.data)
      .where(eq(capRegisterTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Cap entry not found" });
      return;
    }
    res.json(row);
  } catch (e) {
    const msg = (e as Error).message ?? "Update failed";
    if (/duplicate|unique/i.test(msg)) {
      res.status(409).json({ error: `Cap number already in use.` });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

router.delete("/caps/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteCapParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(capRegisterTable)
    .where(eq(capRegisterTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Cap entry not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
