import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import {
  requirePlatformAdmin,
  type RequestWithPlatformAdmin,
} from "../middlewares/require-platform-admin";
import { scorecardUpload, type MulterRequest } from "../lib/import-upload";
import {
  CapImportError,
  commitCapImport,
  listCapBatches,
  previewCapImport,
  undoCapBatch,
} from "../lib/cap-import";
import { capImportTemplateCsv } from "../lib/cap-import-core";

/**
 * Cap register CSV import: the platform admin previews, commits, lists and
 * undoes a club's A Grade / Female A Grade cap numbering (the console version
 * of scripts/seed-cap-register). Every route is platform-admin only and names
 * its tenant in the path, so an import only ever writes that tenant's caps.
 * The work lives in lib/cap-import.ts.
 *
 * Nothing here runs the Social Studio draft sweep.
 */
const router: IRouter = Router();

const BASE = "/platform/admin/tenants/:id/cap-import";

function parsePositiveInt(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The path's tenant id, or the 400 / 404 already written. */
async function tenantIdOr404(req: Request, res: Response): Promise<number | null> {
  const id = parsePositiveInt(req.params.id);
  if (id === null) {
    res.status(400).json({ error: "Invalid id" });
    return null;
  }
  const [tenant] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, id));
  if (!tenant) {
    res.status(404).json({ error: "No such tenant" });
    return null;
  }
  return id;
}

/** Answer a known import failure; rethrow anything else to the app handler. */
function sendImportError(res: Response, err: unknown): void {
  if (err instanceof CapImportError) {
    res
      .status(err.status)
      .json(err.preview ? { error: err.message, preview: err.preview } : { error: err.message });
    return;
  }
  throw err;
}

/** The uploaded CSV of a multipart request, or the 400 already written. */
function csvOr400(req: Request, res: Response): string | null {
  const file = (req as MulterRequest).file;
  if (!file) {
    res.status(400).json({ error: "Missing file field" });
    return null;
  }
  return file.buffer.toString("utf8");
}

router.get("/platform/admin/cap-import/template", requirePlatformAdmin, (_req, res): void => {
  res
    .status(200)
    .type("text/csv")
    .setHeader("Content-Disposition", 'attachment; filename="cap-register.csv"')
    .send(capImportTemplateCsv());
});

router.post(
  `${BASE}/preview`,
  requirePlatformAdmin,
  scorecardUpload.single("file"),
  async (req: Request, res): Promise<void> => {
    const tenantId = await tenantIdOr404(req, res);
    if (tenantId === null) return;
    const csv = csvOr400(req, res);
    if (csv === null) return;
    try {
      res.json(await previewCapImport(tenantId, csv));
    } catch (err) {
      sendImportError(res, err);
    }
  },
);

router.post(
  `${BASE}/commit`,
  requirePlatformAdmin,
  scorecardUpload.single("file"),
  async (req: Request, res): Promise<void> => {
    const tenantId = await tenantIdOr404(req, res);
    if (tenantId === null) return;
    const csv = csvOr400(req, res);
    if (csv === null) return;
    const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";
    if (!label) {
      res.status(400).json({ error: "A label is required" });
      return;
    }
    const platformAdmin = (req as RequestWithPlatformAdmin).platformAdmin!;
    try {
      const result = await commitCapImport({ tenantId, csv, label });
      req.log?.info(
        {
          event: "cap_import",
          platformAdminId: platformAdmin.id,
          tenantId,
          batchId: result.batchId,
          written: result.written,
          linked: result.linked,
        },
        "platform admin imported a cap register",
      );
      res.status(201).json(result);
    } catch (err) {
      sendImportError(res, err);
    }
  },
);

router.get(`${BASE}/batches`, requirePlatformAdmin, async (req, res): Promise<void> => {
  const tenantId = await tenantIdOr404(req, res);
  if (tenantId === null) return;
  res.json(await listCapBatches(tenantId));
});

router.delete(`${BASE}/batches/:batchId`, requirePlatformAdmin, async (req, res): Promise<void> => {
  const tenantId = await tenantIdOr404(req, res);
  if (tenantId === null) return;
  const batchId = String(req.params.batchId ?? "");
  const platformAdmin = (req as RequestWithPlatformAdmin).platformAdmin!;
  try {
    const result = await undoCapBatch(tenantId, batchId);
    req.log?.info(
      {
        event: "cap_import_undo",
        platformAdminId: platformAdmin.id,
        tenantId,
        ...result,
      },
      "platform admin undid a cap import batch",
    );
    res.json(result);
  } catch (err) {
    sendImportError(res, err);
  }
});

export default router;
