import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  socialSettingsTable,
  milestoneBoardSettingsTable,
  captionTemplatesTable,
} from "@workspace/db";
import {
  UpdateSocialSettingsBody,
  UpdateMilestoneBoardSettingsBody,
  UpsertCaptionTemplateBody,
  CreateCardRenderStillBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { loadActiveSponsors } from "../lib/active-sponsors";
import { getTenantBrand } from "../lib/tenant-brand";
import { getTenantId } from "../middlewares/tenant-context";
import { getOrCreateSettings } from "../lib/settings";
import { invalidateMilestonesCache } from "../lib/milestones-cache";
import {
  renderCardStill,
  harnessOriginFromHeaders,
} from "../lib/card-video-renderer";
import {
  DEFAULT_TEMPLATES,
  ensureSettings,
} from "../lib/social-cards-helpers";

import assetsRouter from "./social-cards-assets";
import designRouter from "./social-cards-design";
import setsRouter from "./social-cards-sets";

// Re-exported for social-cards-templates.test.ts, which asserts the shipped
// defaults carry no tenant-specific brand string.
export { DEFAULT_TEMPLATES };

/**
 * `/social-*` — the social studio API, composed from one router per concern.
 * This module owns the studio settings (social settings, milestone-board
 * settings, caption templates), the static pack PNG render, and the
 * composition; the rest lives in:
 *
 *  - `social-cards-assets.ts` sponsors, card colour themes, audio tracks
 *  - `social-cards-design.ts` BYO templates, layer layouts, effect presets
 *  - `social-cards-sets.ts`   carousel sets + generate / autoseed
 *
 * Sub-routers are mounted in the order the routes were originally registered.
 */
const router: IRouter = Router();

router.use(assetsRouter);
router.use(designRouter);
router.use(setsRouter);

router.get("/social-settings", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const settings = await ensureSettings(tenantId);
  const captionTemplates = await db
    .select()
    .from(captionTemplatesTable)
    .where(eq(captionTemplatesTable.tenantId, tenantId));
  res.json({
    settings,
    captionTemplates: captionTemplates.map((t) => ({
      engine: t.engine,
      platform: t.platform,
      template: t.template,
    })),
    activeSponsors: await loadActiveSponsors(tenantId, req.log),
    brand: await getTenantBrand(tenantId),
  });
});

router.patch("/social-settings", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const parsed = UpdateSocialSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  await ensureSettings(tenantId);
  const [row] = await db
    .update(socialSettingsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(socialSettingsTable.tenantId, tenantId))
    .returning();
  res.json(row);
});

router.get("/milestone-board-settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings(milestoneBoardSettingsTable, getTenantId(req));
  res.json({
    displayMode: settings.displayMode,
    gamesThreshold: settings.gamesThreshold,
    runsThreshold: settings.runsThreshold,
    wicketsThreshold: settings.wicketsThreshold,
    recencyWeeks: settings.recencyWeeks,
    gamesTiers: settings.gamesTiers,
    runsTiers: settings.runsTiers,
    wicketsTiers: settings.wicketsTiers,
  });
});

router.patch("/milestone-board-settings", requireAdmin, requireEntitlement("curation"), async (req, res): Promise<void> => {
  const parsed = UpdateMilestoneBoardSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  await getOrCreateSettings(milestoneBoardSettingsTable, tenantId);
  const [row] = await db
    .update(milestoneBoardSettingsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(milestoneBoardSettingsTable.tenantId, tenantId))
    .returning();
  // The milestone board is cached per tenant and these settings drive it, so
  // without this the admin sees a successful save and an unchanged board.
  invalidateMilestonesCache(tenantId);
  res.json({
    displayMode: row.displayMode,
    gamesThreshold: row.gamesThreshold,
    runsThreshold: row.runsThreshold,
    wicketsThreshold: row.wicketsThreshold,
    recencyWeeks: row.recencyWeeks,
    gamesTiers: row.gamesTiers,
    runsTiers: row.runsTiers,
    wicketsTiers: row.wicketsTiers,
  });
});

router.put("/caption-templates", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const parsed = UpsertCaptionTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const { engine, platform, template } = parsed.data;
  await db
    .insert(captionTemplatesTable)
    .values({ tenantId, engine, platform, template })
    .onConflictDoUpdate({
      target: [captionTemplatesTable.tenantId, captionTemplatesTable.engine, captionTemplatesTable.platform],
      set: { template, updatedAt: new Date() },
    });
  res.json({ engine, platform, template });
});

// --- Static (pack) PNG render ----------------------------------------------
// Standard "Broadcast Dark" pack cards are rendered pixel-true through the
// headless-Chromium harness in its static mode (mount <PackCard> at native px,
// screenshot the element), rather than the client-side canvas path (which stays
// for BYO templates). Pack cards are static, so this never touches ffmpeg. The
// social studio is a paid feature (gated; pass-through while billing is dormant).
router.post(
  "/card-renders/still",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = CreateCardRenderStillBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const { buffer, contentType } = await renderCardStill(
        parsed.data.input,
        parsed.data.options,
        harnessOriginFromHeaders(req.headers),
      );
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", String(buffer.length));
      res.send(buffer);
    } catch (err) {
      // This endpoint is admin + entitlement gated, so surfacing the underlying
      // cause to the caller is safe — and it turns an otherwise-opaque
      // production 500 into a self-diagnosing message in the Studio modal.
      // Log the full error object (pino serialises the stack) rather than a
      // pre-flattened string so server logs keep the trace too.
      req.log.error({ err }, "card still render failed");
      const detail = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `Card render failed: ${detail}` });
    }
  },
);


export default router;
