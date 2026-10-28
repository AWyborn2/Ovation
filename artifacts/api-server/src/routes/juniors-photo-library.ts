import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  juniorParticipantsTable,
  juniorPhotoParticipantsTable,
  juniorPhotosTable,
  type JuniorPhotoRow,
} from "@workspace/db";
import {
  DeleteJuniorLibraryPhotosBody,
  IngestJuniorLibraryPhotosBody,
  MoveJuniorLibraryPhotosBody,
  SetJuniorLibraryPhotoFocusBody,
  SetJuniorLibraryPhotoFocusParams,
  TagJuniorLibraryPhotosBody,
} from "@workspace/api-zod";
import { FRAME_SHAPES, normaliseFocusBox, type FocusBox } from "@workspace/scorecard";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { juniorParticipantJoin } from "../lib/junior-participant-scope";
import { adminName } from "../lib/junior-admin-helpers";
import { IngestError, MAX_INGEST_BATCH, ingestImage, withTenantSlot } from "../lib/image-ingest";
import { JUNIOR_PHOTO_PREFIX, photoStore } from "../lib/photo-store";
import {
  juniorPhotoAllowed,
  juniorPhotoThumbUrl,
  juniorPhotoUrl,
  loadJuniorPhotoConsent,
  withdrawJuniorPhotoIds,
} from "../lib/junior-photos";

/**
 * `/juniors/photo-library` — the junior photo library (kiosk-photo-rotation A): the
 * senior library's setup (folders by grade x photo type, season, match format, several
 * people per photo) in the junior tables, so junior photos stay off the senior library's
 * public URLs and the juniors isolation invariant holds. Children are tagged by PlayHQ
 * participant id from `junior_participants`.
 *
 * Every route is admin-only and tenant-scoped. Images are stored under the private junior
 * prefix and served only by the gated `/juniors/photos/:id` route, behind
 * `juniorLibraryPhotoAllowed`: an untagged photo, or one with any withheld or private
 * child, never leaves admin.
 */
const router: IRouter = Router();

/** A `text[]` literal (drizzle would expand a bare array into a list). */
function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`'{}'::text[]`;
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

