import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, isNull, type SQL } from "drizzle-orm";
import { db, clubUploadsTable } from "@workspace/db";
import {
  IngestClubUploadsBody,
  ListClubUploadsQueryParams,
  RenameClubUploadBody,
} from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { IngestError, MAX_INGEST_BATCH, withTenantSlot } from "../lib/image-ingest";
import { photoStore } from "../lib/photo-store";
import { CLUB_UPLOAD_PREFIX, ingestUpload, presentUpload, uploadName } from "../lib/club-uploads";

/**
 * `/club-uploads` — the Studio editor's Uploads (migration 0073): a club's
 * logos, artwork and SVG shapes, named and searchable, kept apart from the
 * photo library. Admin-only and tenant-scoped; deleting hides an upload and
 * keeps the file so cards that use it still draw.
 */
const router: IRouter = Router();

const writes = [requireAdmin, requireEntitlement("socialStudio")] as const;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** A positive integer path id, or null. */
function pathId(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function ownUpload(tenantId: number, id: number) {
  const [row] = await db
    .select()
    .from(clubUploadsTable)
    .where(
      and(
        eq(clubUploadsTable.tenantId, tenantId),
        eq(clubUploadsTable.id, id),
        isNull(clubUploadsTable.deletedAt),
      ),
    );
  return row ?? null;
}

router.get("/club-uploads", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListClubUploadsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  const conditions: SQL[] = [
    eq(clubUploadsTable.tenantId, tenantId),
    isNull(clubUploadsTable.deletedAt),
  ];
  for (const word of (parsed.data.q ?? "").trim().split(/\s+/).filter(Boolean)) {
    conditions.push(ilike(clubUploadsTable.name, `%${escapeLike(word)}%`));
  }
  const rows = await db
    .select()
    .from(clubUploadsTable)
    .where(and(...conditions))
    .orderBy(desc(clubUploadsTable.createdAt), desc(clubUploadsTable.id));
  res.json(rows.map(presentUpload));
});

router.post("/club-uploads/ingest", ...writes, async (req, res): Promise<void> => {
  const parsed = IngestClubUploadsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { files } = parsed.data;
  if (files.length > MAX_INGEST_BATCH) {
    res.status(400).json({ error: `At most ${MAX_INGEST_BATCH} files at once.` });
    return;
  }
  const tenantId = getTenantId(req);
  const adminId = (req as RequestWithAdmin).admin?.id ?? null;
  const store = photoStore();
  const results = await Promise.all(
    files.map(({ objectPath, name }) =>
      withTenantSlot(tenantId, async () => {
        try {
          const upload = await ingestUpload(await store.read(objectPath));
          const values =
            upload.kind === "svg"
              ? { kind: "svg" as const, svg: upload.svg }
              : {
                  kind: "image" as const,
                  objectPath: await store.write(
                    upload.data,
                    upload.contentType,
                    CLUB_UPLOAD_PREFIX,
                  ),
                  thumbPath: await store.write(
                    upload.thumb,
                    upload.contentType,
                    CLUB_UPLOAD_PREFIX,
                  ),
                  contentType: upload.contentType,
                };
          const [row] = await db
            .insert(clubUploadsTable)
            .values({
              tenantId,
              name: uploadName(name),
              width: upload.width,
              height: upload.height,
              createdByAdminId: adminId,
              ...values,
            })
            .returning();
          // The converted copy (or the markup) is the upload; the original isn't kept.
          await store.remove(objectPath).catch((err: unknown) => {
            req.log.warn({ err, objectPath }, "could not delete an uploaded original");
          });
          return { objectPath, ok: true as const, upload: presentUpload(row) };
        } catch (err) {
          if (!(err instanceof IngestError)) req.log.warn({ err, objectPath }, "upload failed");
          return {
            objectPath,
            ok: false as const,
            error: err instanceof IngestError ? err.message : "This file could not be added.",
          };
        }
      }),
    ),
  );
  res.json({ results });
});

router.patch("/club-uploads/:id", ...writes, async (req, res): Promise<void> => {
  const id = pathId(req.params.id);
  const parsed = RenameClubUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Give the upload a name." });
    return;
  }
  const tenantId = getTenantId(req);
  if (id == null || !(await ownUpload(tenantId, id))) {
    res.status(404).json({ error: "upload not found" });
    return;
  }
  const [row] = await db
    .update(clubUploadsTable)
    .set({ name })
    .where(and(eq(clubUploadsTable.tenantId, tenantId), eq(clubUploadsTable.id, id)))
    .returning();
  res.json(presentUpload(row));
});

router.delete("/club-uploads/:id", ...writes, async (req, res): Promise<void> => {
  const id = pathId(req.params.id);
  const tenantId = getTenantId(req);
  if (id == null || !(await ownUpload(tenantId, id))) {
    res.status(404).json({ error: "upload not found" });
    return;
  }
  await db
    .update(clubUploadsTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(clubUploadsTable.tenantId, tenantId), eq(clubUploadsTable.id, id)));
  res.status(204).end();
});

export default router;
