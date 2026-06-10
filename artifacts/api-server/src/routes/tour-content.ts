import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tourContentTable } from "@workspace/db";
import { UpdateTourContentBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

const TOUR_CONTENT_ID = 1;

async function ensureTourContent() {
  const [existing] = await db
    .select()
    .from(tourContentTable)
    .where(eq(tourContentTable.id, TOUR_CONTENT_ID));
  if (existing) return existing;
  const [created] = await db
    .insert(tourContentTable)
    .values({ id: TOUR_CONTENT_ID })
    .returning();
  return created;
}

function serializeTourContent(row: typeof tourContentTable.$inferSelect) {
  return {
    welcomeTitle: row.welcomeTitle,
    welcomeBody: row.welcomeBody,
    fanSteps: row.fanSteps,
    adminSteps: row.adminSteps,
  };
}

router.get("/tour-content", async (_req, res): Promise<void> => {
  const content = await ensureTourContent();
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
    await ensureTourContent();
    const [row] = await db
      .update(tourContentTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(tourContentTable.id, TOUR_CONTENT_ID))
      .returning();
    res.json(serializeTourContent(row));
  },
);

export default router;