async function present(tenantId: number, rows: JuniorPhotoRow[]) {
  const ids = rows.map((r) => r.id);
  const tags = ids.length
    ? await db
        .select({
          photoId: juniorPhotoParticipantsTable.photoId,
          participantId: juniorPhotoParticipantsTable.participantId,
          displayName: juniorParticipantsTable.displayName,
          photoWithheld: juniorParticipantsTable.photoWithheld,
          isPrivate: juniorParticipantsTable.isPrivate,
          privacyOverride: juniorParticipantsTable.privacyOverride,
          area: juniorPhotoParticipantsTable.area,
        })
        .from(juniorPhotoParticipantsTable)
        .leftJoin(
          juniorParticipantsTable,
          juniorParticipantJoin(juniorPhotoParticipantsTable.participantId, tenantId),
        )
        .where(
          and(
            eq(juniorPhotoParticipantsTable.tenantId, tenantId),
            inArray(juniorPhotoParticipantsTable.photoId, ids),
          ),
        )
    : [];
  const consent = await loadJuniorPhotoConsent(tenantId, ids);
  return rows.map((r) => ({
    id: r.id,
    url: juniorPhotoUrl(r.id),
    thumbUrl: r.thumbPath ? juniorPhotoThumbUrl(r.id) : juniorPhotoUrl(r.id),
    width: r.width,
    height: r.height,
    season: r.season,
    grade: r.grade,
    photoTypes: r.photoTypes,
    matchFormat: r.matchFormat,
    takenAt: r.takenAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    participants: tags
      .filter((t) => t.photoId === r.id)
      .map((t) => ({
        participantId: t.participantId,
        displayName: t.displayName ?? "Unknown player",
        allowed:
          t.displayName != null &&
          juniorPhotoAllowed({
            photoWithheld: t.photoWithheld ?? true,
            isPrivate: t.isPrivate ?? true,
            privacyOverride: t.privacyOverride ?? false,
          }),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    displayable: consent.get(r.id) === true,
    // Photo focus areas.
    focusBox: normaliseFocusBox(r.focusBox),
    focusSuggested: r.focusSuggested,
    offShapes: FRAME_SHAPES.filter((shape) => r.offShapes.includes(shape)),
    participantAreas: tags
      .filter((t) => t.photoId === r.id)
      .flatMap((t) => {
        const box = normaliseFocusBox(t.area);
        return box ? [{ participantId: t.participantId, box }] : [];
      })
      .sort((a, b) => a.participantId.localeCompare(b.participantId)),
  }));
}

/** The tenant's own participant rows among `ids`, by their stored id; null if any is unknown. */
async function resolveParticipants(tenantId: number, ids: readonly string[]) {
  const wanted = [...new Set(ids.map((i) => i.toLowerCase()))];
  if (wanted.length === 0) return { ids: [] as string[], rejected: [] as string[] };
  const rows = await db
    .select({ participantId: juniorParticipantsTable.participantId })
    .from(juniorParticipantsTable)
    .where(
      and(
        eq(juniorParticipantsTable.tenantId, tenantId),
        inArray(sql`lower(${juniorParticipantsTable.participantId})`, wanted),
      ),
    );
  const found = new Map(rows.map((r) => [r.participantId.toLowerCase(), r.participantId]));
  return {
    ids: wanted.flatMap((w) => (found.has(w) ? [found.get(w)!] : [])),
    rejected: wanted.filter((w) => !found.has(w)),
  };
}

async function tenantPhotoIds(tenantId: number, photoIds: number[]): Promise<number[]> {
  if (photoIds.length === 0) return [];
  const rows = await db
    .select({ id: juniorPhotosTable.id })
    .from(juniorPhotosTable)
    .where(and(eq(juniorPhotosTable.tenantId, tenantId), inArray(juniorPhotosTable.id, photoIds)));
  return rows.map((r) => r.id);
}

const loadRows = (tenantId: number, ids: number[]) =>
  db
    .select()
    .from(juniorPhotosTable)
    .where(and(eq(juniorPhotosTable.tenantId, tenantId), inArray(juniorPhotosTable.id, ids)))
    .orderBy(desc(juniorPhotosTable.createdAt), desc(juniorPhotosTable.id));

router.get("/juniors/photo-library", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const rows = await db
    .select()
    .from(juniorPhotosTable)
    .where(eq(juniorPhotosTable.tenantId, tenantId))
    .orderBy(desc(juniorPhotosTable.createdAt), desc(juniorPhotosTable.id));
  res.json(await present(tenantId, rows));
});

router.post(
  "/juniors/photo-library/ingest",
  requireAdmin,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const parsed = IngestJuniorLibraryPhotosBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { objectPaths, season, grade, photoType, matchFormat, participantIds = [] } = parsed.data;
    if (objectPaths.length > MAX_INGEST_BATCH) {
      res.status(400).json({ error: `At most ${MAX_INGEST_BATCH} photos per batch.` });
      return;
    }
    const tenantId = getTenantId(req);
    const tagged = await resolveParticipants(tenantId, participantIds);
    if (tagged.rejected.length > 0) {
      res.status(422).json({
        error: "Only this club's junior players can be tagged.",
        participantIds: tagged.rejected,
      });
      return;
    }
    const store = photoStore();
    const results = await Promise.all(
      objectPaths.map((objectPath) =>
        withTenantSlot(tenantId, async () => {
          try {
            const original = await store.read(objectPath);
            const image = await ingestImage(original);
            const mainPath = await store.write(image.jpeg, "image/jpeg", JUNIOR_PHOTO_PREFIX);
            const thumbPath = await store.write(image.thumb, "image/jpeg", JUNIOR_PHOTO_PREFIX);
            const row = await db.transaction(async (tx) => {
              const [r] = await tx
                .insert(juniorPhotosTable)
                .values({
                  tenantId,
                  objectPath: mainPath,
                  thumbPath,
                  width: image.width,
                  height: image.height,
                  season: season ?? null,
                  grade: grade?.trim() || null,
                  photoTypes: photoType ? [photoType] : [],
                  matchFormat: matchFormat ?? null,
                  takenAt: image.takenAt,
                  createdBy: adminName(req),
                })
                .returning();
              if (tagged.ids.length > 0)
                await tx
                  .insert(juniorPhotoParticipantsTable)
                  .values(
                    tagged.ids.map((participantId) => ({ tenantId, photoId: r.id, participantId })),
                  )
                  .onConflictDoNothing();
              return r;
            });
            // The converted copy is the photo; the upload (possibly with GPS EXIF) is not kept.
            await store.remove(objectPath).catch((err: unknown) => {
              req.log.warn({ err, objectPath }, "could not delete ingested junior original");
            });
            return { objectPath, ok: true as const, photoId: row.id };
          } catch (err) {
            if (!(err instanceof IngestError))
              req.log.warn({ err, objectPath }, "junior library ingest failed");
            const error =
              err instanceof IngestError
                ? err.message
                : "The photo could not be read or converted. Try another file.";
            return { objectPath, ok: false as const, error };
          }
        }),
      ),
    );
    const ids = results.flatMap((r) => (r.ok ? [r.photoId] : []));
    const photos = ids.length ? await present(tenantId, await loadRows(tenantId, ids)) : [];
    const byId = new Map(photos.map((p) => [p.id, p]));
    res.json({
      results: results.map((r) =>
        r.ok
          ? { objectPath: r.objectPath, ok: true, photo: byId.get(r.photoId) }
          : { objectPath: r.objectPath, ok: false, error: r.error },
      ),
    });
  },
);

router.post("/juniors/photo-library/tags", requireAdmin, async (req, res): Promise<void> => {
  const parsed = TagJuniorLibraryPhotosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const {
    photoIds,
    season,
    matchFormat,
    addParticipantIds = [],
    removeParticipantIds = [],
  } = parsed.data;
  const added = await resolveParticipants(tenantId, addParticipantIds);
  if (added.rejected.length > 0) {
    res.status(422).json({
      error: "Only this club's junior players can be tagged.",
      participantIds: added.rejected,
    });
    return;
  }
  const owned = await tenantPhotoIds(tenantId, photoIds);
  if (owned.length !== new Set(photoIds).size) {
    res.status(404).json({ error: "photo not found" });
    return;
  }
  const before = await loadJuniorPhotoConsent(tenantId, owned);
  const removed = [...new Set(removeParticipantIds.map((p) => p.toLowerCase()))];
  await db.transaction(async (tx) => {
    const patch: Partial<Pick<JuniorPhotoRow, "season" | "matchFormat">> = {};
    if (season !== undefined) patch.season = season;
    if (matchFormat !== undefined) patch.matchFormat = matchFormat;
    if (Object.keys(patch).length > 0)
      await tx
        .update(juniorPhotosTable)
        .set(patch)
        .where(and(eq(juniorPhotosTable.tenantId, tenantId), inArray(juniorPhotosTable.id, owned)));
    if (removed.length > 0)
      await tx
        .delete(juniorPhotoParticipantsTable)
        .where(
          and(
            eq(juniorPhotoParticipantsTable.tenantId, tenantId),
            inArray(juniorPhotoParticipantsTable.photoId, owned),
            inArray(sql`lower(${juniorPhotoParticipantsTable.participantId})`, removed),
          ),
        );
    const values = owned.flatMap((photoId) =>
      added.ids.map((participantId) => ({ tenantId, photoId, participantId })),
    );
    if (values.length > 0)
      await tx.insert(juniorPhotoParticipantsTable).values(values).onConflictDoNothing();
  });
  const after = await loadJuniorPhotoConsent(tenantId, owned);
  // Fail closed in the same request: a photo that stopped being displayable leaves cards now.
  const lost = owned.filter((id) => before.get(id) === true && after.get(id) !== true);
  if (lost.length > 0) await withdrawJuniorPhotoIds(tenantId, lost);
  res.json(await present(tenantId, await loadRows(tenantId, owned)));
});

/**
 * Photo focus areas on a junior photo: its focus box, the frame shapes switched off for
 * it and where each tagged child is. Areas are only for children already tagged (tagging
 * is a consent question and stays on the tags route). Fields left out are kept.
 */
router.put(
  "/juniors/photo-library/:photoId/focus",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = SetJuniorLibraryPhotoFocusParams.safeParse(req.params);
    const parsed = SetJuniorLibraryPhotoFocusBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: (params.error ?? parsed.error)?.message ?? "Invalid body" });
      return;
    }
    const tenantId = getTenantId(req);
    const { photoId } = params.data;
    const { focusBox, offShapes, participantAreas = [], suggested = false } = parsed.data;
    const box =
      focusBox === undefined ? undefined : focusBox === null ? null : normaliseFocusBox(focusBox);
    if (box === null && focusBox !== null) {
      res.status(400).json({ error: "The focus box is too small or off the photo." });
      return;
    }
    const areas: Array<{ key: string; box: FocusBox | null }> = [];
    for (const a of participantAreas) {
      const area = a.box === null ? null : normaliseFocusBox(a.box);
      if (a.box !== null && !area) {
        res.status(400).json({ error: "A player's area is too small or off the photo." });
        return;
      }
      areas.push({ key: a.participantId.toLowerCase(), box: area });
    }
    if (new Set(areas.map((a) => a.key)).size !== areas.length) {
      res.status(400).json({ error: "Give each player one area." });
      return;
    }
    if ((await tenantPhotoIds(tenantId, [photoId])).length === 0) {
      res.status(404).json({ error: "photo not found" });
      return;
    }
    const tags = await db
      .select({ participantId: juniorPhotoParticipantsTable.participantId })
      .from(juniorPhotoParticipantsTable)
      .where(
        and(
          eq(juniorPhotoParticipantsTable.tenantId, tenantId),
          eq(juniorPhotoParticipantsTable.photoId, photoId),
        ),
      );
    const tagged = new Set(tags.map((t) => t.participantId.toLowerCase()));
    if (areas.some((a) => !tagged.has(a.key))) {
      res.status(400).json({ error: "Tag a player on the photo before marking where they are." });
      return;
    }
    await db.transaction(async (tx) => {
      const patch: { focusBox?: FocusBox | null; focusSuggested?: boolean; offShapes?: SQL } = {};
      if (box !== undefined) {
        patch.focusBox = box;
        patch.focusSuggested = suggested && box !== null;
      }
      if (offShapes !== undefined)
        patch.offShapes = textArray(FRAME_SHAPES.filter((shape) => offShapes.includes(shape)));
      if (Object.keys(patch).length > 0)
        await tx
          .update(juniorPhotosTable)
          .set(patch)
          .where(
            and(
              eq(juniorPhotosTable.tenantId, tenantId),
              eq(juniorPhotosTable.id, photoId),
              // A suggestion (faces found on upload) never replaces a box an admin set.
              patch.focusSuggested
                ? or(isNull(juniorPhotosTable.focusBox), eq(juniorPhotosTable.focusSuggested, true))
                : undefined,
            ),
          );
      for (const area of areas)
        await tx
          .update(juniorPhotoParticipantsTable)
          .set({ area: area.box })
          .where(
            and(
              eq(juniorPhotoParticipantsTable.tenantId, tenantId),
              eq(juniorPhotoParticipantsTable.photoId, photoId),
              sql`lower(${juniorPhotoParticipantsTable.participantId}) = ${area.key}`,
            ),
          );
    });
    const [photo] = await present(tenantId, await loadRows(tenantId, [photoId]));
    res.json(photo);
  },
);

