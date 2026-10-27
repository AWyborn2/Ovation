/**
 * Club Generate (template library release 2, ADR-012 R2-D): a club admin
 * designs a private club template with AI from a brief and an optional
 * reference image, and follows it until it is saved.
 *
 *   GET  /club-templates/generations      the club's designs, and how many are left this month
 *   POST /club-templates/generations      multipart: kind, brief, image?
 *   GET  /club-templates/generations/:id  one of the club's designs
 *
 * Admins with Social Studio, tenant-scoped. Offered only when the designer is
 * configured, its first 50 console designs reached the quality bar and
 * Ovation's switch is on; otherwise 503 `generate_unavailable`. Only the
 * brief, the uploaded image and the kind's invented sample reach the model:
 * a library photo is refused, and the image is never stored.
 *
 * Mounted before the template library router, whose `/club-templates/:id`
 * would otherwise take these paths.
 */
import { Router, type IRouter, type Request } from "express";
import type { TemplateGenerationRow } from "@workspace/db";
import { TEMPLATE_CARD_KINDS } from "@workspace/scorecard/kind-templates";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { prepareReferenceImage, ReferenceImageError } from "../lib/template-ai/images";
import {
  CLUB_GENERATE_LIMIT,
  clubGenerateStatus,
  GenerateLimitError,
  generationErrors,
  generationsRemaining,
  getClubGeneration,
  listClubGenerations,
  startGeneration,
} from "../lib/template-ai/jobs";
import { MAX_BRIEF } from "../lib/template-ai/prompt";
import { imageUpload, LIBRARY_IMAGE_FIELDS } from "./template-designer";

const router: IRouter = Router();

const club = [requireAdmin, requireEntitlement("socialStudio")] as const;

const UNAVAILABLE = {
  error: "AI designs aren't available yet.",
  code: "generate_unavailable",
} as const;

/** A design as the club sees it: no model, tokens or cost. */
export function clubGenerationView(row: TemplateGenerationRow) {
  const result = row.resultRef as { copyId?: number } | null;
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    outcome: row.outcome,
    attempts: row.attempts,
    result: result?.copyId !== undefined ? { copyId: result.copyId } : null,
    errors: generationErrors(row),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}

router.get("/club-templates/generations", ...club, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  try {
    const [status, remaining, rows] = await Promise.all([
      clubGenerateStatus(),
      generationsRemaining(tenantId),
      listClubGenerations(tenantId),
    ]);
    res.json({
      available: status.available,
      limit: CLUB_GENERATE_LIMIT,
      remaining,
      generations: rows.map(clubGenerationView),
    });
  } catch (err) {
    req.log.error({ err }, "club Generate list failed");
    res.status(500).json({ error: "Couldn't load your designs." });
  }
});

router.post(
  "/club-templates/generations",
  ...club,
  imageUpload,
  async (req, res): Promise<void> => {
    const tenantId = getTenantId(req);
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
    try {
      if (!(await clubGenerateStatus()).available) {
        res.status(503).json(UNAVAILABLE);
        return;
      }
      const prepared = file ? await prepareReferenceImage(file.buffer) : null;
      const row = await startGeneration({
        input: { kind, brief, image: prepared?.image ?? null },
        tenantId,
        adminId: (req as RequestWithAdmin).admin?.id ?? null,
        imageSha256: prepared?.sha256 ?? null,
      });
      res.status(202).json(clubGenerationView(row));
    } catch (err) {
      if (err instanceof ReferenceImageError) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof GenerateLimitError) {
        res.status(429).json({
          error: `Your club has used this month's ${err.limit} AI designs. More are available next month.`,
          limit: err.limit,
          remaining: 0,
        });
        return;
      }
      req.log.error({ err }, "club Generate: start failed");
      res.status(500).json({ error: "Couldn't start the design." });
    }
  },
);

router.get("/club-templates/generations/:id", ...club, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const row = await getClubGeneration(getTenantId(req), id);
  if (!row) {
    res.status(404).json({ error: "No such design." });
    return;
  }
  res.json(clubGenerationView(row));
});

export default router;
