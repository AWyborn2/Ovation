import { timingSafeEqual } from "node:crypto";
import express, {
  Router,
  type IRouter,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { IngestPlayhqDumpBody } from "@workspace/api-zod";
import { IngestNotConfiguredError, type Dump } from "@workspace/db/playhq-ingest";
import { ingestPlayhqDump, listDuePlans } from "../lib/playhq-ingest";
import { env } from "../config";

/**
 * The scheduled PlayHQ sync's two machine-to-machine endpoints:
 *   - `GET  /api/internal/playhq/plans`  — which harness plans are due now (the runner asks hourly);
 *   - `POST /api/internal/playhq/ingest` — where every collector (the scheduled headless runner,
 *     a hand-run upload, later the public-API collector) hands over a harness dump.
 *
 * Mounted BEFORE the tenant-context middleware and the global 100kb JSON parser (app.ts):
 * tenants come from the dump's organisations, the only credential is the shared sync
 * secret, and dumps are large, so this route parses its own body with a higher ceiling —
 * and only AFTER the secret checks out, so an unauthenticated caller can never make the
 * server inflate and parse a large body. body-parser inflates `Content-Encoding: gzip`, and
 * the limit applies to the inflated JSON. No secret configured means the endpoint is closed.
 */
const router: IRouter = Router();

function secretMatches(req: Request): boolean {
  const expected = env.PLAYHQ_SYNC_SECRET();
  const given = req.get("x-sync-secret");
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function requireSyncSecret(req: Request, res: Response, next: NextFunction): void {
  if (secretMatches(req)) next();
  else res.status(401).json({ error: "unauthorized" });
}

function sendUnavailable(req: Request, res: Response, err: unknown): boolean {
  if (!(err instanceof IngestNotConfiguredError)) return false;
  req.log.error({ err }, "playhq sync unavailable");
  res.status(503).json({ error: err.message });
  return true;
}

/** `GET /api/internal/playhq/plans` — what the hourly runner should collect right now. */
router.get("/plans", requireSyncSecret, async (req, res): Promise<void> => {
  try {
    res.json(await listDuePlans(new Date()));
  } catch (err) {
    if (sendUnavailable(req, res, err)) return;
    req.log.error({ err }, "playhq due plans failed");
    res.status(500).json({ error: "due plans failed" });
  }
});

/** Decompressed-JSON ceiling for one dump (a match day of scorecards runs to megabytes). */
const DUMP_LIMIT = "50mb";

router.post(
  "/ingest",
  requireSyncSecret,
  express.json({ limit: DUMP_LIMIT }),
  async (req, res): Promise<void> => {
    const parsed = IngestPlayhqDumpBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // The schema validates the envelope only. Its record objects drop unknown keys, and a
    // record's payload lives in exactly those keys (`data`, `meta`), so load the dump as sent.
    const dump = (req.body as { dump: Dump }).dump;

    try {
      const result = await ingestPlayhqDump({ ...parsed.data, dump }, req.log);
      res.json(result);
    } catch (err) {
      if (sendUnavailable(req, res, err)) return;
      req.log.error({ err }, "playhq ingest failed");
      res.status(500).json({ error: "ingest failed" });
    }
  },
);

export default router;
