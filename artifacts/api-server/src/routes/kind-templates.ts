/**
 * Card kind template API (plan 2026-10-07-002, U5). Admin-only and
 * tenant-scoped. Every route answers 404 "not enabled" until the
 * KIND_TEMPLATES release switch includes the club, except the list, which
 * reports `enabled: false` so the Studio can keep showing design packs.
 */
import { Router, type IRouter, type Response } from "express";
import {
  ApplyKindTemplateBody,
  SaveKindTemplateBody,
  StartKindTemplateBody,
} from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { kindTemplatesEnabled } from "../lib/kind-templates-switch";
import {
  applyKindTemplate,
  dismissKindTemplateNotice,
  isTemplateKind,
  KindTemplateError,
  listKindTemplates,
  loadKindTemplate,
  presentKindTemplate,
  saveKindTemplate,
  startKindTemplate,
  updatedByName,
  waitingDraftCounts,
} from "../lib/kind-templates";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** The tenant and kind for a kind route, or null after answering 404. */
function scope(req: RequestWithAdmin, res: Response): { tenantId: number; kind: string } | null {
  const tenantId = getTenantId(req);
  if (!kindTemplatesEnabled(tenantId)) {
    res.status(404).json({ error: "Card kind templates aren't switched on for this club." });
    return null;
  }
  const kind = String(req.params.kind ?? "");
  if (!isTemplateKind(kind)) {
    res.status(404).json({ error: "Unknown card kind." });
    return null;
  }
  return { tenantId, kind };
}

/** Answer a known kind-template error, or rethrow. */
function fail(res: Response, err: unknown): void {
  if (err instanceof KindTemplateError) {
    res.status(err.status).json(err.body);
    return;
  }
  throw err;
}

async function present(tenantId: number, kind: string, res: Response): Promise<void> {
  const row = await loadKindTemplate(tenantId, kind);
  if (!row) {
    res.status(404).json({ error: "This card kind has no template yet." });
    return;
  }
  const counts = await waitingDraftCounts(tenantId);
  res.json(
    presentKindTemplate(row, counts.get(kind) ?? 0, {
      withDocument: true,
      updatedByName: await updatedByName(row),
    }),
  );
}

router.get("/kind-templates", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  if (!kindTemplatesEnabled(tenantId)) {
    res.json({ enabled: false, templates: [] });
    return;
  }
  const [rows, counts] = await Promise.all([
    listKindTemplates(tenantId),
    waitingDraftCounts(tenantId),
  ]);
  res.json({
    enabled: true,
    templates: rows.map((row) => presentKindTemplate(row, counts.get(row.baseKind ?? "") ?? 0)),
  });
});

router.get("/kind-templates/:kind", requireAdmin, async (req, res): Promise<void> => {
  const s = scope(req as RequestWithAdmin, res);
  if (!s) return;
  await present(s.tenantId, s.kind, res);
});

router.put(
  "/kind-templates/:kind",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const s = scope(req as RequestWithAdmin, res);
    if (!s) return;
    const parsed = SaveKindTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      await saveKindTemplate(
        s.tenantId,
        s.kind,
        parsed.data.baseVersion,
        parsed.data.document,
        (req as RequestWithAdmin).admin?.id ?? null,
      );
    } catch (err) {
      fail(res, err);
      return;
    }
    logger.info({ tenantId: s.tenantId, kind: s.kind }, "kind template saved");
    await present(s.tenantId, s.kind, res);
  },
);

router.post(
  "/kind-templates/:kind/start",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const s = scope(req as RequestWithAdmin, res);
    if (!s) return;
    const parsed = StartKindTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      await startKindTemplate(
        s.tenantId,
        s.kind,
        parsed.data.starter,
        parsed.data.baseVersion,
        (req as RequestWithAdmin).admin?.id ?? null,
      );
    } catch (err) {
      fail(res, err);
      return;
    }
    await present(s.tenantId, s.kind, res);
  },
);

router.post(
  "/kind-templates/:kind/dismiss-notice",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const s = scope(req as RequestWithAdmin, res);
    if (!s) return;
    try {
      await dismissKindTemplateNotice(s.tenantId, s.kind);
    } catch (err) {
      fail(res, err);
      return;
    }
    res.status(204).end();
  },
);

router.post(
  "/kind-templates/:kind/apply",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const s = scope(req as RequestWithAdmin, res);
    if (!s) return;
    const parsed = ApplyKindTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const result = await applyKindTemplate(
        s.tenantId,
        s.kind,
        parsed.data.version,
        parsed.data.expectedDrafts,
      );
      logger.info({ tenantId: s.tenantId, kind: s.kind, ...result }, "kind template applied");
      res.json(result);
    } catch (err) {
      fail(res, err);
    }
  },
);

export default router;
