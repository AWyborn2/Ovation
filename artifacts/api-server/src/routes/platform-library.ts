/**
 * The platform console's template library (ADR-011 §12 "Platform admin",
 * L7-A, T7.1). Platform admins only: every library template listed or not,
 * console templates and their versions, listing and unlisting, looks, and
 * the Figma import (L8-B), and element moderation (editable-elements plan, D5).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateConsoleLibraryLookBody,
  ImportFigmaTemplateBody,
  CreateConsoleLibraryTemplateBody,
  DuplicateConsoleLibraryTemplateBody,
  SaveConsoleLibraryTemplateBody,
  UnlistConsoleLibraryElementBody,
  UnlistConsoleLibraryTemplateBody,
} from "@workspace/api-zod";
import {
  requirePlatformAdmin,
  type RequestWithPlatformAdmin,
} from "../middlewares/require-platform-admin";
import {
  createConsoleTemplate,
  createLook,
  duplicateLibraryTemplate,
  getConsoleTemplate,
  listConsoleLooks,
  listConsoleTemplates,
  listTemplate,
  saveConsoleTemplate,
  unlistTemplate,
} from "../lib/template-library/console";
import {
  dismissTemplateReports,
  listTemplateReports,
} from "../lib/template-library/template-moderation";
import {
  dismissElementReports,
  listConsoleElements,
  listElementReports,
  relistElement,
  unlistElementAsOvation,
} from "../lib/template-library/element-moderation";
import { TemplateLibraryError } from "../lib/template-library/errors";
import { FigmaError } from "../lib/template-import/figma";
import { figmaErrorStatus, importFromFigma } from "../lib/template-import/figma-import";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ORIGINS = ["bundle", "console", "club"] as const;

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

const adminId = (req: Request) => (req as RequestWithPlatformAdmin).platformAdmin?.id ?? null;

router.get(
  "/platform/admin/library/templates",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const { kind, origin, listed, reported } = req.query;
    if (origin !== undefined && !ORIGINS.includes(origin as (typeof ORIGINS)[number])) {
      res.status(400).json({ error: "origin is bundle, console or club." });
      return;
    }
    if (listed !== undefined && listed !== "true" && listed !== "false") {
      res.status(400).json({ error: "listed is true or false." });
      return;
    }
    if (reported !== undefined && reported !== "true" && reported !== "false") {
      res.status(400).json({ error: "reported is true or false." });
      return;
    }
    const templates = await listConsoleTemplates({
      kind: typeof kind === "string" && kind ? kind : undefined,
      origin: origin as (typeof ORIGINS)[number] | undefined,
      listed: listed === undefined ? undefined : listed === "true",
      reported: reported === "true",
    });
    res.json({ templates });
  },
);

router.post(
  "/platform/admin/library/templates",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const parsed = CreateConsoleLibraryTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const t = await createConsoleTemplate(parsed.data, adminId(req));
      logger.info({ templateId: t.id, kind: t.kind }, "console template created");
      res.status(201).json(t);
    } catch (err) {
      fail(res, err);
    }
  },
);

router.get(
  "/platform/admin/library/templates/:id",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = idParam(req, res);
    if (id === null) return;
    try {
      res.json(await getConsoleTemplate(id));
    } catch (err) {
      fail(res, err);
    }
  },
);

router.put(
  "/platform/admin/library/templates/:id",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = idParam(req, res);
    if (id === null) return;
    const parsed = SaveConsoleLibraryTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const t = await saveConsoleTemplate(id, parsed.data, adminId(req));
      logger.info({ templateId: id, version: t.version }, "console template saved");
      res.json(t);
    } catch (err) {
      fail(res, err);
    }
  },
);

router.post(
  "/platform/admin/library/templates/:id/duplicate",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = idParam(req, res);
    if (id === null) return;
    const parsed = DuplicateConsoleLibraryTemplateBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const t = await duplicateLibraryTemplate(id, parsed.data, adminId(req));
      logger.info({ from: id, templateId: t.id }, "library template duplicated");
      res.status(201).json(t);
    } catch (err) {
      fail(res, err);
    }
  },
);

router.post(
  "/platform/admin/library/templates/:id/list",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = idParam(req, res);
    if (id === null) return;
    try {
      const t = await listTemplate(id);
      logger.info({ templateId: id, version: t.version }, "library template listed");
      res.json(t);
    } catch (err) {
      fail(res, err);
    }
  },
);

router.post(
  "/platform/admin/library/templates/:id/unlist",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = idParam(req, res);
    if (id === null) return;
    const parsed = UnlistConsoleLibraryTemplateBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const t = await unlistTemplate(id, parsed.data);
      logger.info({ templateId: id }, "library template unlisted");
      res.json(t);
    } catch (err) {
      fail(res, err);
    }
  },
);

// Clubs' reports of a template, open first (release 2, ADR-012 R2-C).
router.get(
  "/platform/admin/library/templates/:id/reports",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = idParam(req, res);
    if (id === null) return;
    try {
      res.json(await listTemplateReports(id));
    } catch (err) {
      fail(res, err);
    }
  },
);

router.post(
  "/platform/admin/library/templates/:id/reports/dismiss",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = idParam(req, res);
    if (id === null) return;
    try {
      await dismissTemplateReports(id);
      logger.info({ templateId: id }, "library template reports dismissed");
      res.status(204).end();
    } catch (err) {
      fail(res, err);
    }
  },
);

router.get(
  "/platform/admin/library/looks",
  requirePlatformAdmin,
  async (_req, res): Promise<void> => {
    res.json({ looks: await listConsoleLooks() });
  },
);

router.post(
  "/platform/admin/library/looks",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const parsed = CreateConsoleLibraryLookBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const look = await createLook(parsed.data);
      logger.info({ lookId: look.id, slug: look.slug }, "console look created");
      res.status(201).json(look);
    } catch (err) {
      fail(res, err);
    }
  },
);

// ── Figma import (L8-B) ─────────────────────────────────────────────────────

router.post(
  "/platform/admin/library/import/figma",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const parsed = ImportFigmaTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const out = await importFromFigma(parsed.data, adminId(req));
      logger.info(
        { templateId: out.template.id, kind: out.template.kind, ...out.rendered },
        "Figma design imported",
      );
      res.status(201).json(out);
    } catch (err) {
      if (err instanceof FigmaError) {
        // The message is written for the designer and never holds the token.
        res.status(figmaErrorStatus(err)).json({ error: err.message, code: err.code });
        return;
      }
      fail(res, err);
    }
  },
);

// ── Element moderation (D5) ─────────────────────────────────────────────────

/** A boolean query flag as written ("true" / "false"), or an error. */
function flagParam(value: unknown, name: string): boolean | undefined | Error {
  if (value === undefined) return undefined;
  if (value === "true" || value === "false") return value === "true";
  return new Error(`${name} is true or false.`);
}

