import { Router, type IRouter } from "express";
import { and, asc, eq, ne, count } from "drizzle-orm";
import { db, adminsTable, type AdminRow } from "@workspace/db";
import {
  CreateAdminBody,
  UpdateAdminBody,
  UpdateAdminParams,
  DeleteAdminParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { hashPassword } from "../lib/auth";

const router: IRouter = Router();

function serialize(a: AdminRow) {
  return {
    id: a.id,
    username: a.username,
    displayName: a.displayName,
    createdAt: a.createdAt.toISOString(),
  };
}

// All admin-management is scoped to the request's tenant: a club admin only ever
// sees and manages their own club's admins (usernames are unique per tenant).

router.get("/admins", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const rows = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.tenantId, tenantId))
    .orderBy(asc(adminsTable.username));
  res.json(rows.map(serialize));
});

router.post("/admins", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const parsed = CreateAdminBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const username = parsed.data.username.trim().toLowerCase();
  if (!username) {
    res.status(400).json({ error: "Username required" });
    return;
  }
  const existing = await db
    .select({ id: adminsTable.id })
    .from(adminsTable)
    .where(and(eq(adminsTable.tenantId, tenantId), eq(adminsTable.username, username)));
  if (existing.length > 0) {
    res.status(409).json({ error: "Username already taken" });
    return;
  }
  const passwordHash = await hashPassword(parsed.data.password);
  const [row] = await db
    .insert(adminsTable)
    .values({ tenantId, username, displayName: parsed.data.displayName, passwordHash })
    .returning();
  res.status(201).json(serialize(row));
});

router.patch("/admins/:id", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const params = UpdateAdminParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateAdminBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  // The target admin must belong to this tenant.
  const [target] = await db
    .select({ id: adminsTable.id })
    .from(adminsTable)
    .where(and(eq(adminsTable.id, params.data.id), eq(adminsTable.tenantId, tenantId)));
  if (!target) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }
  const patch: Partial<{ username: string; displayName: string; passwordHash: string }> = {};
  if (body.data.username !== undefined) patch.username = body.data.username.trim().toLowerCase();
  if (body.data.displayName !== undefined) patch.displayName = body.data.displayName;
  if (body.data.password !== undefined && body.data.password !== "") {
    patch.passwordHash = await hashPassword(body.data.password);
  }
  if (Object.keys(patch).length === 0) {
    const [row] = await db.select().from(adminsTable).where(eq(adminsTable.id, params.data.id));
    res.json(serialize(row));
    return;
  }
  if (patch.username) {
    const conflict = await db
      .select({ id: adminsTable.id })
      .from(adminsTable)
      .where(
        and(eq(adminsTable.tenantId, tenantId), eq(adminsTable.username, patch.username)),
      );
    if (conflict.length > 0 && conflict[0].id !== params.data.id) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
  }
  const [row] = await db
    .update(adminsTable)
    .set(patch)
    .where(and(eq(adminsTable.id, params.data.id), eq(adminsTable.tenantId, tenantId)))
    .returning();
  res.json(serialize(row));
});

router.delete("/admins/:id", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const params = DeleteAdminParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Never leave a tenant with zero admins (count this tenant's other admins).
  const remaining = await db
    .select({ c: count() })
    .from(adminsTable)
    .where(and(eq(adminsTable.tenantId, tenantId), ne(adminsTable.id, params.data.id)));
  if ((remaining[0]?.c ?? 0) === 0) {
    res.status(400).json({ error: "Cannot delete the last remaining admin" });
    return;
  }
  const [row] = await db
    .delete(adminsTable)
    .where(and(eq(adminsTable.id, params.data.id), eq(adminsTable.tenantId, tenantId)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Admin not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
