import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { MatchDetail } from "@workspace/api-zod";
import { matchToSummaryInput } from "@workspace/scorecard";
import {
  db,
  sponsorsTable,
  socialSettingsTable,
  milestoneBoardSettingsTable,
  captionTemplatesTable,
  cardThemesTable,
  cardAudioTracksTable,
  cardTemplatesTable,
  cardLayoutsTable,
  cardEffectPresetsTable,
  cardSetsTable,
  socialDraftsTable,
  matchesTable,
  juniorMatchesTable,
} from "@workspace/db";
import {
  CreateSponsorBody,
  UpdateSponsorBody,
  UpdateSponsorParams,
  DeleteSponsorParams,
  UpdateSocialSettingsBody,
  UpdateMilestoneBoardSettingsBody,
  UpsertCaptionTemplateBody,
  CreateCardThemeBody,
  UpdateCardThemeBody,
  UpdateCardThemeParams,
  DeleteCardThemeParams,
  CreateCardAudioTrackBody,
  UpdateCardAudioTrackBody,
  UpdateCardAudioTrackParams,
  DeleteCardAudioTrackParams,
  CreateCardTemplateBody,
  UpdateCardTemplateBody,
  UpdateCardTemplateParams,
  DeleteCardTemplateParams,
  UpsertCardLayoutBody,
  UpsertCardLayoutParams,
  DeleteCardLayoutParams,
  CreateCardEffectPresetBody,
  DeleteCardEffectPresetParams,
  CreateCardSetBody,
  UpdateCardSetBody,
  UpdateCardSetParams,
  DeleteCardSetParams,
  GenerateCardSetBody,
  AutoseedCardSetBody,
  CreateCardRenderStillBody,
} from "@workspace/api-zod";
import type { CardLayoutLayer, CardSetSlide } from "@workspace/db";
import { requireAdmin, resolveAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { migrateSponsorLogos } from "../lib/sponsor-logo-migration";
import { loadActiveSponsors } from "../lib/active-sponsors";
import { getTenantBrand } from "../lib/tenant-brand";
import { getTenantId } from "../middlewares/tenant-context";
import { getOrCreateSettings } from "../lib/settings";
import { ensurePackTemplates } from "../lib/design-packs";
import { invalidateMilestonesCache } from "../lib/milestones-cache";
import { renderCardStill } from "../lib/card-video-renderer";
import {
  DEFAULT_TEMPLATES,
  ensureSettings,
  ensureThemes,
  clearDefaultKinds,
  CARD_SET_MIN_SLIDES,
  CARD_SET_MAX_SLIDES,
} from "../lib/social-cards-helpers";
import {
  GENERATE_GRADES,
  gradeLeaderInput,
  topLeaderRow,
  deriveAutoseedGroups,
  type AutoseedDraft,
} from "../lib/social-cards-generate";
import { upsertGeneratedCardSet } from "../lib/card-set-generate-store";
import { listRoundMatchIds, loadMatchDetailForRequest } from "./matches";
import { loadGradeLeaderboard } from "./grades";

// Re-exported for social-cards-templates.test.ts, which asserts the shipped
// defaults carry no tenant-specific brand string.
export { DEFAULT_TEMPLATES };

const router: IRouter = Router();

router.get("/sponsors", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(sponsorsTable)
    .where(eq(sponsorsTable.tenantId, getTenantId(req)))
    .orderBy(asc(sponsorsTable.displayOrder), asc(sponsorsTable.id));
  res.json(await migrateSponsorLogos(rows, req.log));
});

router.post("/sponsors", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const parsed = CreateSponsorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const isPresenting = parsed.data.isPresenting ?? false;
  const row = await db.transaction(async (tx) => {
    // At most one presenting sponsor per tenant: clear any prior one first so the
    // partial unique index never trips (mirrors the card-themes isDefault flow).
    if (isPresenting) {
      await tx
        .update(sponsorsTable)
        .set({ isPresenting: false })
        .where(eq(sponsorsTable.tenantId, tenantId));
    }
    const [created] = await tx
      .insert(sponsorsTable)
      .values({
        tenantId,
        name: parsed.data.name,
        logoUrl: parsed.data.logoUrl,
        link: parsed.data.link ?? "",
        activeFrom: parsed.data.activeFrom ?? null,
        activeTo: parsed.data.activeTo ?? null,
        cardKinds: parsed.data.cardKinds ?? [],
        isPresenting,
        displayOrder: parsed.data.displayOrder ?? 0,
      })
      .returning();
    return created;
  });
  res.status(201).json(row);
});

