import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tourContentTable } from "@workspace/db";
import { UpdateTourContentBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { getOrCreateSettings } from "../lib/settings";

const router: IRouter = Router();

function serializeTourContent(row: typeof tourContentTable.$inferSelect) {
  return {
    welcomeTitle: row.welcomeTitle,
    welcomeBody: row.welcomeBody,
    fanSteps: row.fanSteps,
    adminSteps: row.adminSteps,
  };
}

router.get("/tour-content", async (req, res): Promise<void> => {
  const content = await getOrCreateSettings(tourContentTable, getTenantId(req));
  res.json(serializeTourContent(content));
});

router.patch(
  "/tour-content",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = UpdateTourContentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    await getOrCreateSettings(tourContentTable, tenantId);
    const [row] = await db
      .update(tourContentTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(tourContentTable.tenantId, tenantId))
      .returning();
    res.json(serializeTourContent(row));
  },
);

export default router;
