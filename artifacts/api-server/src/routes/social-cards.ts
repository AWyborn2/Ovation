import { Router, type IRouter } from "express";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import {
  db,
  sponsorsTable,
  socialSettingsTable,
  captionTemplatesTable,
} from "@workspace/db";
import {
  CreateSponsorBody,
  UpdateSponsorBody,
  UpdateSponsorParams,
  DeleteSponsorParams,
  UpdateSocialSettingsBody,
  UpsertCaptionTemplateBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

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

router.get("/sponsors", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(sponsorsTable)
    .orderBy(asc(sponsorsTable.displayOrder), asc(sponsorsTable.id));
  res.json(rows);
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
      logoDataUrl: parsed.data.logoDataUrl,
      link: parsed.data.link ?? "",
      activeFrom: parsed.data.activeFrom ?? null,
      activeTo: parsed.data.activeTo ?? null,
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

router.get("/social-settings", async (_req, res): Promise<void> => {
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
    activeSponsors,
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
