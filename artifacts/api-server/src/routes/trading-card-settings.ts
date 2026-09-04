import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tradingCardSettingsTable } from "@workspace/db";
import { UpdateTradingCardSettingsBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { getOrCreateSettings } from "../lib/settings";

const router: IRouter = Router();

function serializeTradingCardSettings(row: typeof tradingCardSettingsTable.$inferSelect) {
  return {
    statKeys: row.statKeys,
    statKeysByRole: row.statKeysByRole,
    awardKeys: row.awardKeys,
  };
}

router.get("/trading-card-settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings(tradingCardSettingsTable, getTenantId(req));
  res.json(serializeTradingCardSettings(settings));
});

router.patch("/trading-card-settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateTradingCardSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  await getOrCreateSettings(tradingCardSettingsTable, tenantId);
  const [row] = await db
    .update(tradingCardSettingsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(tradingCardSettingsTable.tenantId, tenantId))
    .returning();
  res.json(serializeTradingCardSettings(row));
});

export default router;
