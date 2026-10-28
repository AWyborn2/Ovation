import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, inArray, max, sql } from "drizzle-orm";
import {
  db,
  clubPhotoCollectionPhotosTable,
  clubPhotoCollectionsTable,
  clubPhotosTable,
  fixturesTable,
  teamListsTable,
  type ClubPhotoCollectionRow,
} from "@workspace/db";
import {
  AddClubPhotoCollectionPhotosBody,
  CreateClubPhotoCollectionBody,
  PreviewLayerPhotosBody,
  RemoveClubPhotoCollectionPhotosBody,
  RenameClubPhotoCollectionBody,
} from "@workspace/api-zod";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { objectUrl } from "../lib/photo-store";
import { refreshCollectionLayerPhotos, resolveLayerPhotos } from "../lib/layer-photos";

/**
 * `/club-photo-collections` — the club's photo collections (photo layer
 * sources): named sets of library photos an admin makes, which a template's
 * photo layer can take a random photo from. A photo can be in any number of
 * collections; deleting a collection keeps its photos. Admin-only and
 * tenant-scoped: a collection, and every photo added to it, belong to the
 * requesting club. Changing a collection re-picks the layer photos of open
 * drafts that take a photo from it.
 *
 * `/club-templates/layer-photo-preview` resolves a template's sourced photo
 * layers for the editor's preview.
 */
const router: IRouter = Router();

const parseId = (raw: unknown): number | null => {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

/** Collections with their photo counts and newest photo's thumbnail. */
async function presentCollections(tenantId: number, rows: ClubPhotoCollectionRow[]) {
  const ids = rows.map((r) => r.id);
  const stats = ids.length
    ? await db
        .select({
          collectionId: clubPhotoCollectionPhotosTable.collectionId,
          photos: count(),
          newest: max(clubPhotoCollectionPhotosTable.photoId),
        })
        .from(clubPhotoCollectionPhotosTable)
        .where(
          and(
            eq(clubPhotoCollectionPhotosTable.tenantId, tenantId),
            inArray(clubPhotoCollectionPhotosTable.collectionId, ids),
          ),
        )
        .groupBy(clubPhotoCollectionPhotosTable.collectionId)
    : [];
  const coverIds = stats.flatMap((s) => (s.newest != null ? [s.newest] : []));
  const covers = coverIds.length
    ? await db
        .select({ id: clubPhotosTable.id, thumbPath: clubPhotosTable.thumbPath })
        .from(clubPhotosTable)
        .where(and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.id, coverIds)))
    : [];
  const thumb = new Map(covers.map((c) => [c.id, objectUrl(c.thumbPath)]));
  const byId = new Map(stats.map((s) => [s.collectionId, s]));
  return rows.map((r) => {
    const s = byId.get(r.id);
    return {
      id: r.id,
      name: r.name,
      photoCount: s?.photos ?? 0,
      coverUrl: s?.newest != null ? (thumb.get(s.newest) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

async function loadCollection(tenantId: number, id: number) {
  const [row] = await db
    .select()
    .from(clubPhotoCollectionsTable)
    .where(
      and(eq(clubPhotoCollectionsTable.tenantId, tenantId), eq(clubPhotoCollectionsTable.id, id)),
    );
  return row ?? null;
}

/** Whether the club already has another collection named `name` (case-insensitive). */
async function nameTaken(tenantId: number, name: string, except?: number): Promise<boolean> {
  const rows = await db
    .select({ id: clubPhotoCollectionsTable.id })
    .from(clubPhotoCollectionsTable)
    .where(
      and(
        eq(clubPhotoCollectionsTable.tenantId, tenantId),
        sql`lower(${clubPhotoCollectionsTable.name}) = lower(${name})`,
      ),
    );
  return rows.some((r) => r.id !== except);
}

router.get("/club-photo-collections", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const rows = await db
    .select()
    .from(clubPhotoCollectionsTable)
    .where(eq(clubPhotoCollectionsTable.tenantId, tenantId))
    .orderBy(asc(sql`lower(${clubPhotoCollectionsTable.name})`), asc(clubPhotoCollectionsTable.id));
  res.json(await presentCollections(tenantId, rows));
});

router.post("/club-photo-collections", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateClubPhotoCollectionBody.safeParse(req.body);
  const name = parsed.success ? parsed.data.name.trim() : "";
  if (!name) {
    res.status(400).json({ error: "Give the collection a name." });
    return;
  }
  const tenantId = getTenantId(req);
  if (await nameTaken(tenantId, name)) {
    res.status(409).json({ error: "There's already a collection with that name." });
    return;
  }
  const [row] = await db.insert(clubPhotoCollectionsTable).values({ tenantId, name }).returning();
  const [out] = await presentCollections(tenantId, [row]);
  res.status(201).json(out);
});

router.patch("/club-photo-collections/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const parsed = RenameClubPhotoCollectionBody.safeParse(req.body);
  const name = parsed.success ? parsed.data.name.trim() : "";
  if (id === null || !name) {
    res.status(400).json({ error: "Give the collection a name." });
    return;
  }
  const tenantId = getTenantId(req);
  if (!(await loadCollection(tenantId, id))) {
    res.status(404).json({ error: "collection not found" });
    return;
  }
  if (await nameTaken(tenantId, name, id)) {
    res.status(409).json({ error: "There's already a collection with that name." });
    return;
  }
  const [row] = await db
    .update(clubPhotoCollectionsTable)
    .set({ name, updatedAt: new Date() })
    .where(
      and(eq(clubPhotoCollectionsTable.tenantId, tenantId), eq(clubPhotoCollectionsTable.id, id)),
    )
    .returning();
  const [out] = await presentCollections(tenantId, [row]);
  res.json(out);
});

router.delete("/club-photo-collections/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const tenantId = getTenantId(req);
  const rows = await db
    .delete(clubPhotoCollectionsTable)
    .where(
      and(eq(clubPhotoCollectionsTable.tenantId, tenantId), eq(clubPhotoCollectionsTable.id, id)),
    )
    .returning({ id: clubPhotoCollectionsTable.id });
  if (rows.length === 0) {
    res.status(404).json({ error: "collection not found" });
    return;
  }
  // Layers that took a photo from it fall back to the card's photo.
  await refreshCollectionLayerPhotos(tenantId, id);
  res.status(204).end();
});

