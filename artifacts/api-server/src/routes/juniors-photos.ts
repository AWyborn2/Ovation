import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, juniorParticipantsTable, juniorPhotosTable, type JuniorPhotoRow } from "@workspace/db";
import {
  AddJuniorPhotoBody,
  AddJuniorPhotoParams,
  DeleteJuniorPhotoParams,
  GetJuniorPhotoParams,
  GetJuniorPhotoThumbParams,
  ListJuniorPhotosParams,
  SetDefaultJuniorPhotoParams,
} from "@workspace/api-zod";
import { requireAdmin, resolveAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { juniorParticipantJoin, juniorParticipantKey } from "../lib/junior-participant-scope";
import { adminName } from "../lib/junior-admin-helpers";
import { IngestError, ingestImage, withTenantSlot } from "../lib/image-ingest";
import { JUNIOR_PHOTO_PREFIX, photoStore } from "../lib/photo-store";
import { juniorPhotoAllowed, juniorPhotoThumbUrl, juniorPhotoUrl } from "../lib/junior-photos";

/**
 * Junior players' photos (plan 2026-10-16-001, ADR-007).
 *
 * Admin: list / add / delete / set default under `/juniors/participants/:id/photos`. An
 * upload goes through the ordinary presigned upload, then `POST .../photos` converts it
 * (EXIF stripped, thumbnail) and stores the copies under the private `library/juniors/`
 * prefix, which the public storage route refuses.
 *
 * Public: `GET /juniors/photos/:photoId[/thumb]` streams the image only while the player
 * is allowed a photo — not withheld, not private — or to a signed-in admin of the club.
 * Cards and the public profile use these URLs, so withdrawing consent cuts the image off
 * everywhere at once.
 */
const router: IRouter = Router();

function present(p: JuniorPhotoRow) {
  return {
    id: p.id,
    participantId: p.participantId,
    url: juniorPhotoUrl(p.id),
    thumbUrl: p.thumbPath ? juniorPhotoThumbUrl(p.id) : null,
    isDefault: p.isDefault,
    createdAt: p.createdAt.toISOString(),
  };
}

async function loadParticipant(tenantId: number, participantId: string) {
  const [row] = await db
    .select()
    .from(juniorParticipantsTable)
    .where(juniorParticipantKey(tenantId, participantId));
  return row ?? null;
}

const photosOf = (tenantId: number, participantId: string) =>
  db
    .select()
    .from(juniorPhotosTable)
    .where(
      and(
        eq(juniorPhotosTable.tenantId, tenantId),
        eq(juniorPhotosTable.participantId, participantId),
      ),
    )
    .orderBy(desc(juniorPhotosTable.isDefault), asc(juniorPhotosTable.createdAt));

router.get(
  "/juniors/participants/:id/photos",
  requireAdmin,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = ListJuniorPhotosParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const participant = await loadParticipant(tenantId, params.data.id);
    if (!participant) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    res.json((await photosOf(tenantId, participant.participantId)).map(present));
  },
);

router.post(
  "/juniors/participants/:id/photos",
  requireAdmin,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = AddJuniorPhotoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = AddJuniorPhotoBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const participant = await loadParticipant(tenantId, params.data.id);
    if (!participant) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    const store = photoStore();
    const { objectPath, makeDefault } = body.data;
    try {
      const row = await withTenantSlot(tenantId, async () => {
        const original = await store.read(objectPath);
        const image = await ingestImage(original);
        const mainPath = await store.write(image.jpeg, "image/jpeg", JUNIOR_PHOTO_PREFIX);
        const thumbPath = await store.write(image.thumb, "image/jpeg", JUNIOR_PHOTO_PREFIX);
        const inserted = await db.transaction(async (tx) => {
          const existing = await tx
            .select({ id: juniorPhotosTable.id })
            .from(juniorPhotosTable)
            .where(
              and(
                eq(juniorPhotosTable.tenantId, tenantId),
                eq(juniorPhotosTable.participantId, participant.participantId),
              ),
            );
          // The first photo is the default; otherwise honour makeDefault.
          const isDefault = existing.length === 0 || makeDefault === true;
          if (isDefault && existing.length > 0) {
            await tx
              .update(juniorPhotosTable)
              .set({ isDefault: false })
              .where(
                and(
                  eq(juniorPhotosTable.tenantId, tenantId),
                  eq(juniorPhotosTable.participantId, participant.participantId),
                ),
              );
          }
          const [r] = await tx
            .insert(juniorPhotosTable)
            .values({
              tenantId,
              participantId: participant.participantId,
              objectPath: mainPath,
              thumbPath,
              width: image.width,
              height: image.height,
              isDefault,
              createdBy: adminName(req),
            })
            .returning();
          return r;
        });
        // The converted copy is the photo; the upload (possibly with GPS EXIF) is not kept.
        await store.remove(objectPath).catch((err: unknown) => {
          req.log.warn({ err, objectPath }, "could not delete ingested junior photo original");
        });
        return inserted;
      });
      res.status(201).json(present(row));
    } catch (err) {
      if (err instanceof IngestError) {
        res.status(422).json({ error: err.message });
        return;
      }
      req.log.warn({ err, objectPath }, "junior photo ingest failed");
      res
        .status(422)
        .json({ error: "The photo could not be read or converted. Try another file." });
    }
  },
);

