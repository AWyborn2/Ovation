import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, captainsTable, captainGradePermissionsTable, type CaptainRow } from "@workspace/db";
import {
  CreateCaptainBody,
  UpdateCaptainBody,
  UpdateCaptainParams,
  DeleteCaptainParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { hashPassword } from "../lib/auth";
import { serializeCaptain } from "../lib/serialize-principals";
import { normaliseGrades } from "../lib/normalise-grades";

const router: IRouter = Router();

async function gradesByCaptain(captainIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (captainIds.length === 0) return map;
  const rows = await db
    .select()
    .from(captainGradePermissionsTable)
    .orderBy(asc(captainGradePermissionsTable.grade));
  for (const r of rows) {
    if (!captainIds.includes(r.captainId)) continue;
    if (!map.has(r.captainId)) map.set(r.captainId, []);
    map.get(r.captainId)!.push(r.grade);
  }
  return map;
}

async function setGrades(captainId: number, grades: string[]): Promise<void> {
  await db
    .delete(captainGradePermissionsTable)
    .where(eq(captainGradePermissionsTable.captainId, captainId));
  const clean = normaliseGrades(grades);
  if (clean.length > 0) {
    await db
      .insert(captainGradePermissionsTable)
      .values(clean.map((grade) => ({ captainId, grade })));
  }
}

router.get("/captains", requireAdmin, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(captainsTable)
    .where(eq(captainsTable.tenantId, getTenantId(req)))
    .orderBy(asc(captainsTable.username));
  const grades = await gradesByCaptain(rows.map((r) => r.id));
  res.json(rows.map((r) => serializeCaptain(r, grades.get(r.id) ?? [])));
});

router.post("/captains", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCaptainBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const username = parsed.data.username.trim().toLowerCase();
  if (!username) {
    res.status(400).json({ error: "Username required" });
    return;
  }
  const existing = await db
    .select({ id: captainsTable.id })
    .from(captainsTable)
    .where(and(eq(captainsTable.tenantId, tenantId), eq(captainsTable.username, username)));
  if (existing.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.password);
  const [row] = await db
    .insert(captainsTable)
    .values({ tenantId, username, displayName: parsed.data.displayName, passwordHash })
    .returning();
  await setGrades(row.id, parsed.data.grades);
  res.status(201).json(serializeCaptain(row, normaliseGrades(parsed.data.grades)));
});

router.patch("/captains/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateCaptainParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateCaptainBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const patch: Partial<{ username: string; displayName: string; passwordHash: string }> = {};
  if (body.data.username !== undefined) patch.username = body.data.username.trim().toLowerCase();
  if (body.data.displayName !== undefined) patch.displayName = body.data.displayName;
  if (body.data.password !== undefined && body.data.password !== "") {
    patch.passwordHash = await hashPassword(body.data.password);
  }

  if (patch.username) {
    const conflict = await db
      .select({ id: captainsTable.id })
      .from(captainsTable)
      .where(and(eq(captainsTable.tenantId, tenantId), eq(captainsTable.username, patch.username)));
    if (conflict.length > 0 && conflict[0].id !== params.data.id) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
  }

  let row: CaptainRow | undefined;
  const scoped = and(eq(captainsTable.id, params.data.id), eq(captainsTable.tenantId, tenantId));
  if (Object.keys(patch).length > 0) {
    // A password change invalidates the captain's outstanding sessions.
    const set = patch.passwordHash
      ? { ...patch, sessionEpoch: sql`${captainsTable.sessionEpoch} + 1` }
      : patch;
    [row] = await db.update(captainsTable).set(set).where(scoped).returning();
  } else {
    [row] = await db.select().from(captainsTable).where(scoped);
  }
  if (!row) {
    res.status(404).json({ error: "Captain not found" });
    return;
  }
  if (body.data.grades !== undefined) {
    await setGrades(row.id, body.data.grades);
  }
  const grades = await gradesByCaptain([row.id]);
  res.json(serializeCaptain(row, grades.get(row.id) ?? []));
});

router.delete("/captains/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteCaptainParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(captainsTable)
    .where(and(eq(captainsTable.id, params.data.id), eq(captainsTable.tenantId, getTenantId(req))))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Captain not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
