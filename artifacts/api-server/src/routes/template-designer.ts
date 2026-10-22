/**
 * The platform console's AI designer (ADR-011 §8, L7-B): start a design from a
 * brief and an optional reference image, and follow it until it is saved as
 * an unlisted console template in the library.
 *
 *   GET  /platform/admin/library/designer                  configured?, quality, recent designs
 *   POST /platform/admin/library/designer/generations      multipart: kind, brief, image?
 *   GET  /platform/admin/library/designer/generations/:id  one design
 *
 * Platform admins only. The reference image must be an upload: a request
 * naming a library photo is refused (T7.9).
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import type { TemplateGenerationRow } from "@workspace/db";
import { TEMPLATE_CARD_KINDS } from "@workspace/scorecard/kind-templates";
import {
  requirePlatformAdmin,
  type RequestWithPlatformAdmin,
} from "../middlewares/require-platform-admin";
import {
  MAX_REFERENCE_BYTES,
  prepareReferenceImage,
  ReferenceImageError,
} from "../lib/template-ai/images";
import {
  generationErrors,
  generationQuality,
  getGeneration,
  listGenerations,
  startGeneration,
} from "../lib/template-ai/jobs";
import { MAX_BRIEF } from "../lib/template-ai/prompt";
import { TEMPLATE_AI_MODEL, templateAiProvider } from "../lib/template-ai/provider";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_REFERENCE_BYTES, files: 1, fields: 8, fieldSize: 16 * 1024 },
});

/** The image field, with multer's limits answered as 413 / 400 rather than 500. */
function imageUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single("image")(req, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as { code?: string }).code;
    if (code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "The image can be at most 5 MB." });
      return;
    }
    res.status(400).json({ error: "Send the brief and at most one image as a form." });
  });
}

/** Fields that would pick an image from somewhere other than the admin's upload. */
const LIBRARY_IMAGE_FIELDS = ["photoId", "libraryPhotoId", "photoUrl", "imageUrl", "image"];

/** A design as the console sees it. */
export function generationView(row: TemplateGenerationRow) {
  const result = row.resultRef as { libraryTemplateId?: number; version?: number } | null;
  return {
    id: row.id,
    kind: row.kind,
    model: row.model,
    status: row.status,
    outcome: row.outcome,
    attempts: row.attempts,
    firstTryFit: row.firstTryFit,
    tokens: {
      input: row.inputTokens ?? 0,
      output: row.outputTokens ?? 0,
      cacheRead: row.cacheReadTokens ?? 0,
      cacheWrite: row.cacheWriteTokens ?? 0,
    },
    costUsd: row.costMicros === null ? null : row.costMicros / 1e6,
    result:
      result?.libraryTemplateId !== undefined && result.version !== undefined
        ? { libraryTemplateId: result.libraryTemplateId, version: result.version }
        : null,
    errors: generationErrors(row.id),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

router.get(
  "/platform/admin/library/designer",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    try {
      const [rows, quality] = await Promise.all([listGenerations(20), generationQuality()]);
      res.json({
        configured: templateAiProvider() !== null,
        model: TEMPLATE_AI_MODEL,
        quality: {
          counted: quality.counted,
          firstTryFit: quality.firstTryFit,
          meanCostUsd: quality.meanCostMicros === null ? null : quality.meanCostMicros / 1e6,
        },
        generations: rows.map(generationView),
      });
    } catch (err) {
      req.log.error({ err }, "AI designer overview failed");
      res.status(500).json({ error: "Couldn't load the designer." });
    }
  },
);

router.post(
  "/platform/admin/library/designer/generations",
  requirePlatformAdmin,
  imageUpload,
  async (req, res): Promise<void> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (LIBRARY_IMAGE_FIELDS.some((f) => body[f] !== undefined && body[f] !== "")) {
      res.status(400).json({
        error:
          "Reference images must be uploaded from your computer; library photos can't be sent.",
      });
      return;
    }
    const kind = typeof body.kind === "string" ? body.kind : "";
    if (!(TEMPLATE_CARD_KINDS as readonly string[]).includes(kind)) {
      res.status(400).json({ error: "Pick a card kind." });
      return;
    }
    const brief = typeof body.brief === "string" ? body.brief.trim() : "";
    if (brief.length > MAX_BRIEF) {
      res.status(400).json({ error: `The brief can be at most ${MAX_BRIEF} characters.` });
      return;
    }
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!brief && !file) {
      res.status(400).json({ error: "Write a brief, upload a reference image, or both." });
      return;
    }
    if (!templateAiProvider()) {
      res.status(503).json({ error: "The AI designer isn't configured (no ANTHROPIC_API_KEY)." });
      return;
    }
    try {
      const prepared = file ? await prepareReferenceImage(file.buffer) : null;
      const row = await startGeneration({
        input: { kind, brief, image: prepared?.image ?? null },
        adminId: (req as RequestWithPlatformAdmin).platformAdmin?.id ?? null,
        imageSha256: prepared?.sha256 ?? null,
      });
      res.status(202).json(generationView(row));
    } catch (err) {
      if (err instanceof ReferenceImageError) {
        res.status(400).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "AI designer: start failed");
      res.status(500).json({ error: "Couldn't start the design." });
    }
  },
);

router.get(
  "/platform/admin/library/designer/generations/:id",
  requirePlatformAdmin,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const row = await getGeneration(id);
    if (!row) {
      res.status(404).json({ error: "No such design." });
      return;
    }
    res.json(generationView(row));
  },
);

export default router;
