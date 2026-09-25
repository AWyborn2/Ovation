import { Router, type IRouter } from "express";
import { and, arrayContains, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, clubPhotosTable, clubPhotoPlayersTable, type ClubPhotoRow } from "@workspace/db";
import {
  IngestClubPhotosBody,
  TagClubPhotosBody,
  DeleteClubPhotosBody,
  ListClubPhotosQueryParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { nonSeniorPlayerIds, presentPhotos } from "../lib/club-photo-library";
import { IngestError, MAX_INGEST_BATCH, ingestImage, withTenantSlot } from "../lib/image-ingest";
import { photoStore } from "../lib/photo-store";
import { fillMissingDraftPhotos, repickTypedDraftPhotos } from "../lib/draft-enrich";

/**
 * `/club-photos` — the club's senior photo library (Social Studio, U6).
 * Upload happens through the existing signed-URL flow; `ingest` then converts
 * each uploaded object (HEIC included) into a library photo. All routes are
 * admin-only and tenant-scoped.
 */
const router: IRouter = Router();

async function tenantPhotoIds(tenantId: number, photoIds: number[]): Promise<number[]> {
  if (photoIds.length === 0) return [];
  const rows = await db
    .select({ id: clubPhotosTable.id })
    .from(clubPhotosTable)
    .where(and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.id, photoIds)));
  return rows.map((r) => r.id);
}

/** A `text[]` literal for `values` (drizzle would expand a bare array into a list). */
function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`'{}'::text[]`;
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

async function addTags(tenantId: number, photoIds: number[], playerIds: number[]): Promise<void> {
  const values = photoIds.flatMap((photoId) =>
    playerIds.map((playerId) => ({ tenantId, photoId, playerId })),
  );
  if (values.length > 0)
    await db.insert(clubPhotoPlayersTable).values(values).onConflictDoNothing();
}

router.get("/club-photos", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListClubPhotosQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const { playerId, grade, season, type } = parsed.data;
  const conditions = [eq(clubPhotosTable.tenantId, tenantId)];
  if (grade) conditions.push(eq(clubPhotosTable.grade, grade));
  if (season != null) conditions.push(eq(clubPhotosTable.season, season));
  if (type) conditions.push(arrayContains(clubPhotosTable.photoTypes, [type]));
  if (playerId != null) {
    const tagged = await db
      .select({ photoId: clubPhotoPlayersTable.photoId })
      .from(clubPhotoPlayersTable)
      .where(
        and(
          eq(clubPhotoPlayersTable.tenantId, tenantId),
          eq(clubPhotoPlayersTable.playerId, playerId),
        ),
      );
    if (tagged.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(
      inArray(
        clubPhotosTable.id,
        tagged.map((t) => t.photoId),
      ),
    );
  }
  const rows = await db
    .select()
    .from(clubPhotosTable)
    .where(and(...conditions))
    .orderBy(desc(clubPhotosTable.createdAt), desc(clubPhotosTable.id));
  res.json(await presentPhotos(tenantId, rows));
});

router.post("/club-photos/ingest", requireAdmin, async (req, res): Promise<void> => {
  const parsed = IngestClubPhotosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { objectPaths, season, grade, playerIds = [] } = parsed.data;
  if (objectPaths.length > MAX_INGEST_BATCH) {
    res.status(400).json({ error: `At most ${MAX_INGEST_BATCH} photos per batch.` });
    return;
  }
  const tenantId = getTenantId(req);
  const rejected = await nonSeniorPlayerIds(tenantId, playerIds);
  if (rejected.length > 0) {
    res.status(422).json({ error: "Only senior players can be tagged.", playerIds: rejected });
    return;
  }

  const store = photoStore();
  const results = await Promise.all(
    objectPaths.map((objectPath) =>
      withTenantSlot(tenantId, async () => {
        try {
          const original = await store.read(objectPath);
          const image = await ingestImage(original);
          const mainPath = await store.write(image.jpeg, "image/jpeg");
          const thumbPath = await store.write(image.thumb, "image/jpeg");
          const [row] = await db
            .insert(clubPhotosTable)
            .values({
              tenantId,
              objectPath: mainPath,
              thumbPath,
              width: image.width,
              height: image.height,
              season: season ?? null,
              grade: grade ?? null,
              takenAt: image.takenAt,
            })
            .returning();
          await addTags(tenantId, [row.id], playerIds);
          // The converted copy is the library photo; the upload (possibly a
          // HEIC with GPS EXIF) is not kept.
          await store.remove(objectPath).catch((err: unknown) => {
            req.log.warn({ err, objectPath }, "could not delete ingested original");
          });
          return { objectPath, ok: true as const, photoId: row.id };
        } catch (err) {
          const message =
            err instanceof IngestError ? err.message : "This upload could not be read.";
          if (!(err instanceof IngestError))
            req.log.warn({ err, objectPath }, "photo ingest failed");
          return { objectPath, ok: false as const, error: message };
        }
      }),
    ),
  );

  const ids = results.flatMap((r) => (r.ok ? [r.photoId] : []));
  const rows = ids.length
    ? await db
        .select()
        .from(clubPhotosTable)
        .where(and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.id, ids)))
    : [];
  const photos = await presentPhotos(tenantId, rows);
  const byId = new Map(photos.map((p) => [p.id, p]));
  // New photos can fill drafts that never had a match in the library.
  if (rows.length > 0) await fillMissingDraftPhotos(tenantId);
  res.json({
    results: results.map((r) =>
      r.ok
        ? { objectPath: r.objectPath, ok: true, photo: byId.get(r.photoId) }
        : { objectPath: r.objectPath, ok: false, error: r.error },
    ),
  });
});

