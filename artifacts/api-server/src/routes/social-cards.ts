import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  clubPhotosTable,
  socialSettingsTable,
  milestoneBoardSettingsTable,
  captionTemplatesTable,
  type PostingScheduleRow,
  type RoundSchedulesRow,
} from "@workspace/db";
import {
  UpdateSocialSettingsBody,
  UpdateMilestoneBoardSettingsBody,
  UpsertCaptionTemplateBody,
  CreateCardRenderStillBody,
  SetCardTeamNameBody,
  SetCardCompetitionLabelBody,
  SetCardTeamCrestBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { loadActiveSponsors } from "../lib/active-sponsors";
import { getTenantBrand } from "../lib/tenant-brand";
import {
  ROUND_CARDS,
  invalidRoundSchedule,
  mergeRoundSchedules,
  resolveRoundSchedules,
} from "../lib/round-schedules";
import {
  invalidPostingSchedule,
  mergePostingSchedule,
  resolvePostingSchedule,
  seedPostingSchedule,
} from "../lib/posting-schedule";
import {
  switchCalendarOff,
  switchCalendarOn,
  type SwitchoverSummary,
} from "../lib/posting-switchover";
import { getTenantId } from "../middlewares/tenant-context";
import { getOrCreateSettings } from "../lib/settings";
import { invalidateMilestonesCache } from "../lib/milestones-cache";
import { renderCardStill, harnessOriginFromHeaders } from "../lib/card-video-renderer";
import { DEFAULT_TEMPLATES, ensureSettings } from "../lib/social-cards-helpers";
import { resolveFamilyConfig, syncFamilySettings } from "../lib/social-families";
import { persistDueDrafts } from "../lib/effective-draft-state";
import { loadConnection } from "../lib/publishing/connections";
import { postingPlanWrite, resolvePostingPlan } from "../lib/posting-plan";
import { tenantIsCentral } from "../lib/tenant";
import { readCardContentSettings } from "@workspace/scorecard/card-content";
import {
  listCardNames,
  loadCardNames,
  setCompetitionLabelOverride,
  setTeamCrestOverride,
  setTeamNameOverride,
} from "../lib/card-content/names";
import { checkCrestChoice } from "../lib/card-content/crest-choice";

// Deliberately loose: the address is only ever a recipient for our own mail.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Design-pack ids as the spec's `PackColourModes` declares them. Zod does not
// carry `propertyNames` / `maxProperties`, so the route enforces both.
const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_PACK_MODES = 32;

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
  const central = await tenantIsCentral(tenantId);
  const captionTemplates = await db
    .select()
    .from(captionTemplatesTable)
    .where(eq(captionTemplatesTable.tenantId, tenantId));
  res.json({
    // The effective family switches — derived from the engine flags until a
    // tenant first saves them.
    settings: {
      ...settings,
      familyConfig: resolveFamilyConfig(settings),
      roundSchedules: resolveRoundSchedules(settings.roundSchedules),
      postingPlan: resolvePostingPlan(settings, central),
      postingPlanSaved: settings.postingPlan != null,
      centralData: central,
      postingSchedule: resolvePostingSchedule(settings.postingSchedule),
      cardContent: readCardContentSettings(settings.cardContent),
    },
    captionTemplates: captionTemplates.map((t) => ({
      engine: t.engine,
      platform: t.platform,
      template: t.template,
    })),
    activeSponsors: await loadActiveSponsors(tenantId, req.log),
    brand: await getTenantBrand(tenantId),
    // The club's short names and crests for every card the Studio renders (ADR-010 P1).
    cardNames: await loadCardNames(tenantId, {
      onCentralError: (err) => req.log.warn({ err }, "card names: central read failed"),
    }),
  });
});

// Team and competition names on cards (ADR-010 P1). Tenant-curated: keyed on
// the central club id, never written to central.
router.get(
  "/social-settings/card-names",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    res.json(await listCardNames(getTenantId(req)));
  },
);

router.put(
  "/social-settings/card-names/teams",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = SetCardTeamNameBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const { centralClubId, gradeKey, shortName } = parsed.data;
    await setTeamNameOverride(tenantId, centralClubId, gradeKey ?? null, shortName ?? null);
    res.json(await listCardNames(tenantId));
  },
);

