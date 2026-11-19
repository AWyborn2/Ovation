import { redactRenderRequest } from "../lib/junior-name-redaction";
import { Router, type IRouter } from "express";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream";
import { stat } from "node:fs/promises";
import { CreateCardVideoJobBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { createJob, getJob, publicJob } from "../lib/card-video-jobs";
import { harnessOriginFromHeaders } from "../lib/card-video-renderer";

const router: IRouter = Router();

// Start a server-side MP4 render of the EXACT card the browser previews. The
// social/video studio is a paid feature (gated; pass-through while billing is
// dormant).
router.post(
  "/card-video/jobs",
  requireAdmin,
  requireEntitlement("socialStudio"),
  async (req, res): Promise<void> => {
    const parsed = CreateCardVideoJobBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { fps, format, scale } = parsed.data;
    const tenantId = getTenantId(req);
    // A junior clip downloads with today's privacy (round 3 retest, P0 2).
    const { input, options } = await redactRenderRequest(
      tenantId,
      parsed.data.input,
      parsed.data.options,
    );
    const [tenant] = await db
      .select({ slug: tenantsTable.slug })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));
    const job = createJob(
      tenantId,
      input,
      options,
      fps ?? undefined,
      harnessOriginFromHeaders(req.headers),
      tenant?.slug ?? "ovation",
      { format, scale },
    );
    res.status(201).json(publicJob(job));
  },
);

// Poll a render job's status/progress.
router.get("/card-video/jobs/:id", requireAdmin, async (req, res): Promise<void> => {
  const job = getJob(String(req.params.id));
  // Scope by tenant so a job UUID leaked from another club (logs, a shared
  // screenshot) can't be polled or downloaded across tenants.
  if (!job || job.tenantId !== getTenantId(req)) {
    res.status(404).json({ error: "Unknown job" });
    return;
  }
  res.json(publicJob(job));
});

// Stream the finished MP4 or GIF.
router.get("/card-video/jobs/:id/download", requireAdmin, async (req, res): Promise<void> => {
  const job = getJob(String(req.params.id));
  if (!job || job.tenantId !== getTenantId(req) || job.status !== "done" || !job.filePath) {
    res.status(404).json({ error: "Unknown job or not yet finished" });
    return;
  }
  let size: number;
  try {
    size = (await stat(job.filePath)).size;
  } catch {
    res.status(404).json({ error: "Rendered file is no longer available" });
    return;
  }
  res.setHeader("Content-Type", job.contentType);
  res.setHeader("Content-Length", String(size));
  res.setHeader("Content-Disposition", `attachment; filename="${job.filename ?? `${job.id}.mp4`}"`);
  // pipeline, not pipe: a read error must not stop the process (round 6).
  pipeline(createReadStream(job.filePath), res, (err) => {
    if (err) res.destroy(err);
  });
});

export default router;
