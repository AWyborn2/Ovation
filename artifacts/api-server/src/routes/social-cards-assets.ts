import { Router, type IRouter } from "express";
import { and, asc, eq, or } from "drizzle-orm";
import {
  db,
  sponsorsTable,
  cardThemesTable,
  cardAudioTracksTable,
} from "@workspace/db";
import {
  CreateSponsorBody,
  UpdateSponsorBody,
  UpdateSponsorParams,
  DeleteSponsorParams,
  CreateCardThemeBody,
  UpdateCardThemeBody,
  UpdateCardThemeParams,
  DeleteCardThemeParams,
  CreateCardAudioTrackBody,
  UpdateCardAudioTrackBody,
  UpdateCardAudioTrackParams,
  DeleteCardAudioTrackParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { migrateSponsorLogos } from "../lib/sponsor-logo-migration";
import { getTenantId } from "../middlewares/tenant-context";

import { ensureThemes } from "../lib/social-cards-helpers";

/**
 * Social studio — brand assets: sponsors, card colour themes and audio tracks.
 * Reading is public (the public card renderer needs them); authoring is
 * admin-only and gated on the socialStudio entitlement. Mounted by
 * routes/social-cards.ts.
 */
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

export default router;
