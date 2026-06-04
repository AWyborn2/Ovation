import { Router, type IRouter } from "express";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import {
  db,
  sponsorsTable,
  socialSettingsTable,
  milestoneBoardSettingsTable,
  captionTemplatesTable,
  cardThemesTable,
  cardTemplatesTable,
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
  CreateCardTemplateBody,
  UpdateCardTemplateBody,
  UpdateCardTemplateParams,
  DeleteCardTemplateParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { migrateSponsorLogos } from "../lib/sponsor-logo-migration";

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

// --- Custom "bring your own" card templates -------------------------------

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
    const [created] = await tx
      .insert(cardTemplatesTable)
      .values({
        name: parsed.data.name,
        cardKinds: parsed.data.cardKinds ?? [],
        backgroundImageUrl: parsed.data.backgroundImageUrl,
        backgroundKind: parsed.data.backgroundKind ?? "image",
        backgroundDurationMs: parsed.data.backgroundDurationMs ?? null,
        motionPreset: parsed.data.motionPreset ?? "none",
        bgWidth: parsed.data.bgWidth,
        bgHeight: parsed.data.bgHeight,
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
