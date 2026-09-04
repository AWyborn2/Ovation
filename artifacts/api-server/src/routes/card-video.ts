import { Router, type IRouter } from "express";
import { createReadStream } from "node:fs";
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
    const { input, options, fps } = parsed.data;
    const tenantId = getTenantId(req);
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
    );
    res.status(201).json(publicJob(job));
  },
);

// Poll a render job's status/progress.
router.get(
  "/card-video/jobs/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const job = getJob(String(req.params.id));
    // Scope by tenant so a job UUID leaked from another club (logs, a shared
    // screenshot) can't be polled or downloaded across tenants.
    if (!job || job.tenantId !== getTenantId(req)) {
      res.status(404).json({ error: "Unknown job" });
      return;
    }
    res.json(publicJob(job));
  },
);

// Stream the finished MP4.
router.get(
  "/card-video/jobs/:id/download",
  requireAdmin,
  async (req, res): Promise<void> => {
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
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Length", String(size));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${job.filename ?? `${job.id}.mp4`}"`,
    );
    createReadStream(job.filePath).pipe(res);
  },
);

export default router;