router.get(
  "/platform/admin/library/elements",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const { q, origin, page } = req.query;
    const reported = flagParam(req.query.reported, "reported");
    const listed = flagParam(req.query.listed, "listed");
    for (const flag of [reported, listed]) {
      if (flag instanceof Error) {
        res.status(400).json({ error: flag.message });
        return;
      }
    }
    if (origin !== undefined && !ORIGINS.includes(origin as (typeof ORIGINS)[number])) {
      res.status(400).json({ error: "origin is bundle, console or club." });
      return;
    }
    const pageNo = page === undefined ? 1 : Number(page);
    if (!Number.isInteger(pageNo) || pageNo < 1) {
      res.status(400).json({ error: "page is a whole number from 1." });
      return;
    }
    res.json(
      await listConsoleElements({
        q: typeof q === "string" ? q.slice(0, 60) : undefined,
        origin: origin as (typeof ORIGINS)[number] | undefined,
        reported: reported as boolean | undefined,
        listed: listed as boolean | undefined,
        page: pageNo,
      }),
    );
  },
);

router.get(
  "/platform/admin/library/elements/:id/reports",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = idParam(req, res);
    if (id === null) return;
    try {
      res.json({ reports: await listElementReports(id) });
    } catch (err) {
      fail(res, err);
    }
  },
);

router.post(
  "/platform/admin/library/elements/:id/unlist",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = idParam(req, res);
    if (id === null) return;
    const parsed = UnlistConsoleLibraryElementBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    try {
      const element = await unlistElementAsOvation(id, parsed.data.reason);
      logger.info({ elementId: id, by: adminId(req) }, "library element unlisted by Ovation");
      res.json(element);
    } catch (err) {
      fail(res, err);
    }
  },
);

router.post(
  "/platform/admin/library/elements/:id/list",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = idParam(req, res);
    if (id === null) return;
    try {
      const element = await relistElement(id);
      logger.info({ elementId: id, by: adminId(req) }, "library element listed again");
      res.json(element);
    } catch (err) {
      fail(res, err);
    }
  },
);

router.post(
  "/platform/admin/library/elements/:id/reports/dismiss",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = idParam(req, res);
    if (id === null) return;
    try {
      res.json(await dismissElementReports(id));
    } catch (err) {
      fail(res, err);
    }
  },
);

export default router;