router.patch("/sponsors/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = UpdateSponsorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateSponsorBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const scoped = and(eq(sponsorsTable.id, params.data.id), eq(sponsorsTable.tenantId, tenantId));
  const row = await db.transaction(async (tx) => {
    // Promoting this sponsor to presenting clears any other presenting sponsor
    // for the tenant first, keeping at most one (partial unique index guard).
    if (body.data.isPresenting === true) {
      await tx
        .update(sponsorsTable)
        .set({ isPresenting: false })
        .where(eq(sponsorsTable.tenantId, tenantId));
    }
    const [updated] = await tx
      .update(sponsorsTable)
      .set({
        ...body.data,
        activeFrom: body.data.activeFrom === undefined ? undefined : body.data.activeFrom,
        activeTo: body.data.activeTo === undefined ? undefined : body.data.activeTo,
      })
      .where(scoped)
      .returning();
    return updated;
  });
  if (!row) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }
  res.json(row);
});

router.delete("/sponsors/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = DeleteSponsorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(sponsorsTable)
    .where(and(eq(sponsorsTable.id, params.data.id), eq(sponsorsTable.tenantId, getTenantId(req))))
    .returning({ id: sponsorsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }
  res.status(204).end();
});

router.get("/card-themes", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  await ensureThemes(tenantId);
  const rows = await db
    .select()
    .from(cardThemesTable)
    .where(eq(cardThemesTable.tenantId, tenantId))
    .orderBy(asc(cardThemesTable.displayOrder), asc(cardThemesTable.id));
  res.json(rows);
});

router.post("/card-themes", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const parsed = CreateCardThemeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const row = await db.transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx
        .update(cardThemesTable)
        .set({ isDefault: false })
        .where(eq(cardThemesTable.tenantId, tenantId));
    }
    const [created] = await tx
      .insert(cardThemesTable)
      .values({
        tenantId,
        name: parsed.data.name,
        bgDark: parsed.data.bgDark,
        bgPanel: parsed.data.bgPanel,
        accent: parsed.data.accent,
        textLight: parsed.data.textLight,
        displayFont: parsed.data.displayFont ?? null,
        backgroundImageUrl: parsed.data.backgroundImageUrl ?? null,
        logoUrl: parsed.data.logoUrl ?? null,
        isDefault: parsed.data.isDefault ?? false,
        displayOrder: parsed.data.displayOrder ?? 0,
      })
      .returning();
    return created;
  });
  res.status(201).json(row);
});

router.patch("/card-themes/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = UpdateCardThemeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateCardThemeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const scoped = and(eq(cardThemesTable.id, params.data.id), eq(cardThemesTable.tenantId, tenantId));
  const row = await db.transaction(async (tx) => {
    if (body.data.isDefault === true) {
      await tx
        .update(cardThemesTable)
        .set({ isDefault: false })
        .where(eq(cardThemesTable.tenantId, tenantId));
    }
    const [updated] = await tx.update(cardThemesTable).set(body.data).where(scoped).returning();
    if (!updated) return undefined;
    // Never leave zero defaults: if this update unset the last default, promote
    // the first remaining theme (within the same tenant).
    if (body.data.isDefault === false) {
      const remaining = await tx
        .select({ id: cardThemesTable.id })
        .from(cardThemesTable)
        .where(and(eq(cardThemesTable.tenantId, tenantId), eq(cardThemesTable.isDefault, true)));
      if (remaining.length === 0) {
        const [first] = await tx
          .select()
          .from(cardThemesTable)
          .where(eq(cardThemesTable.tenantId, tenantId))
          .orderBy(asc(cardThemesTable.displayOrder), asc(cardThemesTable.id))
          .limit(1);
        if (first) {
          await tx
            .update(cardThemesTable)
            .set({ isDefault: true })
            .where(eq(cardThemesTable.id, first.id));
          if (first.id === updated.id) updated.isDefault = true;
        }
      }
    }
    return updated;
  });
  if (!row) {
    res.status(404).json({ error: "Card theme not found" });
    return;
  }
  res.json(row);
});