router.put(
  "/social-settings/card-names/crests",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = SetCardTeamCrestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const checked = await checkCrestChoice(parsed.data.crestSource, parsed.data.crestUrl);
    if (!checked.ok) {
      res.status(400).json({ error: checked.error });
      return;
    }
    const tenantId = getTenantId(req);
    await setTeamCrestOverride(tenantId, parsed.data.centralClubId, checked.choice);
    res.json(await listCardNames(tenantId));
  },
);

// Crests Ovation already knows (PlayHQ organisation logos): neutral reference
// data the senior and junior name settings both pick from.
router.get(
  "/social-settings/card-names/known-crests",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (_req, res): Promise<void> => {
    const { centralKnownCrests } = await import("@workspace/db/central-queries");
    res.json({ crests: await centralKnownCrests() });
  },
);

router.put(
  "/social-settings/card-names/competitions",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = SetCardCompetitionLabelBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    await setCompetitionLabelOverride(tenantId, parsed.data.gradeKey, parsed.data.label ?? null);
    res.json(await listCardNames(tenantId));
  },
);

router.patch(
  "/social-settings",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = UpdateSocialSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const current = await ensureSettings(tenantId);
    const email = parsed.data.notificationEmail;
    if (typeof email === "string" && email.trim() !== "" && !EMAIL_RE.test(email.trim())) {
      res.status(400).json({ error: "That notification email doesn't look right." });
      return;
    }
    if (typeof email === "string") parsed.data.notificationEmail = email.trim() || null;
    // The livestream link prints on cards: an https address, or nothing.
    const livestream = parsed.data.livestreamUrl;
    if (typeof livestream === "string") {
      const url = livestream.trim();
      if (url && !/^https:\/\/[^\s/$.?#][^\s]*$/i.test(url)) {
        res.status(400).json({ error: "The livestream link must start with https://." });
        return;
      }
      parsed.data.livestreamUrl = url || null;
    }
    // The sponsors page background (ADR-010 P6): one of this club's own
    // club-wide library photos. Another club's photo id reads as not found.
    const background = parsed.data.sponsorsBackgroundPhotoId;
    if (typeof background === "number") {
      const [photo] = await db
        .select({ id: clubPhotosTable.id })
        .from(clubPhotosTable)
        .where(
          and(
            eq(clubPhotosTable.id, background),
            eq(clubPhotosTable.tenantId, tenantId),
            isNull(clubPhotosTable.grade),
          ),
        );
      if (!photo) {
        res.status(400).json({ error: "Choose a club-wide photo from your library." });
        return;
      }
    }
    // Per-pack colour modes merge into the stored map, so toggling one pack's
    // tile never clobbers another's (two admins, two tiles, no lost write).
    let packColourModes: Record<string, "club" | "pack"> | undefined;
    if (parsed.data.packColourModes) {
      const merged = { ...(current.packColourModes ?? {}), ...parsed.data.packColourModes };
      const keys = Object.keys(merged);
      if (keys.length > MAX_PACK_MODES || !keys.every((k) => PACK_ID_RE.test(k))) {
        res.status(400).json({ error: "Unknown design pack." });
        return;
      }
      packColourModes = merged;
    }
    // Round schedules merge per card, like the pack colour modes.
    let roundSchedules: RoundSchedulesRow | undefined;
    if (parsed.data.roundSchedules) {
      const patchSchedules = parsed.data.roundSchedules as RoundSchedulesRow;
      for (const card of ROUND_CARDS) {
        const s = patchSchedules[card];
        const problem = s ? invalidRoundSchedule(card, s) : null;
        if (problem) {
          res.status(400).json({ error: problem });
          return;
        }
      }
      roundSchedules = mergeRoundSchedules(current.roundSchedules, patchSchedules);
    }
    // The posting calendar (plan 2026-10-07-003). Kinds merge per kind; the
    // first switch-on starts from the times the club already drafts round
    // cards at (KTD4).
    let postingSchedule: PostingScheduleRow | undefined;
    let switching: "on" | "off" | null = null;
    if (parsed.data.postingSchedule) {
      const patch = parsed.data.postingSchedule as PostingScheduleRow;
      const problem = invalidPostingSchedule(patch);
      if (problem) {
        res.status(400).json({ error: problem });
        return;
      }
      const before = resolvePostingSchedule(current.postingSchedule);
      const base: PostingScheduleRow | null =
        current.postingSchedule ??
        (patch.enabled
          ? seedPostingSchedule(resolveRoundSchedules(roundSchedules ?? current.roundSchedules))
          : null);
      postingSchedule = mergePostingSchedule(base, patch);
      const after = resolvePostingSchedule(postingSchedule);
      if (!before.enabled && after.enabled) switching = "on";
      if (before.enabled && !after.enabled) switching = "off";
    }
    const calendarAfter = resolvePostingSchedule(
      postingSchedule ?? current.postingSchedule,
    ).enabled;
    // Auto-publish (Meta publishing R4, R5) rides on auto-post and a live
    // connection, and never publishes drafts older than the window allows.
    const autoPostAfter = parsed.data.autoPostEnabled ?? current.autoPostEnabled;
    if (!autoPostAfter) parsed.data.autoPublishEnabled = false;
    if (parsed.data.autoPublishEnabled === true && !current.autoPublishEnabled) {
      if ((await loadConnection(tenantId))?.status !== "connected") {
        res.status(400).json({ error: "Connect Facebook and Instagram before auto-publishing." });
        return;
      }
    }
    const windowAfter = parsed.data.autoPostWindowHours ?? current.autoPostWindowHours;
    const freshnessAfter =
      parsed.data.autoPublishFreshnessHours ?? current.autoPublishFreshnessHours;
    // On the posting calendar the age limit replaces the cut-off (KTD9).
    if (
      !calendarAfter &&
      (parsed.data.autoPublishEnabled ?? current.autoPublishEnabled) &&
      freshnessAfter < windowAfter
    ) {
      res.status(400).json({
        error: "The auto-publish cut-off must be at least the auto-post window.",
      });
      return;
    }
    // Turning auto-post off first stores every draft that already reads as
    // ready, so none quietly returns to review (KTD4, AE5).
    if (current.autoPostEnabled && parsed.data.autoPostEnabled === false) {
      await persistDueDrafts(tenantId);
    }
    // A saved Posting Plan also rewrites the family switches and round-schedule
    // modes it collapses to (plan 2026-10-07-001 KTD3); day and hour are kept.
    const central = await tenantIsCentral(tenantId);
    let planColumns: Partial<typeof socialSettingsTable.$inferInsert> = {};
    if (parsed.data.postingPlan) {
      const written = postingPlanWrite(current, parsed.data.postingPlan, central);
      if ("error" in written) {
        res.status(400).json({ error: written.error });
        return;
      }
      planColumns = written.columns;
    }
    // Family switches and the legacy engine flags are kept in step both ways.
    const {
      familyConfig: _submitted,
      packColourModes: _modes,
      roundSchedules: _schedules,
      postingPlan: _plan,
      postingSchedule: _posting,
      cardContent: _content,
      ...patch
    } = parsed.data;
    const [row] = await db
      .update(socialSettingsTable)
      .set({
        ...patch,
        ...syncFamilySettings(current, parsed.data),
        ...(packColourModes ? { packColourModes } : {}),
        ...(roundSchedules ? { roundSchedules } : {}),
        ...planColumns,
        ...(postingSchedule ? { postingSchedule } : {}),
        // Stored whole and cleaned: unknown kinds, presets and field keys are dropped.
        ...(parsed.data.cardContent
          ? { cardContent: readCardContentSettings(parsed.data.cardContent) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(socialSettingsTable.tenantId, tenantId))
      .returning();
    // Bring the club's open cards onto the calendar, or hand them back to
    // auto-post (KTD3).
    const resolvedPosting = resolvePostingSchedule(row.postingSchedule);
    let postingSwitchover: SwitchoverSummary | undefined;
    if (switching === "on") {
      postingSwitchover = await switchCalendarOn(tenantId, resolvedPosting, new Date());
    } else if (switching === "off") {
      postingSwitchover = await switchCalendarOff(tenantId);
    }
    res.json({
      ...row,
      familyConfig: resolveFamilyConfig(row),
      roundSchedules: resolveRoundSchedules(row.roundSchedules),
      postingPlan: resolvePostingPlan(row, central),
      postingPlanSaved: row.postingPlan != null,
      centralData: central,
      postingSchedule: resolvedPosting,
      cardContent: readCardContentSettings(row.cardContent),
      ...(postingSwitchover ? { postingSwitchover } : {}),
    });
  },
);

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

router.patch(
  "/milestone-board-settings",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
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
  },
);

router.put(
  "/caption-templates",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
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
        target: [
          captionTemplatesTable.tenantId,
          captionTemplatesTable.engine,
          captionTemplatesTable.platform,
        ],
        set: { template, updatedAt: new Date() },
      });
    res.json({ engine, platform, template });
  },
);

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
        { format: parsed.data.format, scale: parsed.data.scale },
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