router.delete(
  "/juniors/participants/:id/photos/:photoId",
  requireAdmin,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = DeleteJuniorPhotoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const participant = await loadParticipant(tenantId, params.data.id);
    if (!participant) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    const [photo] = await db
      .select()
      .from(juniorPhotosTable)
      .where(
        and(
          eq(juniorPhotosTable.tenantId, tenantId),
          eq(juniorPhotosTable.participantId, participant.participantId),
          eq(juniorPhotosTable.id, params.data.photoId),
        ),
      );
    if (!photo) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.delete(juniorPhotosTable).where(eq(juniorPhotosTable.id, photo.id));
      if (photo.isDefault) {
        // The newest remaining photo takes over as the default.
        const [next] = await tx
          .select({ id: juniorPhotosTable.id })
          .from(juniorPhotosTable)
          .where(
            and(
              eq(juniorPhotosTable.tenantId, tenantId),
              eq(juniorPhotosTable.participantId, participant.participantId),
            ),
          )
          .orderBy(desc(juniorPhotosTable.createdAt))
          .limit(1);
        if (next)
          await tx
            .update(juniorPhotosTable)
            .set({ isDefault: true })
            .where(eq(juniorPhotosTable.id, next.id));
      }
    });
    const store = photoStore();
    for (const p of [photo.objectPath, photo.thumbPath]) {
      if (p) await store.remove(p).catch(() => undefined);
    }
    // Cards that showed this photo lose it on their next refresh; a deleted object 404s
    // meanwhile, which the renderer treats as no photo.
    res.status(204).end();
  },
);

router.post(
  "/juniors/participants/:id/photos/:photoId/default",
  requireAdmin,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = SetDefaultJuniorPhotoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    const participant = await loadParticipant(tenantId, params.data.id);
    if (!participant) {
      res.status(404).json({ error: "Participant not found" });
      return;
    }
    const scope = and(
      eq(juniorPhotosTable.tenantId, tenantId),
      eq(juniorPhotosTable.participantId, participant.participantId),
    );
    const updated = await db.transaction(async (tx) => {
      const [photo] = await tx
        .select({ id: juniorPhotosTable.id })
        .from(juniorPhotosTable)
        .where(and(scope, eq(juniorPhotosTable.id, params.data.photoId)));
      if (!photo) return null;
      await tx.update(juniorPhotosTable).set({ isDefault: false }).where(scope);
      const [row] = await tx
        .update(juniorPhotosTable)
        .set({ isDefault: true })
        .where(eq(juniorPhotosTable.id, photo.id))
        .returning();
      return row;
    });
    if (!updated) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }
    res.json(present(updated));
  },
);

// ---------------------------------------------------------------------------
// Public, gated serving (R3, R8): the image only while the player is allowed a photo,
// or to a signed-in admin. A refused request is a 404, never a hint that a photo exists.
// ---------------------------------------------------------------------------

async function serve(req: Request, res: Response, photoId: number, thumb: boolean) {
  const tenantId = getTenantId(req);
  const [row] = await db
    .select({
      objectPath: juniorPhotosTable.objectPath,
      thumbPath: juniorPhotosTable.thumbPath,
      photoWithheld: juniorParticipantsTable.photoWithheld,
      isPrivate: juniorParticipantsTable.isPrivate,
      privacyOverride: juniorParticipantsTable.privacyOverride,
    })
    .from(juniorPhotosTable)
    .innerJoin(
      juniorParticipantsTable,
      juniorParticipantJoin(juniorPhotosTable.participantId, tenantId),
    )
    .where(and(eq(juniorPhotosTable.tenantId, tenantId), eq(juniorPhotosTable.id, photoId)));
  if (!row || (!juniorPhotoAllowed(row) && !(await resolveAdmin(req)))) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const path = thumb ? (row.thumbPath ?? row.objectPath) : row.objectPath;
  try {
    const data = await photoStore().read(path);
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    // Consent can be withdrawn at any time: never let a CDN or shared cache keep a copy.
    res.setHeader("Cache-Control", "private, no-store");
    res.send(data);
  } catch (err) {
    req.log.warn({ err, photoId }, "junior photo object missing");
    res.status(404).json({ error: "Not found" });
  }
}

router.get("/juniors/photos/:photoId", async (req, res): Promise<void> => {
  const params = GetJuniorPhotoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await serve(req, res, params.data.photoId, false);
});

router.get("/juniors/photos/:photoId/thumb", async (req, res): Promise<void> => {
  const params = GetJuniorPhotoThumbParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  await serve(req, res, params.data.photoId, true);
});

export default router;
