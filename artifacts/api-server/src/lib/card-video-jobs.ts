import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { renderCardVideo } from "./card-video-renderer";
import { logger } from "./logger";

export type JobStatus = "queued" | "rendering" | "encoding" | "done" | "error";

export type CardVideoJob = {
  id: string;
  status: JobStatus;
  progress: number;
  error: string | null;
  filename: string | null;
  sizeCode: string | null;
  filePath: string | null;
  createdAt: number;
};

// Finished/abandoned jobs are pruned after this long so tmp files don't pile up.
const JOB_TTL_MS = 30 * 60 * 1000;

const jobs = new Map<string, CardVideoJob>();

// Serialize renders so concurrent admin requests never spawn a fleet of
// Chromium tabs at once (a single shared browser, one render at a time).
let renderChain: Promise<void> = Promise.resolve();

function prune(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt < JOB_TTL_MS) continue;
    jobs.delete(id);
    if (job.filePath) {
      rm(job.filePath, { force: true }).catch(() => {});
    }
  }
}

// Public view (no internal file path) — matches the OpenAPI CardVideoJob schema.
export function publicJob(job: CardVideoJob): Omit<CardVideoJob, "filePath" | "createdAt"> {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    error: job.error,
    filename: job.filename,
    sizeCode: job.sizeCode,
  };
}

export function getJob(id: string): CardVideoJob | undefined {
  return jobs.get(id);
}

// Derive a friendly filename + size code from the opaque options/input JSON.
function deriveMeta(
  input: unknown,
  options: unknown,
): { filename: string; sizeCode: string } {
  const opts = (options ?? {}) as { size?: string };
  const size = typeof opts.size === "string" ? opts.size : "square";
  const sizeCode =
    size === "portrait" ? "4x5" : size === "story" ? "9x16" : "1x1";
  const inp = (input ?? {}) as { kind?: string; junior?: boolean };
  const kind = typeof inp.kind === "string" ? inp.kind : "card";
  const prefix = inp.junior ? "hhcc-junior" : "hhcc";
  return { filename: `${prefix}-${kind}-${sizeCode}.mp4`, sizeCode };
}

export function createJob(input: unknown, options: unknown, fps?: number): CardVideoJob {
  prune();
  const id = randomUUID();
  const { filename, sizeCode } = deriveMeta(input, options);
  const job: CardVideoJob = {
    id,
    status: "queued",
    progress: 0,
    error: null,
    filename,
    sizeCode,
    filePath: null,
    createdAt: Date.now(),
  };
  jobs.set(id, job);

  // Queue the actual render behind any in-flight render.
  renderChain = renderChain
    .catch(() => {})
    .then(async () => {
      const current = jobs.get(id);
      if (!current) return; // pruned/cancelled before it ran
      current.status = "rendering";
      try {
        const result = await renderCardVideo({
          jobId: id,
          input,
          options,
          fps: fps ?? undefined,
          onProgress: (p) => {
            const j = jobs.get(id);
            if (!j) return;
            j.progress = Math.max(0, Math.min(1, p));
            j.status = p >= 0.95 ? "encoding" : "rendering";
          },
        });
        const j = jobs.get(id);
        if (!j) {
          // Job was pruned mid-render; drop the orphaned file.
          await rm(result.filePath, { force: true }).catch(() => {});
          return;
        }
        j.filePath = result.filePath;
        j.progress = 1;
        j.status = "done";
      } catch (err) {
        logger.error({ err, jobId: id }, "card-video render failed");
        const j = jobs.get(id);
        if (j) {
          j.status = "error";
          j.error =
            err instanceof Error ? err.message : "Video render failed";
        }
      }
    });

  return job;
}