/** File photos into a folder: the grade (null = Club-wide) and one photo type (null = Unsorted). */
router.post("/juniors/photo-library/move", requireAdmin, async (req, res): Promise<void> => {
  const parsed = MoveJuniorLibraryPhotosBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const { photoIds, photoType } = parsed.data;
  const grade = parsed.data.grade?.trim() || null;
  const owned = await tenantPhotoIds(tenantId, photoIds);
  if (owned.length !== new Set(photoIds).size) {
    res.status(404).json({ error: "photo not found" });
    return;
  }
  await db
    .update(juniorPhotosTable)
    .set({ grade, photoTypes: textArray(photoType ? [photoType] : []) })
    .where(and(eq(juniorPhotosTable.tenantId, tenantId), inArray(juniorPhotosTable.id, owned)));
  res.json(await present(tenantId, await loadRows(tenantId, owned)));
});

router.post("/juniors/photo-library/delete", requireAdmin, async (req, res): Promise<void> => {
  const parsed = DeleteJuniorLibraryPhotosBody.safeParse(req.body);
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
  // Strip open cards first (they match on the photo's URL), then drop the rows and files:
  // junior photos are children's images, so nothing keeps a copy once the club removes one.
  await withdrawJuniorPhotoIds(tenantId, owned);
  const rows = await db
    .delete(juniorPhotosTable)
    .where(and(eq(juniorPhotosTable.tenantId, tenantId), inArray(juniorPhotosTable.id, owned)))
    .returning();
  const store = photoStore();
  for (const r of rows)
    for (const p of [r.objectPath, r.thumbPath])
      if (p) await store.remove(p).catch(() => undefined);
  res.json({ deleted: rows.length });
});

export default router;
