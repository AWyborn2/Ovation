import { Router, type IRouter } from "express";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
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
} from "@workspace/api-zod";
import type { CardLayoutLayer, CardSetSlide } from "@workspace/db";
import { requireAdmin, resolveAdmin } from "../middlewares/require-admin";
import { migrateSponsorLogos } from "../lib/sponsor-logo-migration";
import { getHallsHeadBrand } from "../lib/halls-head-brand";

const router: IRouter = Router();

const SETTINGS_ID = 1;

const DEFAULT_TEMPLATES: { engine: string; platform: string; template: string }[] = [
  {
    engine: "ondemand",
    platform: "instagram",
    template:
      "{player.name} — {stat.label}: {stat.value} 🏏\n\nHonour board form for the Hammers. {app.link}\n\n{hashtag} #ClubCricket",
  },
  {
    engine: "ondemand",
    platform: "facebook",
    template:
      "{player.name} now sits on {stat.value} {stat.label}. Follow the full season at {app.link}\n\n{hashtag}",
  },
  {
    engine: "ondemand",
    platform: "twitter",
    template: "{player.name} • {stat.value} {stat.label} {app.link} {hashtag}",
  },
  {
    engine: "milestone",
    platform: "instagram",
    template:
      "🏆 MILESTONE — {player.name}\n{stat.tier}: {stat.value} {stat.label}\n\nCongratulations from everyone at the club. {app.link}\n\n{hashtag}",
  },
  {
    engine: "milestone",
    platform: "facebook",
    template:
      "Milestone alert: {player.name} has joined the {stat.tier} for {stat.label} with {stat.value}. {app.link} {hashtag}",
  },
  {
    engine: "milestone",
    platform: "twitter",
    template:
      "🏆 {player.name} • {stat.tier} • {stat.value} {stat.label} {app.link} {hashtag}",
  },
  {
    engine: "roundup",
    platform: "instagram",
    template:
      "Round-up — top performers this weekend 👇\n\n{app.link}\n\n{hashtag} #ClubCricket",
  },
  {
    engine: "roundup",
    platform: "facebook",
    template: "This weekend's top performers across the grades. {app.link} {hashtag}",
  },
  {
    engine: "roundup",
    platform: "twitter",
    template: "Round-up: top performers. {app.link} {hashtag}",
  },
  {
    engine: "recap",
    platform: "instagram",
    template:
      "Season recap — {grade.name} 📋\n\nLeading the way for the Hammers this season. {app.link}\n\n{hashtag}",
  },
  {
    engine: "recap",
    platform: "facebook",
    template: "Season recap: {grade.name} — the players who led the way. {app.link} {hashtag}",
  },
  {
    engine: "recap",
    platform: "twitter",
    template: "Season recap: {grade.name}. {app.link} {hashtag}",
  },
];

async function ensureSettings() {
  const [existing] = await db
    .select()
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.id, SETTINGS_ID));
  if (existing) return existing;
  const [created] = await db
    .insert(socialSettingsTable)
    .values({ id: SETTINGS_ID })
    .returning();
  // Seed default caption templates if missing.
  for (const t of DEFAULT_TEMPLATES) {
    await db
      .insert(captionTemplatesTable)
      .values(t)
      .onConflictDoNothing({
        target: [captionTemplatesTable.engine, captionTemplatesTable.platform],
      });
  }
  return created;
}

router.get("/sponsors", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(sponsorsTable)
    .orderBy(asc(sponsorsTable.displayOrder), asc(sponsorsTable.id));
  res.json(await migrateSponsorLogos(rows, req.log));
});

