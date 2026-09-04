import { Router, type IRouter } from "express";
import { and, asc, eq, ne, count, sql } from "drizzle-orm";
import { db, adminsTable } from "@workspace/db";
import {
  CreateAdminBody,
  UpdateAdminBody,
  UpdateAdminParams,
  DeleteAdminParams,
} from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { hashPassword, SESSION_COOKIE } from "../lib/auth";
import { serializeAdmin } from "../lib/serialize-principals";

const router: IRouter = Router();

// All admin-management is scoped to the request's tenant: a club admin only ever
// sees and manages their own club's admins (usernames are unique per tenant).

router.get("/admins", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const rows = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.tenantId, tenantId))
    .orderBy(asc(adminsTable.username));
  res.json(rows.map(serializeAdmin));
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
  res.status(201).json(serializeAdmin(row));
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
    res.json(serializeAdmin(row));
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
  // A password change invalidates every outstanding session for that admin
  // (the token's epoch no longer matches). Renames don't.
  const set = patch.passwordHash
    ? { ...patch, sessionEpoch: sql`${adminsTable.sessionEpoch} + 1` }
    : patch;
  const [row] = await db
    .update(adminsTable)
    .set(set)
    .where(and(eq(adminsTable.id, params.data.id), eq(adminsTable.tenantId, tenantId)))
    .returning();
  res.json(serializeAdmin(row));
});

/**
 * "Log out everywhere": bump the signed-in admin's session epoch so every
 * token minted before now — on any device — stops resolving, then clear this
 * browser's cookie too.
 */
router.post("/auth/logout-all", requireAdmin, async (req, res): Promise<void> => {
  const admin = (req as RequestWithAdmin).admin!;
  await db
    .update(adminsTable)
    .set({ sessionEpoch: sql`${adminsTable.sessionEpoch} + 1` })
    .where(eq(adminsTable.id, admin.id));
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.sendStatus(204);
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
