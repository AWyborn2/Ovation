/**
 * Template library and club template API (ADR-011 §12, T3.8, T3.9).
 *
 * Admin-only. Library reads (`/template-library*`) never return any club's
 * templates; club template routes (`/club-templates*`) read and write only the
 * requesting club's rows. Writes need the `socialStudio` entitlement.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  AdoptLibraryLookParams,
  AssembleCarouselTemplateBody,
  ApplyClubTemplateBody,
  CreateBlankClubTemplateBody,
  CreateClubTemplateBody,
  GetTemplatePreviewInputQueryParams,
  ListClubTemplatesQueryParams,
  ListLibraryTemplatesQueryParams,
  MakeCarouselSetBody,
  PublishClubTemplateBody,
  SaveClubTemplateBody,
  TakeClubTemplateUpdateBody,
} from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { isTemplateKind } from "../lib/kind-templates";
import { PAGE_KEYS, type PageKey } from "@workspace/scorecard/kind-templates";
import {
  adoptLook,
  applyCopy,
  createCopy,
  deleteCopy,
  duplicateCopy,
  listClubTemplates,
  loadCopy,
  presentCopy,
  saveCopy,
  setDefaultCopy,
  takeUpdate,
} from "../lib/template-library/copies";
import { TemplateLibraryError } from "../lib/template-library/errors";
import {
  createBlankCopy,
  publishCopy,
  publishPreview,
  unlistOwnTemplate,
} from "../lib/template-library/publish";
import { makeSetCopy } from "../lib/template-library/set-design";
import { previewInputFor } from "../lib/template-library/preview";
import { assembleCarouselPages, setTemplateKind } from "../lib/template-library/draw";
import { resolveDraftPack } from "../lib/draft-enrich";
import {
  getLibraryTemplate,
  listLibraryLooks,
  listLibraryTemplates,
} from "../lib/template-library/store";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const writes = [requireAdmin, requireEntitlement("socialStudio")] as const;

/** Answer a known library error, or rethrow. */
function fail(res: Response, err: unknown): void {
  if (err instanceof TemplateLibraryError) {
    res.status(err.status).json(err.body);
    return;
  }
  throw err;
}

/** A positive integer path id, or null after answering 404. */
function idParam(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ error: "Not found." });
    return null;
  }
  return id;
}

const adminId = (req: Request) => (req as RequestWithAdmin).admin?.id ?? null;

// ── Library ─────────────────────────────────────────────────────────────────

router.get("/template-library", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListLibraryTemplatesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json(await listLibraryTemplates(parsed.data, getTenantId(req)));
});

router.get("/template-library/looks", requireAdmin, async (_req, res): Promise<void> => {
  res.json({ looks: await listLibraryLooks() });
});

router.get("/template-library/preview-input", requireAdmin, async (req, res): Promise<void> => {
  const parsed = GetTemplatePreviewInputQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isTemplateKind(parsed.data.kind)) {
    res.status(404).json({ error: "Unknown card kind." });
    return;
  }
  res.json(await previewInputFor(getTenantId(req), parsed.data.kind));
});

// A carousel set's assembled document, for the Weekend Carousel's preview (T5.17).
router.post(
  "/template-library/carousel-assembly",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = AssembleCarouselTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { setType, pages, templateRef } = parsed.data;
    const known = new Set<string>(PAGE_KEYS);
    const unknown = pages.find((p) => !known.has(p));
    if (unknown !== undefined) {
      res.status(400).json({ error: `"${unknown.slice(0, 30)}" isn't a template page.` });
      return;
    }
    const tenantId = getTenantId(req);
    try {
      res.json(
        await assembleCarouselPages(tenantId, setType, pages as PageKey[], {
          templateRef: templateRef ?? null,
          packId: await resolveDraftPack(tenantId, setTemplateKind(setType)),
        }),
      );
    } catch (err) {
      fail(res, err);
    }
  },
);

