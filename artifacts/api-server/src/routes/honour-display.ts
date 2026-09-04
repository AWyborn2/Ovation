import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, honourDisplaySettingsTable } from "@workspace/db";
import { UpdateHonourDisplaySettingsBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { loadActiveSponsors } from "../lib/active-sponsors";
import { dataSource } from "../lib/tenant";
import {
  assembleBoards,
  buildBrand,
  buildGridCatalog,
  ensureHonourDisplaySettings,
  generateKioskToken,
  kioskTokenMatches,
  normalizeCustomKioskToken,
  serializeSettings,
} from "../lib/honour-display-builders";

// Re-exported so existing importers (honour-custom-grid.test.ts) keep their
// current import path while the implementation lives in the lib module.
// composeCustomGrid has no route caller — only the test — so it is forwarded
// straight through rather than imported into this module unused.
export { normalizeCustomKioskToken, kioskTokenMatches };
export { composeCustomGrid } from "../lib/honour-display-builders";

const router: IRouter = Router();

router.get("/honour-display", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const [settingsRow, source] = await Promise.all([
    ensureHonourDisplaySettings(tenantId),
    dataSource(req),
  ]);
  const [boards, brand, gridCatalog, activeSponsors] = await Promise.all([
    assembleBoards(settingsRow, source),
    buildBrand(tenantId),
    buildGridCatalog(tenantId),
    loadActiveSponsors(tenantId, req.log),
  ]);
  res.json({
    boards,
    brand,
    settings: serializeSettings(settingsRow, { includeToken: true }),
    activeSponsors,
    gridCatalog,
  });
});

// Public, token-gated kiosk feed. A fixed clubroom TV / Raspberry Pi can run
// the rotation with a long-lived token instead of an admin session, without
// exposing the rest of the admin surface.
router.get("/honour-display/kiosk", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const settingsRow = await ensureHonourDisplaySettings(tenantId);
  if (!kioskTokenMatches(settingsRow.kioskToken, req.query.token)) {
    res.status(403).json({ error: "Invalid or revoked kiosk token" });
    return;
  }
  const [boards, brand, activeSponsors] = await Promise.all([
    assembleBoards(settingsRow, await dataSource(req)),
    buildBrand(tenantId),
    loadActiveSponsors(tenantId, req.log),
  ]);
  res.json({ boards, brand, settings: serializeSettings(settingsRow), activeSponsors });
});

// Generate (or rotate) the kiosk token. Replaces any existing one, so the
// previous link immediately stops working.
router.post("/honour-display/kiosk-token", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  await ensureHonourDisplaySettings(tenantId);
  // A non-empty `token` in the body sets a custom code; otherwise generate a
  // random one. An invalid custom code is rejected rather than silently
  // falling back, so the admin knows their chosen code wasn't accepted.
  const raw = (req.body ?? {}).token;
  let token: string;
  if (typeof raw === "string" && raw.trim() !== "") {
    const custom = normalizeCustomKioskToken(raw);
    if (!custom) {
      res.status(400).json({
        error: "Custom kiosk code must be 3–40 characters: letters, numbers and hyphens only.",
      });
      return;
    }
    token = custom;
  } else {
    token = generateKioskToken();
  }
  await db
    .update(honourDisplaySettingsTable)
    .set({ kioskToken: token, updatedAt: new Date() })
    .where(eq(honourDisplaySettingsTable.tenantId, tenantId));
  res.json({ token });
});

// Revoke the kiosk token so any existing link stops working.
router.delete(
  "/honour-display/kiosk-token",
  requireAdmin,
  requireEntitlement("clubroomTv"),
  async (req, res): Promise<void> => {
    const tenantId = getTenantId(req);
    await ensureHonourDisplaySettings(tenantId);
    await db
      .update(honourDisplaySettingsTable)
      .set({ kioskToken: null, updatedAt: new Date() })
      .where(eq(honourDisplaySettingsTable.tenantId, tenantId));
    res.json({ token: null });
  },
);

router.patch(
  "/honour-display-settings",
  requireAdmin,
  requireEntitlement("clubroomTv"),
  async (req, res): Promise<void> => {
    const parsed = UpdateHonourDisplaySettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    await ensureHonourDisplaySettings(tenantId);
    const updateFields: Partial<typeof honourDisplaySettingsTable.$inferInsert> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v !== undefined) (updateFields as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(updateFields).length > 0) {
      updateFields.updatedAt = new Date();
      await db
        .update(honourDisplaySettingsTable)
        .set(updateFields)
        .where(eq(honourDisplaySettingsTable.tenantId, tenantId));
    }
    const [row] = await db
      .select()
      .from(honourDisplaySettingsTable)
      .where(eq(honourDisplaySettingsTable.tenantId, tenantId));
    res.json(serializeSettings(row));
  },
);

export default router;