router.delete("/card-themes/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = DeleteCardThemeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const result = await db
    .delete(cardThemesTable)
    .where(and(eq(cardThemesTable.id, params.data.id), eq(cardThemesTable.tenantId, tenantId)))
    .returning({ id: cardThemesTable.id, isDefault: cardThemesTable.isDefault });
  if (result.length === 0) {
    res.status(404).json({ error: "Card theme not found" });
    return;
  }
  // If we deleted the default, promote the first remaining theme (within the
  // same tenant) to default.
  if (result[0]?.isDefault) {
    const [first] = await db
      .select()
      .from(cardThemesTable)
      .where(eq(cardThemesTable.tenantId, tenantId))
      .orderBy(asc(cardThemesTable.displayOrder), asc(cardThemesTable.id))
      .limit(1);
    if (first) {
      await db
        .update(cardThemesTable)
        .set({ isDefault: true })
        .where(eq(cardThemesTable.id, first.id));
    }
  }
  res.status(204).end();
});

// --- Card audio tracks (background music for animated clips) ---------------
// A track is OPTIONAL on any clip; no track = silent export. There is no
// "default" track — silence is the default — so this CRUD is a plain ordered
// list with no default-promotion logic (unlike themes).

router.get("/card-audio-tracks", async (req, res): Promise<void> => {
  // The curated built-in library (isCurated) is a shared, platform-wide asset
  // (seeded once, not per-tenant) — every tenant sees it, plus their own
  // uploads. Only a tenant's own uploads are ever editable/deletable by them
  // (see PATCH/DELETE below).
  const rows = await db
    .select()
    .from(cardAudioTracksTable)
    .where(
      or(
        eq(cardAudioTracksTable.tenantId, getTenantId(req)),
        eq(cardAudioTracksTable.isCurated, true),
      ),
    )
    .orderBy(asc(cardAudioTracksTable.displayOrder), asc(cardAudioTracksTable.id));
  res.json(rows);
});

router.post("/card-audio-tracks", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const parsed = CreateCardAudioTrackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(cardAudioTracksTable)
    .values({
      tenantId: getTenantId(req),
      name: parsed.data.name,
      url: parsed.data.url,
      durationMs: parsed.data.durationMs ?? null,
      isCurated: parsed.data.isCurated ?? false,
      displayOrder: parsed.data.displayOrder ?? 0,
    })
    .returning();
  res.status(201).json(created);
});

router.patch("/card-audio-tracks/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = UpdateCardAudioTrackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateCardAudioTrackBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [updated] = await db
    .update(cardAudioTracksTable)
    .set(body.data)
    .where(
      and(
        eq(cardAudioTracksTable.id, params.data.id),
        eq(cardAudioTracksTable.tenantId, getTenantId(req)),
      ),
    )
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Card audio track not found" });
    return;
  }
  res.json(updated);
});

router.delete("/card-audio-tracks/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = DeleteCardAudioTrackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(cardAudioTracksTable)
    .where(
      and(
        eq(cardAudioTracksTable.id, params.data.id),
        eq(cardAudioTracksTable.tenantId, getTenantId(req)),
      ),
    )
    .returning({ id: cardAudioTracksTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Card audio track not found" });
    return;
  }
  res.status(204).end();
});

// --- Custom "bring your own" card templates -------------------------------

router.get("/card-templates", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  try {
    await ensurePackTemplates(tenantId);
  } catch { /* pack provisioning is best-effort; listing proceeds without */ }
  const rows = await db
    .select()
    .from(cardTemplatesTable)
    .where(eq(cardTemplatesTable.tenantId, tenantId))
    .orderBy(asc(cardTemplatesTable.displayOrder), asc(cardTemplatesTable.id));
  res.json(rows);
});

