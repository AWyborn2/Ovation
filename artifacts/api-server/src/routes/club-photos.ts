import { Router, type IRouter } from "express";
import { and, arrayContains, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db, clubPhotosTable, clubPhotoPlayersTable, type ClubPhotoRow } from "@workspace/db";
import {
  IngestClubPhotosBody,
  TagClubPhotosBody,
  DeleteClubPhotosBody,
  MoveClubPhotosBody,
  FetchGoogleDriveFilesBody,
  ListClubPhotosQueryParams,
} from "@workspace/api-zod";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { nonSeniorPlayerIds, presentPhotos } from "../lib/club-photo-library";
import { IngestError, MAX_INGEST_BATCH, ingestImage, withTenantSlot } from "../lib/image-ingest";
import { photoStore } from "../lib/photo-store";
import { fillMissingDraftPhotos, repickTypedDraftPhotos } from "../lib/draft-enrich";
import {
  DriveFileError,
  downloadDriveFile,
  googleDriveConfig,
} from "../lib/integrations/google-drive";

/**
 * `/club-photos` — the club's senior photo library (Social Studio, U6).
 * Upload happens through the existing signed-URL flow; `ingest` then converts
 * each uploaded object (HEIC included) into a library photo. All routes are
 * admin-only and tenant-scoped.
 *
 * Library folders are a view over `grade` x `photo_types`, not a table: a
 * top-level folder per senior grade plus Club-wide (no grade), and inside each
 * a sub-folder per photo type plus Unsorted (no type). A photo has at most one
 * type, so it sits in exactly one folder; `move` and `ingest` file photos.
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

/**
 * A boolean query flag. Zod's coerce turns any non-empty string (even "false")
 * into true, so only an actual true / "true" / "1" counts.
 */
function queryFlag(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === "1";
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
  const ungraded = queryFlag(req.query.ungraded);
  const untyped = queryFlag(req.query.untyped);
  if ((ungraded && grade) || (untyped && type)) {
    res.status(400).json({ error: "Ask for a grade (or type), or for none, not both." });
    return;
  }
  const conditions = [eq(clubPhotosTable.tenantId, tenantId)];
  if (grade) conditions.push(eq(clubPhotosTable.grade, grade));
  if (ungraded) conditions.push(isNull(clubPhotosTable.grade));
  if (season != null) conditions.push(eq(clubPhotosTable.season, season));
  if (type) conditions.push(arrayContains(clubPhotosTable.photoTypes, [type]));
  if (untyped) conditions.push(sql`cardinality(${clubPhotosTable.photoTypes}) = 0`);
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
  const { objectPaths, season, grade, photoType, playerIds = [] } = parsed.data;
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
              // Uploading into a library folder files the photo under its type.
              photoTypes: photoType ? [photoType] : [],
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
  // New photos can fill drafts that never had a match in the library; photos
  // uploaded into a folder (a grade and/or type) can also change which photo
  // open auto drafts prefer, the same as a move.
  if (rows.length > 0) {
    await fillMissingDraftPhotos(tenantId);
    if (photoType || grade) await repickTypedDraftPhotos(tenantId);
  }
  res.json({
    results: results.map((r) =>
      r.ok
        ? { objectPath: r.objectPath, ok: true, photo: byId.get(r.photoId) }
        : { objectPath: r.objectPath, ok: false, error: r.error },
    ),
  });
});

/** Google Picker settings; 404 hides the Drive import when keys are unset. */
router.get("/club-photos/google-drive", requireAdmin, (_req, res): void => {
  const config = googleDriveConfig();
  if (!config) {
    res.status(404).json({ error: "Google Drive import is not configured" });
    return;
  }
  res.json(config);
});

/**
 * Copy picked Drive photos into storage; the client then ingests the returned
 * object paths exactly like uploads (conversion, EXIF strip, tagging rules).
 */
router.post("/club-photos/google-drive/fetch", requireAdmin, async (req, res): Promise<void> => {
  if (!googleDriveConfig()) {
    res.status(404).json({ error: "Google Drive import is not configured" });
    return;
  }
  const parsed = FetchGoogleDriveFilesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Pick up to 50 photos to import." });
    return;
  }
  const { accessToken, fileIds } = parsed.data;
  const tenantId = getTenantId(req);
  const store = photoStore();
  const results = await Promise.all(
    fileIds.map((fileId) =>
      withTenantSlot(tenantId, async () => {
        try {
          const file = await downloadDriveFile(fileId, accessToken);
          const objectPath = await store.write(file.data, file.mimeType);
          return { fileId, ok: true, objectPath, name: file.name };
        } catch (err) {
          if (!(err instanceof DriveFileError)) req.log.warn({ fileId }, "drive import failed");
          const error = err instanceof DriveFileError ? err.message : "Couldn't import that file.";
          return { fileId, ok: false, error };
        }
      }),
    ),
  );
  res.json({ results });
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
  // A photo has one type (its library folder): adding one replaces the old.
  if (new Set(addTypes).size > 1) {
    res.status(400).json({ error: "A photo has one type. Add one type at a time." });
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
    if (addTypes.length > 0) {
      // One type per photo: the added type replaces whatever was there.
      patch.photoTypes = textArray(addTypes.slice(0, 1));
    } else if (removeTypes.length > 0) {
      patch.photoTypes = sql`ARRAY(SELECT DISTINCT t FROM unnest(${clubPhotosTable.photoTypes}) AS t WHERE t <> ALL(${textArray(removeTypes)}) ORDER BY t)`;
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

/**
 * File photos into a library folder: set the grade (null = Club-wide) and
 * replace the photo types with the one given (null = Unsorted). Senior grades
 * only; the library never supplies junior cards (KTD15).
 */
router.post("/club-photos/move", requireAdmin, async (req, res): Promise<void> => {
  const parsed = MoveClubPhotosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const { photoIds, photoType } = parsed.data;
  const grade = parsed.data.grade?.trim() || null;
  if (grade && isJuniorGradeLabel(grade)) {
    res.status(422).json({ error: "The photo library is for senior grades only." });
    return;
  }
  const owned = await tenantPhotoIds(tenantId, photoIds);
  if (owned.length !== new Set(photoIds).size) {
    res.status(404).json({ error: "photo not found" });
    return;
  }
  const inTenant = and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.id, owned));
  const before = await db.select().from(clubPhotosTable).where(inTenant);
  await db
    .update(clubPhotosTable)
    .set({ grade, photoTypes: textArray(photoType ? [photoType] : []) })
    .where(inTenant);
  const rows = await db
    .select()
    .from(clubPhotosTable)
    .where(inTenant)
    .orderBy(desc(clubPhotosTable.createdAt), desc(clubPhotosTable.id));
  // Same as a type change: a photo in a new grade or type folder can fill
  // drafts that had none and change which photo open auto drafts prefer.
  const folderOf = (r: ClubPhotoRow) => `${r.grade ?? ""}|${[...r.photoTypes].sort().join(",")}`;
  const beforeFolder = new Map(before.map((r) => [r.id, folderOf(r)]));
  if (rows.some((r) => beforeFolder.get(r.id) !== folderOf(r))) {
    await fillMissingDraftPhotos(tenantId);
    await repickTypedDraftPhotos(tenantId);
  }
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
