import { Router, type IRouter } from "express";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { CreateCardVideoJobBody } from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { createJob, getJob, publicJob } from "../lib/card-video-jobs";

const router: IRouter = Router();

// Start a server-side MP4 render of the EXACT card the browser previews.
router.post(
  "/card-video/jobs",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = CreateCardVideoJobBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { input, options, fps } = parsed.data;
    const job = createJob(input, options, fps ?? undefined);
    res.status(201).json(publicJob(job));
  },
);

// Poll a render job's status/progress.
router.get(
  "/card-video/jobs/:id",
  requireAdmin,
  async (req, res): Promise<void> => {
    const job = getJob(String(req.params.id));
    if (!job) {
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
    if (!job || job.status !== "done" || !job.filePath) {
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