router.post("/card-templates", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const parsed = CreateCardTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const row = await db.transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.update(cardTemplatesTable).set({ isDefault: false }).where(eq(cardTemplatesTable.tenantId, tenantId));
    }
    const defaultForKinds = parsed.data.defaultForKinds ?? [];
    if (defaultForKinds.length > 0) {
      await clearDefaultKinds(tx, tenantId, defaultForKinds);
    }
    const [created] = await tx
      .insert(cardTemplatesTable)
      .values({
        tenantId,
        name: parsed.data.name,
        cardKinds: parsed.data.cardKinds ?? [],
        source: parsed.data.source ?? "background",
        baseKind: parsed.data.baseKind ?? null,
        layers: parsed.data.layers ?? [],
        defaultForKinds,
        backgroundImageUrl: parsed.data.backgroundImageUrl ?? null,
        backgroundKind: parsed.data.backgroundKind ?? "image",
        backgroundDurationMs: parsed.data.backgroundDurationMs ?? null,
        motionPreset: parsed.data.motionPreset ?? "none",
        bgWidth: parsed.data.bgWidth ?? 1080,
        bgHeight: parsed.data.bgHeight ?? 1080,
        slots: parsed.data.slots ?? [],
        isActive: parsed.data.isActive ?? true,
        isDefault: parsed.data.isDefault ?? false,
        displayOrder: parsed.data.displayOrder ?? 0,
      })
      .returning();
    return created;
  });
  res.status(201).json(row);
});

router.patch("/card-templates/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = UpdateCardTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateCardTemplateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const row = await db.transaction(async (tx) => {
    if (body.data.isDefault === true) {
      await tx.update(cardTemplatesTable).set({ isDefault: false }).where(eq(cardTemplatesTable.tenantId, tenantId));
    }
    // Per-asset default: a kind may be the default for at most one template, so
    // claiming a kind here strips it from every OTHER template first.
    if (body.data.defaultForKinds && body.data.defaultForKinds.length > 0) {
      await clearDefaultKinds(tx, tenantId, body.data.defaultForKinds, params.data.id);
    }
    const [updated] = await tx
      .update(cardTemplatesTable)
      .set(body.data)
      .where(and(eq(cardTemplatesTable.id, params.data.id), eq(cardTemplatesTable.tenantId, tenantId)))
      .returning();
    return updated;
  });
  if (!row) {
    res.status(404).json({ error: "Card template not found" });
    return;
  }
  res.json(row);
});

router.delete("/card-templates/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = DeleteCardTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(cardTemplatesTable)
    .where(and(eq(cardTemplatesTable.id, params.data.id), eq(cardTemplatesTable.tenantId, getTenantId(req))))
    .returning({ id: cardTemplatesTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Card template not found" });
    return;
  }
  res.status(204).end();
});

// --- Layer-based card layouts ----------------------------------------------
// Custom layouts for BUILT-IN card kinds. Reading is public (the public card
// renderer needs the saved layout); saving / resetting is admin-only.
router.get("/card-layouts", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(cardLayoutsTable)
    .where(eq(cardLayoutsTable.tenantId, getTenantId(req)))
    .orderBy(asc(cardLayoutsTable.cardKind));
  res.json(rows);
});

router.put("/card-layouts/:cardKind", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = UpsertCardLayoutParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpsertCardLayoutBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const layers = body.data.layers as CardLayoutLayer[];
  const tenantId = getTenantId(req);
  const [row] = await db
    .insert(cardLayoutsTable)
    .values({ tenantId, cardKind: params.data.cardKind, layers, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [cardLayoutsTable.tenantId, cardLayoutsTable.cardKind],
      set: { layers, updatedAt: new Date() },
    })
    .returning();
  res.json(row);
});

router.delete("/card-layouts/:cardKind", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = DeleteCardLayoutParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(cardLayoutsTable)
    .where(
      and(
        eq(cardLayoutsTable.cardKind, params.data.cardKind),
        eq(cardLayoutsTable.tenantId, getTenantId(req)),
      ),
    )
    .returning({ id: cardLayoutsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Card layout not found" });
    return;
  }
  res.status(204).end();
});

// Reusable layer effect presets. Built-in presets ship in the client; these
// rows are admin-saved additions. Reading is public (the editor merges them in);
// saving / deleting is admin-only.
router.get("/card-effect-presets", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(cardEffectPresetsTable)
    .where(eq(cardEffectPresetsTable.tenantId, getTenantId(req)))
    .orderBy(asc(cardEffectPresetsTable.displayOrder), asc(cardEffectPresetsTable.id));
  res.json(rows);
});

