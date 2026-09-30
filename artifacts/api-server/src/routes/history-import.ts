import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable, MintCeilingError } from "@workspace/db";
import { ReplaceTenantHistoryBoundariesBody } from "@workspace/api-zod";
import {
  requirePlatformAdmin,
  type RequestWithPlatformAdmin,
} from "../middlewares/require-platform-admin";
import { scorecardUpload, type MulterRequest } from "../lib/import-upload";
import { invalidateMilestonesCache } from "../lib/milestones-cache";
import {
  HistoryImportError,
  commitHistoryImport,
  historyTemplateCsv,
  isHistoryTemplate,
  listHistoryBatches,
  loadBoundaries,
  previewHistoryImport,
  replaceBoundaries,
  undoHistoryBatch,
} from "../lib/history-import";

/**
 * Concierge club history import (hybrid stats plan U11; R13, R14, R18): the
 * platform admin previews, commits, lists and undoes a club's pre-digital
 * history, and sets the club's boundary. Every route is platform-admin only
 * (a club-admin session never reaches them) and names its tenant in the path,
 * so an import only ever writes that tenant's rows. The work lives in
 * lib/history-import.ts, which U12's Halls Head seed reuses.
 *
 * Nothing here runs the Social Studio draft sweep (KTD8).
 */
const router: IRouter = Router();

const BASE = "/platform/admin/tenants/:id/history-import";

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
  if (err instanceof HistoryImportError) {
    res
      .status(err.status)
      .json(err.preview ? { error: err.message, preview: err.preview } : { error: err.message });
    return;
  }
  if (err instanceof MintCeilingError) {
    res.status(409).json({ error: err.message });
    return;
  }
  throw err;
}

/** The uploaded CSV and template of a multipart request, or the 400 already written. */
function fileAndTemplate(
  req: Request,
  res: Response,
): { csv: string; template: Parameters<typeof previewHistoryImport>[1] } | null {
  const file = (req as MulterRequest).file;
  if (!file) {
    res.status(400).json({ error: "Missing file field" });
    return null;
  }
  const template = req.body?.template;
  if (!isHistoryTemplate(template)) {
    res.status(400).json({ error: "template must be career, season, match or honours" });
    return null;
  }
  return { csv: file.buffer.toString("utf8"), template };
}

router.get(
  "/platform/admin/history-import/templates/:template",
  requirePlatformAdmin,
  (req, res): void => {
    const template = req.params.template;
    if (!isHistoryTemplate(template)) {
      res.status(404).json({ error: "No such template" });
      return;
    }
    res
      .status(200)
      .type("text/csv")
      .setHeader("Content-Disposition", `attachment; filename="club-history-${template}.csv"`)
      .send(historyTemplateCsv(template));
  },
);

router.post(
  `${BASE}/preview`,
  requirePlatformAdmin,
  scorecardUpload.single("file"),
  async (req: Request, res): Promise<void> => {
    const tenantId = await tenantIdOr404(req, res);
    if (tenantId === null) return;
    const input = fileAndTemplate(req, res);
    if (!input) return;
    try {
      res.json(await previewHistoryImport(tenantId, input.template, input.csv));
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
    const input = fileAndTemplate(req, res);
    if (!input) return;
    const label = typeof req.body?.label === "string" ? req.body.label.trim() : "";
    if (!label) {
      res.status(400).json({ error: "A label is required" });
      return;
    }
    let links: Record<string, number> = {};
    const rawLinks = req.body?.links;
    if (typeof rawLinks === "string" && rawLinks.trim() !== "") {
      try {
        const parsed: unknown = JSON.parse(rawLinks);
        if (
          !parsed ||
          typeof parsed !== "object" ||
          Array.isArray(parsed) ||
          !Object.values(parsed).every((v) => Number.isInteger(v) && (v as number) > 0)
        ) {
          throw new Error("bad links");
        }
        links = parsed as Record<string, number>;
      } catch {
        res.status(400).json({ error: "links must be a JSON object of player key -> player id" });
        return;
      }
    }
    const platformAdmin = (req as RequestWithPlatformAdmin).platformAdmin!;
    try {
      const result = await commitHistoryImport({
        tenantId,
        template: input.template,
        csv: input.csv,
        label,
        note: typeof req.body?.note === "string" ? req.body.note : null,
        createdBy: `platform:${platformAdmin.email}`,
        links,
      });
      req.log?.info(
        {
          event: "club_history_import",
          platformAdminId: platformAdmin.id,
          tenantId,
          batchId: result.batchId,
          rows: result.rows,
          honours: result.honours,
        },
        "platform admin imported club history",
      );
      invalidateMilestonesCache(tenantId);
      res.status(201).json(result);
    } catch (err) {
      sendImportError(res, err);
    }
  },
);

router.get(`${BASE}/batches`, requirePlatformAdmin, async (req, res): Promise<void> => {
  const tenantId = await tenantIdOr404(req, res);
  if (tenantId === null) return;
  try {
    res.json(await listHistoryBatches(tenantId));
  } catch (err) {
    sendImportError(res, err);
  }
});

router.delete(`${BASE}/batches/:batchId`, requirePlatformAdmin, async (req, res): Promise<void> => {
  const tenantId = await tenantIdOr404(req, res);
  if (tenantId === null) return;
  const batchId = parsePositiveInt(req.params.batchId);
  if (batchId === null) {
    res.status(400).json({ error: "Invalid batch id" });
    return;
  }
  try {
    const result = await undoHistoryBatch(tenantId, batchId);
    invalidateMilestonesCache(tenantId);
    const platformAdmin = (req as RequestWithPlatformAdmin).platformAdmin!;
    req.log?.info(
      {
        event: "club_history_undo",
        platformAdminId: platformAdmin.id,
        tenantId,
        ...result,
      },
      "platform admin undid a club history batch",
    );
    res.json(result);
  } catch (err) {
    sendImportError(res, err);
  }
});

router.get(`${BASE}/boundaries`, requirePlatformAdmin, async (req, res): Promise<void> => {
  const tenantId = await tenantIdOr404(req, res);
  if (tenantId === null) return;
  try {
    const rows = await loadBoundaries(tenantId);
    res.json(rows.sort((a, b) => (a.grade ?? "").localeCompare(b.grade ?? "")));
  } catch (err) {
    sendImportError(res, err);
  }
});

router.put(`${BASE}/boundaries`, requirePlatformAdmin, async (req, res): Promise<void> => {
  const tenantId = await tenantIdOr404(req, res);
  if (tenantId === null) return;
  const parsed = ReplaceTenantHistoryBoundariesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const platformAdmin = (req as RequestWithPlatformAdmin).platformAdmin!;
  try {
    const saved = await replaceBoundaries(
      tenantId,
      parsed.data.boundaries.map((b) => ({ grade: b.grade ?? null, startSeason: b.startSeason })),
      `platform:${platformAdmin.email}`,
    );
    invalidateMilestonesCache(tenantId);
    req.log?.info(
      { event: "club_history_boundaries", platformAdminId: platformAdmin.id, tenantId, saved },
      "platform admin set club history boundaries",
    );
    res.json(saved);
  } catch (err) {
    sendImportError(res, err);
  }
});

export default router;
