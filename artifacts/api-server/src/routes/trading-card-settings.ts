import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tradingCardSettingsTable } from "@workspace/db";
import { UpdateTradingCardSettingsBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

// Singleton, global app-config controlling what every player's trading card
// shows: which career stats appear and which awards are eligible. Empty
// statKeys = per-role defaults; empty awardKeys = all published awards eligible.
const TRADING_CARD_SETTINGS_ID = 1;

async function ensureTradingCardSettings() {
  const [existing] = await db
    .select()
    .from(tradingCardSettingsTable)
    .where(eq(tradingCardSettingsTable.id, TRADING_CARD_SETTINGS_ID));
  if (existing) return existing;
  const [created] = await db
    .insert(tradingCardSettingsTable)
    .values({ id: TRADING_CARD_SETTINGS_ID })
    .returning();
  return created;
}

function serializeTradingCardSettings(
  row: typeof tradingCardSettingsTable.$inferSelect,
) {
  return {
    statKeys: row.statKeys,
    statKeysByRole: row.statKeysByRole,
    awardKeys: row.awardKeys,
  };
}

router.get("/trading-card-settings", async (_req, res): Promise<void> => {
  const settings = await ensureTradingCardSettings();
  res.json(serializeTradingCardSettings(settings));
});

router.patch(
  "/trading-card-settings",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = UpdateTradingCardSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    await ensureTradingCardSettings();
    const [row] = await db
      .update(tradingCardSettingsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(tradingCardSettingsTable.id, TRADING_CARD_SETTINGS_ID))
      .returning();
    res.json(serializeTradingCardSettings(row));
  },
);

export default router;