router.post("/card-effect-presets", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const parsed = CreateCardEffectPresetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(cardEffectPresetsTable)
    .values({
      tenantId: getTenantId(req),
      name: parsed.data.name,
      effects: parsed.data.effects as Record<string, unknown>,
      displayOrder: parsed.data.displayOrder ?? 0,
    })
    .returning();
  res.status(201).json(row);
});

router.delete("/card-effect-presets/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = DeleteCardEffectPresetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(cardEffectPresetsTable)
    .where(
      and(
        eq(cardEffectPresetsTable.id, params.data.id),
        eq(cardEffectPresetsTable.tenantId, getTenantId(req)),
      ),
    )
    .returning({ id: cardEffectPresetsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Card effect preset not found" });
    return;
  }
  res.status(204).end();
});

// --- Multi-card / carousel sets --------------------------------------------
// Reading is public, but the public only ever sees PUBLISHED sets; admins see
// every set (drafts included) so they can keep editing. Authoring (create /
// update / delete) is admin-only.

router.get("/card-sets", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const admin = await resolveAdmin(req);
  const rows = await db
    .select()
    .from(cardSetsTable)
    .where(
      admin
        ? eq(cardSetsTable.tenantId, tenantId)
        : and(eq(cardSetsTable.tenantId, tenantId), eq(cardSetsTable.isPublished, true)),
    )
    .orderBy(asc(cardSetsTable.name));
  res.json(rows);
});

router.post("/card-sets", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const body = CreateCardSetBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const isPublished = body.data.isPublished ?? false;
  if (
    isPublished &&
    (body.data.slides.length < CARD_SET_MIN_SLIDES ||
      body.data.slides.length > CARD_SET_MAX_SLIDES)
  ) {
    res.status(400).json({
      error: `A published carousel must have between ${CARD_SET_MIN_SLIDES} and ${CARD_SET_MAX_SLIDES} slides`,
    });
    return;
  }
  const [row] = await db
    .insert(cardSetsTable)
    .values({
      tenantId: getTenantId(req),
      name: body.data.name,
      platformSize: body.data.platformSize,
      slides: body.data.slides as unknown as CardSetSlide[],
      isPublished,
      updatedAt: new Date(),
    })
    .returning();
  res.status(201).json(row);
});

// Batch-assemble a carousel from a group of same-kind cards, server-side, and
// UPSERT one set keyed on the grouping columns so regeneration updates the same
// row. Reuses the shared input builders: `matchToSummaryInput` (@workspace/
// scorecard) for match summaries and `gradeLeaderInput` (the server twin of the
// carousel editor's inline builder) for grade leaderboards. New sets are drafts,
// like the other card-set routes.
router.post(
  "/card-sets/generate",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const body = GenerateCardSetBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const { kind, round, season, grades, platformSize } = body.data;

    // Gather the source rows and map each to a ShareCardInput. `group*` are the
    // idempotency key columns (null where a kind doesn't narrow by that column).
    let inputs: Array<Record<string, unknown>> = [];
    let name = "Generated set";
    let groupSeason: number | null = null;
    let groupRound: number | null = null;
    let groupGrade: string | null = null;

    if (kind === "matchSummary") {
      // A match-summary set is one grade's round, so it needs an unambiguous
      // (grade, season, round) — the same trio the carousel editor's "add all in
      // round" action operates on.
      if (round == null || season == null || !grades || grades.length !== 1) {
        res.status(400).json({
          error:
            "matchSummary generation requires round, season and exactly one grade",
        });
        return;
      }
      const grade = grades[0];
      const ids = await listRoundMatchIds(req, { grade, season, round });
      const details = await Promise.all(
        ids.map((id) => loadMatchDetailForRequest(req, id)),
      );
      inputs = details
        .filter((d): d is NonNullable<typeof d> => d != null)
        // `detail as MatchDetail` mirrors match-summary-drafter.ts — the loaded
        // DTO is the exact shape the /matches/:id route serializes as MatchDetail.
        .map((d) => matchToSummaryInput(d as MatchDetail) as Record<string, unknown>);
      groupSeason = season;
      groupRound = round;
      groupGrade = grade;
      name = `${grade} • Round ${round}`;
    } else {
      // gradeLeader: one top-player card per grade (all grades unless the request
      // names a subset). Category isn't in the body contract — default to Runs,
      // matching the editor's default. Grouping columns stay null (spans grades).
      const gradeList = grades && grades.length ? grades : [...GENERATE_GRADES];
      const boards = await Promise.all(
        gradeList.map((g) => loadGradeLeaderboard(req, g)),
      );
      gradeList.forEach((g, i) => {
        const top = topLeaderRow(boards[i] ?? [], "Runs");
        if (top) inputs.push(gradeLeaderInput(top, g, "Runs"));
      });
      name = "Grade leaderboards";
    }

    if (inputs.length === 0) {
      res.status(400).json({ error: "No source cards found for this selection" });
      return;
    }

    // Delegate assembly + idempotent grouping-key upsert to the shared core
    // (also used by /card-sets/autoseed) so there's ONE implementation.
    const { row, truncated } = await upsertGeneratedCardSet(
      tenantId,
      { sourceKind: kind, season: groupSeason, sourceRound: groupRound, grade: groupGrade },
      { name, platformSize, inputs },
    );
    if (truncated > 0) {
      req.log.warn(
        { kind, gathered: inputs.length, kept: row.slides.length, truncated },
        "card-set generate: clamped to max slides",
      );
    }

    res.json(row);
  },
);