router.post("/club-photos/tags", requireAdmin, async (req, res): Promise<void> => {
  const parsed = TagClubPhotosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const {
    photoIds,
    season,
    grade,
    addPlayerIds = [],
    removePlayerIds = [],
    addTypes = [],
    removeTypes = [],
  } = parsed.data;
  if (addTypes.some((t) => removeTypes.includes(t))) {
    res.status(400).json({ error: "A photo type can't be added and removed at once." });
    return;
  }
  const rejected = await nonSeniorPlayerIds(tenantId, addPlayerIds);
  if (rejected.length > 0) {
    res.status(422).json({ error: "Only senior players can be tagged.", playerIds: rejected });
    return;
  }
  const owned = await tenantPhotoIds(tenantId, photoIds);
  if (owned.length !== new Set(photoIds).size) {
    res.status(404).json({ error: "photo not found" });
    return;
  }

  const before = await db
    .select({ id: clubPhotosTable.id, photoTypes: clubPhotosTable.photoTypes })
    .from(clubPhotosTable)
    .where(and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.id, owned)));

  await db.transaction(async (tx) => {
    const patch: Partial<Pick<ClubPhotoRow, "season" | "grade">> & { photoTypes?: SQL } = {};
    if (season !== undefined) patch.season = season;
    if (grade !== undefined) patch.grade = grade;
    if (addTypes.length > 0 || removeTypes.length > 0) {
      // Add, then remove, keeping each type once.
      patch.photoTypes = sql`ARRAY(SELECT DISTINCT t FROM unnest(array_cat(${clubPhotosTable.photoTypes}, ${textArray(addTypes)})) AS t WHERE t <> ALL(${textArray(removeTypes)}) ORDER BY t)`;
    }
    if (Object.keys(patch).length > 0) {
      await tx
        .update(clubPhotosTable)
        .set(patch)
        .where(and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.id, owned)));
    }
    if (removePlayerIds.length > 0) {
      await tx
        .delete(clubPhotoPlayersTable)
        .where(
          and(
            eq(clubPhotoPlayersTable.tenantId, tenantId),
            inArray(clubPhotoPlayersTable.photoId, owned),
            inArray(clubPhotoPlayersTable.playerId, removePlayerIds),
          ),
        );
    }
    const values = owned.flatMap((photoId) =>
      addPlayerIds.map((playerId) => ({ tenantId, photoId, playerId })),
    );
    if (values.length > 0)
      await tx.insert(clubPhotoPlayersTable).values(values).onConflictDoNothing();
  });

  const rows = await db
    .select()
    .from(clubPhotosTable)
    .where(and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.id, owned)));
  // A photo newly tagged with a player or grade can fill drafts that had none;
  // a change of photo types can change which photo open drafts prefer.
  const typesBefore = new Map(before.map((b) => [b.id, [...b.photoTypes].sort().join(",")]));
  const typesChanged = rows.some(
    (r) => typesBefore.get(r.id) !== [...r.photoTypes].sort().join(","),
  );
  await fillMissingDraftPhotos(tenantId);
  if (typesChanged) await repickTypedDraftPhotos(tenantId);
  res.json(await presentPhotos(tenantId, rows));
});

router.post("/club-photos/delete", requireAdmin, async (req, res): Promise<void> => {
  const parsed = DeleteClubPhotosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const owned = await tenantPhotoIds(tenantId, parsed.data.photoIds);
  if (owned.length !== new Set(parsed.data.photoIds).size) {
    res.status(404).json({ error: "photo not found" });
    return;
  }
  const rows = await db
    .delete(clubPhotosTable)
    .where(and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.id, owned)))
    .returning();
  // Drafts snapshot their photo URL (KTD6), so removing the objects here can
  // blank an existing draft's image; keep the files and only drop the rows.
  res.json({ deleted: rows.length });
});

export default router;
