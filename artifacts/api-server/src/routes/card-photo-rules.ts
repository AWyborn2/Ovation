import { Router, type IRouter } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, cardPhotoRulesTable, clubPhotosTable, type CardPhotoRuleRow } from "@workspace/db";
import { SaveCardPhotoRulesBody } from "@workspace/api-zod";
import { isJuniorGradeLabel, isPhotoType } from "@workspace/scorecard";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { repickRuleDraftPhotos } from "../lib/draft-enrich";
import { objectUrl } from "../lib/photo-store";

/**
 * `/card-photo-rules` — how a draft's photo is picked per grade and card type
 * (Social Studio). Admin-only and tenant-scoped: a rule, and any fixed photo it
 * names, always belong to the requesting club. Saving or removing a rule
 * re-picks the club's open drafts of that grade and card type whose photo was
 * picked automatically.
 */
const router: IRouter = Router();

async function presentRules(tenantId: number, rows: CardPhotoRuleRow[]) {
  const photoIds = [...new Set(rows.flatMap((r) => (r.photoId != null ? [r.photoId] : [])))];
  const photos = photoIds.length
    ? await db
        .select({ id: clubPhotosTable.id, thumbPath: clubPhotosTable.thumbPath })
        .from(clubPhotosTable)
        .where(and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.id, photoIds)))
    : [];
  const thumbById = new Map(photos.map((p) => [p.id, objectUrl(p.thumbPath)]));
  return rows.map((r) => ({
    id: r.id,
    grade: r.grade,
    cardKind: r.cardKind,
    mode: r.mode,
    photoId: r.photoId,
    photoThumbUrl: r.photoId != null ? (thumbById.get(r.photoId) ?? null) : null,
    photoType: isPhotoType(r.photoType) ? r.photoType : null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

router.get("/card-photo-rules", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const rows = await db
    .select()
    .from(cardPhotoRulesTable)
    .where(eq(cardPhotoRulesTable.tenantId, tenantId))
    .orderBy(asc(cardPhotoRulesTable.grade), asc(cardPhotoRulesTable.cardKind));
  res.json(await presentRules(tenantId, rows));
});

router.put("/card-photo-rules", requireAdmin, async (req, res): Promise<void> => {
  const parsed = SaveCardPhotoRulesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const grade = parsed.data.grade.trim();
  const kinds = [...new Set(parsed.data.cardKinds.map((k) => k.trim()).filter(Boolean))];
  const { mode } = parsed.data;
  if (!grade || kinds.length === 0) {
    res.status(400).json({ error: "A grade and at least one card type are required." });
    return;
  }
  if (isJuniorGradeLabel(grade)) {
    res.status(422).json({ error: "Junior cards never get a photo." });
    return;
  }

  let photoId: number | null = null;
  if (mode === "fixed") {
    if (parsed.data.photoId == null) {
      res.status(400).json({ error: "Choose a photo for a fixed rule." });
      return;
    }
    const [photo] = await db
      .select({ id: clubPhotosTable.id, grade: clubPhotosTable.grade })
      .from(clubPhotosTable)
      .where(
        and(eq(clubPhotosTable.id, parsed.data.photoId), eq(clubPhotosTable.tenantId, tenantId)),
      );
    if (!photo) {
      res.status(404).json({ error: "photo not found" });
      return;
    }
    if (isJuniorGradeLabel(photo.grade)) {
      res.status(422).json({ error: "A junior photo can't be used on a card." });
      return;
    }
    photoId = photo.id;
  }

  // A type narrows a random pool (and a player rule's fallback); a fixed rule
  // has one photo, so it has no type.
  const photoType = mode === "fixed" ? null : (parsed.data.photoType ?? null);

  const now = new Date();
  const rows = await db
    .insert(cardPhotoRulesTable)
    .values(kinds.map((cardKind) => ({ tenantId, grade, cardKind, mode, photoId, photoType })))
    .onConflictDoUpdate({
      target: [
        cardPhotoRulesTable.tenantId,
        cardPhotoRulesTable.grade,
        cardPhotoRulesTable.cardKind,
      ],
      set: { mode, photoId, photoType, updatedAt: now },
    })
    .returning();
  await repickRuleDraftPhotos(tenantId, grade, kinds);
  res.json(await presentRules(tenantId, rows));
});

router.delete("/card-photo-rules/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = Number.parseInt(String(req.params.id), 10);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const tenantId = getTenantId(req);
  const [deleted] = await db
    .delete(cardPhotoRulesTable)
    .where(and(eq(cardPhotoRulesTable.id, id), eq(cardPhotoRulesTable.tenantId, tenantId)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  await repickRuleDraftPhotos(tenantId, deleted.grade, [deleted.cardKind]);
  res.status(204).end();
});

export default router;