// Auto-seed (C4): turn a round's APPROVED match-summary social drafts into one
// carousel per (season, round, grade), reusing the C3 generate core
// (`upsertGeneratedCardSet`) — same assembly + grouping-key idempotency, so
// re-running a round UPDATES the same set rather than double-posting. Gated by
// the dormant `autoseedCarousels` toggle (default off).
//
// Juniors isolation is enforced on TWO axes: (1) input gathering filters drafts
// by the `junior` flag, so a carousel's slides are all-junior or all-senior; and
// (2) junior sets persist under a distinct `sourceKind` ("matchSummaryJunior"),
// giving them a separate dedupe keyspace so a junior set can never overwrite a
// senior set (or vice-versa) that happens to share the same season/round/grade
// string. Isolation therefore holds at row identity, not just grade-string luck.
router.post(
  "/card-sets/autoseed",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const body = AutoseedCardSetBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const settings = await ensureSettings(tenantId);
    // Dormant unless the tenant has opted in — the endpoint is a no-op (not an
    // error) so an auto-invoking hook stays harmless while disabled.
    if (!settings.autoseedCarousels) {
      res.json({ generated: [], skipped: "disabled" });
      return;
    }

    const { round, season, grade, junior, platformSize } = body.data;

    // Gather this tenant's APPROVED match-summary drafts for the requested
    // junior-ness only (scoping by the flag keeps the two worlds apart).
    const drafts = await db
      .select()
      .from(socialDraftsTable)
      .where(
        and(
          eq(socialDraftsTable.tenantId, tenantId),
          eq(socialDraftsTable.sourceKind, "matchSummary"),
          eq(socialDraftsTable.status, "approved"),
          eq(socialDraftsTable.sourceMatchIsJunior, junior),
        ),
      );
    if (drafts.length === 0) {
      res.json({ generated: [], skipped: "no-approved-drafts" });
      return;
    }

    // Look up each draft's match to recover (season, round, grade) — drafts only
    // store the match id. Senior matches carry a numeric round; junior rounds are
    // free text, so parse (and skip unparseable ones).
    const matchIds = Array.from(
      new Set(drafts.map((d) => d.sourceMatchId).filter((id): id is number => id != null)),
    );
    const meta = new Map<number, { season: number; round: number; grade: string }>();
    if (matchIds.length > 0) {
      if (junior) {
        const rows = await db
          .select({
            id: juniorMatchesTable.id,
            season: juniorMatchesTable.seasonStartYear,
            round: juniorMatchesTable.round,
            ageGroup: juniorMatchesTable.ageGroup,
            grade: juniorMatchesTable.grade,
          })
          .from(juniorMatchesTable)
          .where(
            and(
              eq(juniorMatchesTable.tenantId, tenantId),
              inArray(juniorMatchesTable.id, matchIds),
            ),
          );
        for (const r of rows) {
          const rnd = r.round == null ? NaN : parseInt(r.round, 10);
          const g = r.ageGroup ?? r.grade;
          if (r.season == null || Number.isNaN(rnd) || g == null) continue;
          meta.set(r.id, { season: r.season, round: rnd, grade: g });
        }
      } else {
        const rows = await db
          .select({
            id: matchesTable.id,
            season: matchesTable.season,
            round: matchesTable.round,
            grade: matchesTable.grade,
          })
          .from(matchesTable)
          .where(inArray(matchesTable.id, matchIds));
        for (const r of rows) {
          if (r.round == null) continue; // finals (stage-only) have no round
          meta.set(r.id, { season: r.season, round: r.round, grade: r.grade });
        }
      }
    }

    // Annotate + filter to the requested scope; grade is optional (omitted =
    // seed every grade present in that round, one carousel each).
    const forGrouping: AutoseedDraft[] = [];
    for (const d of drafts) {
      if (d.sourceMatchId == null) continue;
      const m = meta.get(d.sourceMatchId);
      if (!m) continue;
      if (m.season !== season || m.round !== round) continue;
      if (grade != null && m.grade !== grade) continue;
      forGrouping.push({
        id: d.id,
        sourceMatchId: d.sourceMatchId,
        junior,
        season: m.season,
        round: m.round,
        grade: m.grade,
        input: d.cardInput as Record<string, unknown>,
      });
    }
    if (forGrouping.length === 0) {
      res.json({ generated: [], skipped: "no-drafts-in-scope" });
      return;
    }

    // One carousel per (junior, season, round, grade). Each group upserts through
    // the SAME core as /card-sets/generate.
    const groups = deriveAutoseedGroups(forGrouping);
    const generated = [];
    for (const g of groups) {
      // Junior sets persist under a DISTINCT sourceKind so junior and senior
      // sets occupy separate dedupe keyspaces in `card_sets_source_dedupe`.
      // Without this a junior autoseed and a senior /card-sets/generate sharing
      // the same (season, round, grade-string) would collide on one row and
      // clobber each other — the juniors-isolation invariant must hold at the
      // STORAGE layer (row identity), not just at in-memory gathering. Re-runs
      // derive the same sourceKind from the same junior flag, so regeneration
      // still finds + updates the correct junior row.
      const setSourceKind = g.junior ? "matchSummaryJunior" : "matchSummary";
      const { row, truncated } = await upsertGeneratedCardSet(
        tenantId,
        { sourceKind: setSourceKind, season: g.season, sourceRound: g.round, grade: g.grade },
        {
          name: `${g.grade} • Round ${g.round}`,
          platformSize,
          inputs: g.inputs,
        },
      );
      if (truncated > 0) {
        req.log.warn(
          { grade: g.grade, round: g.round, gathered: g.inputs.length, truncated },
          "card-set autoseed: clamped to max slides",
        );
      }
      generated.push(row);
    }

    res.json({ generated });
  },
);

