import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  clubPhotosTable,
  clubPhotoPlayersTable,
  playersTable,
  playerIdMapTable,
  type ClubPhotoRow,
} from "@workspace/db";
import {
  IngestClubPhotosBody,
  TagClubPhotosBody,
  DeleteClubPhotosBody,
  ListClubPhotosQueryParams,
} from "@workspace/api-zod";
import { isFillInPlayerId } from "@workspace/scorecard";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { tenantIsCentral } from "../lib/tenant";
import { IngestError, MAX_INGEST_BATCH, ingestImage, withTenantSlot } from "../lib/image-ingest";
import { objectUrl, photoStore } from "../lib/photo-store";

/**
 * `/club-photos` — the club's senior photo library (Social Studio, U6).
 * Upload happens through the existing signed-URL flow; `ingest` then converts
 * each uploaded object (HEIC included) into a library photo. All routes are
 * admin-only and tenant-scoped.
 */
const router: IRouter = Router();

type PhotoDto = {
  id: number;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  season: number | null;
  grade: string | null;
  takenAt: string | null;
  createdAt: string;
  playerIds: number[];
};

async function presentPhotos(tenantId: number, rows: ClubPhotoRow[]): Promise<PhotoDto[]> {
  const ids = rows.map((r) => r.id);
  const tags = ids.length
    ? await db
        .select()
        .from(clubPhotoPlayersTable)
        .where(
          and(
            eq(clubPhotoPlayersTable.tenantId, tenantId),
            inArray(clubPhotoPlayersTable.photoId, ids),
          ),
        )
    : [];
  const byPhoto = new Map<number, number[]>();
  for (const t of tags) byPhoto.set(t.photoId, [...(byPhoto.get(t.photoId) ?? []), t.playerId]);
  return rows.map((r) => ({
    id: r.id,
    url: objectUrl(r.objectPath),
    thumbUrl: objectUrl(r.thumbPath),
    width: r.width,
    height: r.height,
    season: r.season,
    grade: r.grade,
    takenAt: r.takenAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    playerIds: (byPhoto.get(r.id) ?? []).sort((a, b) => a - b),
  }));
}

/**
 * The ids in `playerIds` that are NOT this tenant's senior players. Junior
 * participants and fill-ins can never be tagged (KTD15); a central-data club's
 * players are its crosswalk ids, a native club's are its player register.
 */
async function nonSeniorPlayerIds(tenantId: number, playerIds: number[]): Promise<number[]> {
  const unique = Array.from(new Set(playerIds));
  if (unique.length === 0) return [];
  const bad = unique.filter((id) => isFillInPlayerId(id));
  const candidates = unique.filter((id) => !isFillInPlayerId(id));
  if (candidates.length === 0) return bad;
  const known = (await tenantIsCentral(tenantId))
    ? await db
        .select({ id: playerIdMapTable.playerId })
        .from(playerIdMapTable)
        .where(
          and(
            eq(playerIdMapTable.tenantId, tenantId),
            inArray(playerIdMapTable.playerId, candidates),
          ),
        )
    : await db
        .select({ id: playersTable.id })
        .from(playersTable)
        .where(inArray(playersTable.id, candidates));
  const knownIds = new Set(known.map((k) => k.id));
  return [...bad, ...candidates.filter((id) => !knownIds.has(id))];
}

async function tenantPhotoIds(tenantId: number, photoIds: number[]): Promise<number[]> {
  if (photoIds.length === 0) return [];
  const rows = await db
    .select({ id: clubPhotosTable.id })
    .from(clubPhotosTable)
    .where(and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.id, photoIds)));
  return rows.map((r) => r.id);
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
  const { playerId, grade, season } = parsed.data;
  const conditions = [eq(clubPhotosTable.tenantId, tenantId)];
  if (grade) conditions.push(eq(clubPhotosTable.grade, grade));
  if (season != null) conditions.push(eq(clubPhotosTable.season, season));
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
  const { photoIds, season, grade, addPlayerIds = [], removePlayerIds = [] } = parsed.data;
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

  await db.transaction(async (tx) => {
    const patch: Partial<Pick<ClubPhotoRow, "season" | "grade">> = {};
    if (season !== undefined) patch.season = season;
    if (grade !== undefined) patch.grade = grade;
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