router.post("/club-photo-collections/:id/photos", requireAdmin, async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  const parsed = AddClubPhotoCollectionPhotosBody.safeParse(req.body);
  if (id === null || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "Invalid id" : parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const collection = await loadCollection(tenantId, id);
  const photoIds = [...new Set(parsed.data.photoIds)];
  const owned = collection
    ? await db
        .select({ id: clubPhotosTable.id })
        .from(clubPhotosTable)
        .where(and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.id, photoIds)))
    : [];
  if (!collection || owned.length !== photoIds.length) {
    res.status(404).json({ error: collection ? "photo not found" : "collection not found" });
    return;
  }
  await db
    .insert(clubPhotoCollectionPhotosTable)
    .values(photoIds.map((photoId) => ({ tenantId, collectionId: id, photoId })))
    .onConflictDoNothing();
  await refreshCollectionLayerPhotos(tenantId, id);
  const [out] = await presentCollections(tenantId, [collection]);
  res.json(out);
});

router.post(
  "/club-photo-collections/:id/photos/remove",
  requireAdmin,
  async (req, res): Promise<void> => {
    const id = parseId(req.params.id);
    const parsed = RemoveClubPhotoCollectionPhotosBody.safeParse(req.body);
    if (id === null || !parsed.success) {
      res.status(400).json({ error: parsed.success ? "Invalid id" : parsed.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const collection = await loadCollection(tenantId, id);
    if (!collection) {
      res.status(404).json({ error: "collection not found" });
      return;
    }
    await db
      .delete(clubPhotoCollectionPhotosTable)
      .where(
        and(
          eq(clubPhotoCollectionPhotosTable.tenantId, tenantId),
          eq(clubPhotoCollectionPhotosTable.collectionId, id),
          inArray(clubPhotoCollectionPhotosTable.photoId, parsed.data.photoIds),
        ),
      );
    await refreshCollectionLayerPhotos(tenantId, id);
    const [out] = await presentCollections(tenantId, [collection]);
    res.json(out);
  },
);

/** The club's latest published senior team list, for previewing player sources. */
async function latestSeniorTeamList(tenantId: number) {
  const rows = await db
    .select({
      players: teamListsTable.players,
      grade: fixturesTable.grade,
      opponent: fixturesTable.opponentName,
    })
    .from(teamListsTable)
    .innerJoin(fixturesTable, eq(fixturesTable.id, teamListsTable.fixtureId))
    .where(
      and(
        eq(teamListsTable.tenantId, tenantId),
        eq(fixturesTable.tenantId, tenantId),
        eq(teamListsTable.isPublished, true),
      ),
    )
    .orderBy(desc(fixturesTable.startAt), desc(fixturesTable.id))
    .limit(20);
  return rows.find((r) => !isJuniorGradeLabel(r.grade) && r.players.length > 0) ?? null;
}

router.post(
  "/club-templates/layer-photo-preview",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = PreviewLayerPhotosBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const { kind } = parsed.data;
    const document = (req.body as { document?: unknown }).document;
    const list = await latestSeniorTeamList(tenantId);
    const layerPhotos = await resolveLayerPhotos({
      tenantId,
      adjustments: document,
      cardInput: { kind },
      // Junior card kinds never get a photo.
      junior: kind.startsWith("junior"),
      seed: "preview",
      teamList: list?.players ?? [],
    });
    res.json({
      layerPhotos: layerPhotos ?? {},
      teamList: list ? { grade: list.grade, opponent: list.opponent } : null,
    });
  },
);

export default router;