router.post("/sponsors", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateSponsorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(sponsorsTable)
    .values({
      name: parsed.data.name,
      logoUrl: parsed.data.logoUrl,
      link: parsed.data.link ?? "",
      activeFrom: parsed.data.activeFrom ?? null,
      activeTo: parsed.data.activeTo ?? null,
      cardKinds: parsed.data.cardKinds ?? [],
      displayOrder: parsed.data.displayOrder ?? 0,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/sponsors/:id", requireAdmin, async (req, res): Promise<void> => {
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
  const [row] = await db
    .update(sponsorsTable)
    .set({
      ...body.data,
      activeFrom: body.data.activeFrom === undefined ? undefined : body.data.activeFrom,
      activeTo: body.data.activeTo === undefined ? undefined : body.data.activeTo,
    })
    .where(eq(sponsorsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }
  res.json(row);
});

router.delete("/sponsors/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteSponsorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(sponsorsTable)
    .where(eq(sponsorsTable.id, params.data.id))
    .returning({ id: sponsorsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Sponsor not found" });
    return;
  }
  res.status(204).end();
});

async function ensureThemes() {
  const [existing] = await db.select().from(cardThemesTable).limit(1);
  if (existing) return;
  await db.insert(cardThemesTable).values({
    name: "Club Classic",
    bgDark: "#322F3D",
    bgPanel: "#3F3C4C",
    accent: "#FBD039",
    textLight: "#F5F2E8",
    isDefault: true,
    displayOrder: 0,
  });
}

router.get("/card-themes", async (_req, res): Promise<void> => {
  await ensureThemes();
  const rows = await db
    .select()
    .from(cardThemesTable)
    .orderBy(asc(cardThemesTable.displayOrder), asc(cardThemesTable.id));
  res.json(rows);
});

router.post("/card-themes", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCardThemeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const row = await db.transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.update(cardThemesTable).set({ isDefault: false });
    }
    const [created] = await tx
      .insert(cardThemesTable)
      .values({
        name: parsed.data.name,
        bgDark: parsed.data.bgDark,
        bgPanel: parsed.data.bgPanel,
        accent: parsed.data.accent,
        textLight: parsed.data.textLight,
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

router.patch("/card-themes/:id", requireAdmin, async (req, res): Promise<void> => {
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
  const row = await db.transaction(async (tx) => {
    if (body.data.isDefault === true) {
      await tx.update(cardThemesTable).set({ isDefault: false });
    }
    const [updated] = await tx
      .update(cardThemesTable)
      .set(body.data)
      .where(eq(cardThemesTable.id, params.data.id))
      .returning();
    if (!updated) return undefined;
    // Never leave zero defaults: if this update unset the last default, promote
    // the first remaining theme.
    if (body.data.isDefault === false) {
      const remaining = await tx
        .select({ id: cardThemesTable.id })
        .from(cardThemesTable)
        .where(eq(cardThemesTable.isDefault, true));
      if (remaining.length === 0) {
        const [first] = await tx
          .select()
          .from(cardThemesTable)
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

router.delete("/card-themes/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteCardThemeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(cardThemesTable)
    .where(eq(cardThemesTable.id, params.data.id))
    .returning({ id: cardThemesTable.id, isDefault: cardThemesTable.isDefault });
  if (result.length === 0) {
    res.status(404).json({ error: "Card theme not found" });
    return;
  }
  // If we deleted the default, promote the first remaining theme to default.
  if (result[0]?.isDefault) {
    const [first] = await db
      .select()
      .from(cardThemesTable)
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

router.get("/card-audio-tracks", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(cardAudioTracksTable)
    .orderBy(asc(cardAudioTracksTable.displayOrder), asc(cardAudioTracksTable.id));
  res.json(rows);
});

router.post("/card-audio-tracks", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCardAudioTrackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(cardAudioTracksTable)
    .values({
      name: parsed.data.name,
      url: parsed.data.url,
      durationMs: parsed.data.durationMs ?? null,
      isCurated: parsed.data.isCurated ?? false,
      displayOrder: parsed.data.displayOrder ?? 0,
    })
    .returning();
  res.status(201).json(created);
});

router.patch("/card-audio-tracks/:id", requireAdmin, async (req, res): Promise<void> => {
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
    .where(eq(cardAudioTracksTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Card audio track not found" });
    return;
  }
  res.json(updated);
});

router.delete("/card-audio-tracks/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteCardAudioTrackParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(cardAudioTracksTable)
    .where(eq(cardAudioTracksTable.id, params.data.id))
    .returning({ id: cardAudioTracksTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Card audio track not found" });
    return;
  }
  res.status(204).end();
});

// --- Custom "bring your own" card templates -------------------------------

// A card kind may be the default for at most one template. Before a template
// claims a set of kinds as its defaults, strip those kinds from every other
// template's `default_for_kinds` array. `exceptId` skips the template being
// written so it can keep kinds it already owns.
const clearDefaultKinds = async (
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  kinds: string[],
  exceptId?: number,
): Promise<void> => {
  await tx
    .update(cardTemplatesTable)
    .set({
      defaultForKinds: sql`COALESCE((
        SELECT array_agg(k)
        FROM unnest(${cardTemplatesTable.defaultForKinds}) AS k
        WHERE k <> ALL(${kinds}::text[])
      ), '{}')`,
    })
    .where(
      and(
        sql`${cardTemplatesTable.defaultForKinds} && ${kinds}::text[]`,
        exceptId !== undefined ? sql`${cardTemplatesTable.id} <> ${exceptId}` : undefined,
      ),
    );
};

router.get("/card-templates", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(cardTemplatesTable)
    .orderBy(asc(cardTemplatesTable.displayOrder), asc(cardTemplatesTable.id));
  res.json(rows);
});

router.post("/card-templates", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCardTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const row = await db.transaction(async (tx) => {
    if (parsed.data.isDefault) {
      await tx.update(cardTemplatesTable).set({ isDefault: false });
    }
    const defaultForKinds = parsed.data.defaultForKinds ?? [];
    if (defaultForKinds.length > 0) {
      await clearDefaultKinds(tx, defaultForKinds);
    }
    const [created] = await tx
      .insert(cardTemplatesTable)
      .values({
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

router.patch("/card-templates/:id", requireAdmin, async (req, res): Promise<void> => {
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
  const row = await db.transaction(async (tx) => {
    if (body.data.isDefault === true) {
      await tx.update(cardTemplatesTable).set({ isDefault: false });
    }
    // Per-asset default: a kind may be the default for at most one template, so
    // claiming a kind here strips it from every OTHER template first.
    if (body.data.defaultForKinds && body.data.defaultForKinds.length > 0) {
      await clearDefaultKinds(tx, body.data.defaultForKinds, params.data.id);
    }
    const [updated] = await tx
      .update(cardTemplatesTable)
      .set(body.data)
      .where(eq(cardTemplatesTable.id, params.data.id))
      .returning();
    return updated;
  });
  if (!row) {
    res.status(404).json({ error: "Card template not found" });
    return;
  }
  res.json(row);
});

router.delete("/card-templates/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteCardTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(cardTemplatesTable)
    .where(eq(cardTemplatesTable.id, params.data.id))
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
router.get("/card-layouts", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(cardLayoutsTable)
    .orderBy(asc(cardLayoutsTable.cardKind));
  res.json(rows);
});

router.put("/card-layouts/:cardKind", requireAdmin, async (req, res): Promise<void> => {
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
  const [row] = await db
    .insert(cardLayoutsTable)
    .values({ cardKind: params.data.cardKind, layers, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: cardLayoutsTable.cardKind,
      set: { layers, updatedAt: new Date() },
    })
    .returning();
  res.json(row);
});

router.delete("/card-layouts/:cardKind", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteCardLayoutParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(cardLayoutsTable)
    .where(eq(cardLayoutsTable.cardKind, params.data.cardKind))
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
router.get("/card-effect-presets", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(cardEffectPresetsTable)
    .orderBy(asc(cardEffectPresetsTable.displayOrder), asc(cardEffectPresetsTable.id));
  res.json(rows);
});

router.post("/card-effect-presets", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateCardEffectPresetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(cardEffectPresetsTable)
    .values({
      name: parsed.data.name,
      effects: parsed.data.effects as Record<string, unknown>,
      displayOrder: parsed.data.displayOrder ?? 0,
    })
    .returning();
  res.status(201).json(row);
});

router.delete("/card-effect-presets/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteCardEffectPresetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(cardEffectPresetsTable)
    .where(eq(cardEffectPresetsTable.id, params.data.id))
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

// A publishable / exportable carousel must hold between 2 and 10 slides. The
// upper bound is also enforced by the generated zod body (maxItems: 10); this
// guards the 2-slide floor, which only applies once a set is published.
const CARD_SET_MIN_SLIDES = 2;
const CARD_SET_MAX_SLIDES = 10;

router.get("/card-sets", async (req, res): Promise<void> => {
  const admin = await resolveAdmin(req);
  const rows = await db
    .select()
    .from(cardSetsTable)
    .where(admin ? undefined : eq(cardSetsTable.isPublished, true))
    .orderBy(asc(cardSetsTable.name));
  res.json(rows);
});

router.post("/card-sets", requireAdmin, async (req, res): Promise<void> => {
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
      name: body.data.name,
      platformSize: body.data.platformSize,
      slides: body.data.slides as unknown as CardSetSlide[],
      isPublished,
      updatedAt: new Date(),
    })
    .returning();
  res.status(201).json(row);
});

router.put("/card-sets/:id", requireAdmin, async (req, res): Promise<void> => {
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
    .where(eq(cardSetsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Card set not found" });
    return;
  }
  res.json(row);
});

router.delete("/card-sets/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteCardSetParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await db
    .delete(cardSetsTable)
    .where(eq(cardSetsTable.id, params.data.id))
    .returning({ id: cardSetsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "Card set not found" });
    return;
  }
  res.status(204).end();
});

router.get("/social-settings", async (req, res): Promise<void> => {
  const settings = await ensureSettings();
  const captionTemplates = await db.select().from(captionTemplatesTable);
  const today = new Date().toISOString().slice(0, 10);
  const activeSponsors = await db
    .select()
    .from(sponsorsTable)
    .where(
      and(
        or(isNull(sponsorsTable.activeFrom), sql`${sponsorsTable.activeFrom} <= ${today}`),
        or(isNull(sponsorsTable.activeTo), sql`${sponsorsTable.activeTo} >= ${today}`),
      ),
    )
    .orderBy(asc(sponsorsTable.displayOrder), asc(sponsorsTable.id));
  res.json({
    settings,
    captionTemplates: captionTemplates.map((t) => ({
      engine: t.engine,
      platform: t.platform,
      template: t.template,
    })),
    activeSponsors: await migrateSponsorLogos(activeSponsors, req.log),
    brand: await getHallsHeadBrand(),
  });
});

router.patch("/social-settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateSocialSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureSettings();
  const [row] = await db
    .update(socialSettingsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(socialSettingsTable.id, SETTINGS_ID))
    .returning();
  res.json(row);
});

async function ensureMilestoneBoardSettings() {
  const [existing] = await db
    .select()
    .from(milestoneBoardSettingsTable)
    .where(eq(milestoneBoardSettingsTable.id, SETTINGS_ID));
  if (existing) return existing;
  const [created] = await db
    .insert(milestoneBoardSettingsTable)
    .values({ id: SETTINGS_ID })
    .returning();
  return created;
}

router.get("/milestone-board-settings", async (_req, res): Promise<void> => {
  const settings = await ensureMilestoneBoardSettings();
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

router.patch("/milestone-board-settings", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateMilestoneBoardSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureMilestoneBoardSettings();
  const [row] = await db
    .update(milestoneBoardSettingsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(milestoneBoardSettingsTable.id, SETTINGS_ID))
    .returning();
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

router.put("/caption-templates", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpsertCaptionTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { engine, platform, template } = parsed.data;
  await db
    .insert(captionTemplatesTable)
    .values({ engine, platform, template })
    .onConflictDoUpdate({
      target: [captionTemplatesTable.engine, captionTemplatesTable.platform],
      set: { template, updatedAt: new Date() },
    });
  res.json({ engine, platform, template });
});

export default router;