router.put("/card-sets/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = UpdateCardSetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateCardSetBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const isPublished = body.data.isPublished ?? false;
  if (
    isPublished &&
    (body.data.slides.length < CARD_SET_MIN_SLIDES ||
      body.data.slides.length > CARD_SET_MAX_SLIDES)
  ) {
    res.status(400).json({
      error: `A published carousel must have between ${CARD_SET_MIN_SLIDES} and ${CARD_SET_MAX_SLIDES} slides`,
    });
    return;
  }
  const [row] = await db
    .update(cardSetsTable)
    .set({
      name: body.data.name,
      platformSize: body.data.platformSize,
      slides: body.data.slides as unknown as CardSetSlide[],
      isPublished,
      updatedAt: new Date(),
    })
    .where(and(eq(cardSetsTable.id, params.data.id), eq(cardSetsTable.tenantId, getTenantId(req))))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Card set not found" });
    return;
  }
  res.json(row);
});

router.delete("/card-sets/:id", requireAdmin, requireEntitlement("socialStudio"), async (req, res): Promise<void> => {
  const params = DeleteCardSetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(cardSetsTable)
    .where(and(eq(cardSetsTable.id, params.data.id), eq(cardSetsTable.tenantId, getTenantId(req))))
    .returning({ id: cardSetsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Card set not found" });
    return;
  }
  res.status(204).end();
});

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
    activeSponsors: await loadActiveSponsors(req.log),
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
