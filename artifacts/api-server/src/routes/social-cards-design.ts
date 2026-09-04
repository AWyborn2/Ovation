import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db, cardTemplatesTable, cardLayoutsTable, cardEffectPresetsTable } from "@workspace/db";
import {
  CreateCardTemplateBody,
  UpdateCardTemplateBody,
  UpdateCardTemplateParams,
  DeleteCardTemplateParams,
  UpsertCardLayoutBody,
  UpsertCardLayoutParams,
  DeleteCardLayoutParams,
  CreateCardEffectPresetBody,
  DeleteCardEffectPresetParams,
} from "@workspace/api-zod";
import type { CardLayoutLayer } from "@workspace/db";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";

import { ensurePackTemplates } from "../lib/design-packs";
import { clearDefaultKinds } from "../lib/social-cards-helpers";

/**
 * Social studio — card design surface: custom "bring your own" templates,
 * layer-based layouts for the built-in card kinds, and reusable layer effect
 * presets. Reading is public; authoring is admin-only and gated on the
 * socialStudio entitlement. Mounted by routes/social-cards.ts.
 */
const router: IRouter = Router();

// --- Custom "bring your own" card templates -------------------------------

router.get("/card-templates", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  try {
    await ensurePackTemplates(tenantId);
  } catch (err) {
    // Provisioning is best-effort — listing proceeds without it. But it must
    // not be SILENT: the reconciling upsert names a partial-index arbiter, so a
    // schema that predates `card_templates_pack_unique` raises 42P10 here, and
    // an unlogged throw is indistinguishable from the stale-row bug the upsert
    // exists to fix. `ensuredTenants` is only marked after a successful write,
    // so a failure retries on the next request rather than sticking.
    req.log.error({ err }, "pack template provisioning failed");
  }
  const rows = await db
    .select()
    .from(cardTemplatesTable)
    .where(eq(cardTemplatesTable.tenantId, tenantId))
    .orderBy(asc(cardTemplatesTable.displayOrder), asc(cardTemplatesTable.id));
  res.json(rows);
});

router.post(
  "/card-templates",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = CreateCardTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const row = await db.transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx
          .update(cardTemplatesTable)
          .set({ isDefault: false })
          .where(eq(cardTemplatesTable.tenantId, tenantId));
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
  },
);

router.patch(
  "/card-templates/:id",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
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
        await tx
          .update(cardTemplatesTable)
          .set({ isDefault: false })
          .where(eq(cardTemplatesTable.tenantId, tenantId));
      }
      // Per-asset default: a kind may be the default for at most one template, so
      // claiming a kind here strips it from every OTHER template first.
      if (body.data.defaultForKinds && body.data.defaultForKinds.length > 0) {
        await clearDefaultKinds(tx, tenantId, body.data.defaultForKinds, params.data.id);
      }
      const [updated] = await tx
        .update(cardTemplatesTable)
        .set(body.data)
        .where(
          and(eq(cardTemplatesTable.id, params.data.id), eq(cardTemplatesTable.tenantId, tenantId)),
        )
        .returning();
      return updated;
    });
    if (!row) {
      res.status(404).json({ error: "Card template not found" });
      return;
    }
    res.json(row);
  },
);

router.delete(
  "/card-templates/:id",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const params = DeleteCardTemplateParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const result = await db
      .delete(cardTemplatesTable)
      .where(
        and(
          eq(cardTemplatesTable.id, params.data.id),
          eq(cardTemplatesTable.tenantId, getTenantId(req)),
        ),
      )
      .returning({ id: cardTemplatesTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "Card template not found" });
      return;
    }
    res.status(204).end();
  },
);

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

router.put(
  "/card-layouts/:cardKind",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
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
  },
);

router.delete(
  "/card-layouts/:cardKind",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
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
  },
);

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

router.post(
  "/card-effect-presets",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
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
  },
);

router.delete(
  "/card-effect-presets/:id",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
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
  },
);

export default router;
