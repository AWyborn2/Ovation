import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, nonPlayerPeopleTable } from "@workspace/db";
import {
  CreatePersonBody,
  UpdatePersonBody,
  GetPersonParams,
  UpdatePersonParams,
  DeletePersonParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

// Public: list non-player officials, ordered by name.
router.get("/people", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(nonPlayerPeopleTable)
    .orderBy(asc(nonPlayerPeopleTable.name), asc(nonPlayerPeopleTable.id));
  res.json(rows);
});

// Public: single non-player official (lightweight bio page).
router.get("/people/:id", async (req, res): Promise<void> => {
  const params = GetPersonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select()
    .from(nonPlayerPeopleTable)
    .where(eq(nonPlayerPeopleTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Person not found" });
    return;
  }
  res.json(row);
});

router.post("/people", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreatePersonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(nonPlayerPeopleTable)
    .values({
      name: parsed.data.name,
      bio: parsed.data.bio ?? null,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/people/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdatePersonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdatePersonBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .update(nonPlayerPeopleTable)
    .set(body.data)
    .where(eq(nonPlayerPeopleTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Person not found" });
    return;
  }
  res.json(row);
});

router.delete("/people/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeletePersonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(nonPlayerPeopleTable)
    .where(eq(nonPlayerPeopleTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Person not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
