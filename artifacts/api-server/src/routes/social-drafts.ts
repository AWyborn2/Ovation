import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  socialDraftsTable,
  trackedLinksTable,
  importsTable,
  milestoneEventsTable,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/require-admin";
import { generateRoundUpDrafts, generateRecapDrafts } from "../lib/roundup";

const router: IRouter = Router();

const randomSlug = (): string =>
  Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);

router.get("/social-drafts", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(socialDraftsTable)
    .orderBy(desc(socialDraftsTable.createdAt));
  res.json(rows);
});

router.get("/social-drafts/pending-count", requireAdmin, async (_req, res): Promise<void> => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(socialDraftsTable)
    .where(eq(socialDraftsTable.status, "pending"));
  res.json({ count: Number(row?.count ?? 0) });
});

router.post("/social-drafts/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [draft] = await db
    .select()
    .from(socialDraftsTable)
    .where(eq(socialDraftsTable.id, id));
  if (!draft) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  let slug = draft.trackedSlug;
  if (!slug && draft.appPath) {
    slug = randomSlug();
    await db.insert(trackedLinksTable).values({
      slug,
      targetUrl: draft.appPath,
      label: `${draft.engine} #${draft.id}`,
      engine: draft.engine,
    });
  }
  const [updated] = await db
    .update(socialDraftsTable)
    .set({ status: "approved", trackedSlug: slug, reviewedAt: new Date() })
    .where(eq(socialDraftsTable.id, id))
    .returning();
  res.json(updated);
});

router.post("/social-drafts/:id/posted", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [updated] = await db
    .update(socialDraftsTable)
    .set({ status: "posted", reviewedAt: new Date() })
    .where(eq(socialDraftsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Stamp the linked milestone event so other features (push notifications,
  // "just posted" feeds) and re-detection know this moment has been shared.
  if (updated.milestoneEventId) {
    await db
      .update(milestoneEventsTable)
      .set({ postedAt: new Date() })
      .where(eq(milestoneEventsTable.id, updated.milestoneEventId));
  }
  res.json(updated);
});

router.post("/social-drafts/:id/dismiss", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [updated] = await db
    .update(socialDraftsTable)
    .set({ status: "dismissed", reviewedAt: new Date() })
    .where(eq(socialDraftsTable.id, id))
    .returning();
  if (updated?.milestoneEventId) {
    await db
      .update(milestoneEventsTable)
      .set({ dismissedAt: new Date() })
      .where(eq(milestoneEventsTable.id, updated.milestoneEventId));
  }
  res.status(204).end();
});

router.post("/social-roundups", requireAdmin, async (req, res): Promise<void> => {
  const grade = String(req.body?.grade ?? "");
  const season = parseInt(String(req.body?.season ?? ""), 10);
  if (!grade || !Number.isInteger(season)) {
    res.status(400).json({ error: "grade and season required" });
    return;
  }
  const [imp] = await db
    .select({ id: importsTable.id })
    .from(importsTable)
    .where(
      sql`${importsTable.grade} = ${grade} AND ${importsTable.season} = ${season} AND ${importsTable.status} = 'committed'`,
    )
    .orderBy(desc(importsTable.importedAt))
    .limit(1);
  const created = await generateRoundUpDrafts(grade, season, imp?.id ?? null);
  res.json(created);
});

router.post("/social-recaps", requireAdmin, async (req, res): Promise<void> => {
  const grade = String(req.body?.grade ?? "");
  const season = parseInt(String(req.body?.season ?? ""), 10);
  if (!grade || !Number.isInteger(season)) {
    res.status(400).json({ error: "grade and season required" });
    return;
  }
  const created = await generateRecapDrafts(grade, season);
  res.json(created);
});

// Mint a tracked short link for an on-demand share. Public (share buttons are
// on public pages) but restricted to in-app paths so it can't be abused as an
// open redirect.
const ALLOWED_APP_PATHS = /^\/(players|grades|records|premierships|stats|)(\/[A-Za-z0-9%\-_ ]+)?\/?$/;

router.post("/tracked-links", async (req, res): Promise<void> => {
  const targetUrl = String(req.body?.targetUrl ?? "");
  const engine = String(req.body?.engine ?? "ondemand");
  const platform = String(req.body?.platform ?? "");
  const label = String(req.body?.label ?? "");
  if (!targetUrl.startsWith("/") || !ALLOWED_APP_PATHS.test(targetUrl)) {
    res.status(400).json({ error: "targetUrl must be an in-app path" });
    return;
  }
  const slug = randomSlug();
  const [row] = await db
    .insert(trackedLinksTable)
    .values({ slug, targetUrl, label, engine, platform })
    .returning();
  res.status(201).json(row);
});

router.get("/tracked-links", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(trackedLinksTable)
    .orderBy(desc(trackedLinksTable.clickCount));
  res.json(rows);
});

// /go/:slug redirect with click logging. Mounted at the app root, not under /api.
export const goRedirectRouter: IRouter = Router();
goRedirectRouter.get("/go/:slug", async (req, res): Promise<void> => {
  const slug = String(req.params.slug);
  const [link] = await db
    .select()
    .from(trackedLinksTable)
    .where(eq(trackedLinksTable.slug, slug));
  if (!link) {
    res.status(404).send("Not found");
    return;
  }
  await db
    .update(trackedLinksTable)
    .set({
      clickCount: sql`${trackedLinksTable.clickCount} + 1`,
      lastClickedAt: new Date(),
    })
    .where(eq(trackedLinksTable.id, link.id));
  const target = link.targetUrl.startsWith("http")
    ? link.targetUrl
    : `https://${(req.headers.host ?? "")}${link.targetUrl.startsWith("/") ? "" : "/"}${link.targetUrl}`;
  res.redirect(302, target);
});

export default router;