router.post("/template-library/looks/:id/adopt", ...writes, async (req, res): Promise<void> => {
  const parsed = AdoptLibraryLookParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const tenantId = getTenantId(req);
  try {
    const result = await adoptLook(tenantId, parsed.data.id, adminId(req));
    logger.info(
      { tenantId, lookId: parsed.data.id, changed: result.changed.length },
      "look adopted",
    );
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

router.get("/template-library/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = idParam(req, res);
  if (id === null) return;
  try {
    res.json(await getLibraryTemplate(getTenantId(req), id));
  } catch (err) {
    fail(res, err);
  }
});

// The club takes a template it published out of the library (release 2, ADR-012).
router.post("/template-library/:id/unlist", ...writes, async (req, res): Promise<void> => {
  const id = idParam(req, res);
  if (id === null) return;
  const tenantId = getTenantId(req);
  try {
    const view = await unlistOwnTemplate(tenantId, id);
    logger.info({ tenantId, libraryTemplateId: id }, "club template unlisted by its author");
    res.json(view);
  } catch (err) {
    fail(res, err);
  }
});

// ── Club templates ──────────────────────────────────────────────────────────

router.get("/club-templates", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListClubTemplatesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  res.json({
    templates: await listClubTemplates(getTenantId(req), parsed.data.kind, {
      includeSets: parsed.data.includeSets === true,
    }),
  });
});

// Make a carousel set design from one template, or a look's set (carousel set editor plan, part 4).
router.post("/club-templates/sets", ...writes, async (req, res): Promise<void> => {
  const parsed = MakeCarouselSetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await makeSetCopy(getTenantId(req), parsed.data, adminId(req));
    res.status(201).json(await presentCopy(row));
  } catch (err) {
    fail(res, err);
  }
});

// A blank canvas for a kind (release 2).
router.post("/club-templates/blank", ...writes, async (req, res): Promise<void> => {
  const parsed = CreateBlankClubTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await createBlankCopy(getTenantId(req), parsed.data, adminId(req));
    res.status(201).json(await presentCopy(row));
  } catch (err) {
    fail(res, err);
  }
});

router.post("/club-templates", ...writes, async (req, res): Promise<void> => {
  const parsed = CreateClubTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await createCopy(getTenantId(req), parsed.data, adminId(req));
    res.status(201).json(await presentCopy(row));
  } catch (err) {
    fail(res, err);
  }
});

router.get("/club-templates/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = idParam(req, res);
  if (id === null) return;
  try {
    res.json(await presentCopy(await loadCopy(getTenantId(req), id)));
  } catch (err) {
    fail(res, err);
  }
});

router.get("/club-templates/:id/publish-preview", requireAdmin, async (req, res): Promise<void> => {
  const id = idParam(req, res);
  if (id === null) return;
  try {
    res.json(await publishPreview(getTenantId(req), id));
  } catch (err) {
    fail(res, err);
  }
});

// Publish to every club: create or version its library template, then the fit check (ADR-012).
router.post("/club-templates/:id/publish", ...writes, async (req, res): Promise<void> => {
  const id = idParam(req, res);
  if (id === null) return;
  const parsed = PublishClubTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  try {
    const result = await publishCopy(tenantId, id, parsed.data, adminId(req));
    logger.info({ tenantId, copyId: id, ...result }, "club template published");
    res.status(202).json(result);
  } catch (err) {
    fail(res, err);
  }
});

router.put("/club-templates/:id", ...writes, async (req, res): Promise<void> => {
  const id = idParam(req, res);
  if (id === null) return;
  const parsed = SaveClubTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await saveCopy(getTenantId(req), id, parsed.data, adminId(req));
    res.json(await presentCopy(row));
  } catch (err) {
    fail(res, err);
  }
});

router.delete("/club-templates/:id", ...writes, async (req, res): Promise<void> => {
  const id = idParam(req, res);
  if (id === null) return;
  try {
    await deleteCopy(getTenantId(req), id);
    res.status(204).end();
  } catch (err) {
    fail(res, err);
  }
});

router.post("/club-templates/:id/duplicate", ...writes, async (req, res): Promise<void> => {
  const id = idParam(req, res);
  if (id === null) return;
  try {
    const row = await duplicateCopy(getTenantId(req), id, adminId(req));
    res.status(201).json(await presentCopy(row));
  } catch (err) {
    fail(res, err);
  }
});

router.post("/club-templates/:id/default", ...writes, async (req, res): Promise<void> => {
  const id = idParam(req, res);
  if (id === null) return;
  try {
    res.json(await presentCopy(await setDefaultCopy(getTenantId(req), id)));
  } catch (err) {
    fail(res, err);
  }
});

router.post("/club-templates/:id/update", ...writes, async (req, res): Promise<void> => {
  const id = idParam(req, res);
  if (id === null) return;
  const parsed = TakeClubTemplateUpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const row = await takeUpdate(getTenantId(req), id, parsed.data.baseVersion, adminId(req));
    res.json(await presentCopy(row));
  } catch (err) {
    fail(res, err);
  }
});

router.post("/club-templates/:id/apply", ...writes, async (req, res): Promise<void> => {
  const id = idParam(req, res);
  if (id === null) return;
  const parsed = ApplyClubTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tenantId = getTenantId(req);
  try {
    const result = await applyCopy(tenantId, id, parsed.data.version, parsed.data.expectedDrafts);
    logger.info({ tenantId, copyId: id, ...result }, "club template applied");
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

export default router;
