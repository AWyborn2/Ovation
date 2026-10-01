import { timingSafeEqual } from "node:crypto";
import express, { Router, type IRouter, type Request } from "express";
import { IngestPlayhqDumpBody } from "@workspace/api-zod";
import { IngestNotConfiguredError, type Dump } from "@workspace/db/playhq-ingest";
import { ingestPlayhqDump } from "../lib/playhq-ingest";
import { env } from "../config";

/**
 * `POST /api/internal/playhq/ingest` — where every PlayHQ collector (the scheduled headless
 * runner, a hand-run upload, later the public-API collector) hands over a harness dump.
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

/** Decompressed-JSON ceiling for one dump (a match day of scorecards runs to megabytes). */
const DUMP_LIMIT = "50mb";

router.post(
  "/ingest",
  (req, res, next) => {
    if (secretMatches(req)) next();
    else res.status(401).json({ error: "unauthorized" });
  },
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
      if (err instanceof IngestNotConfiguredError) {
        req.log.error({ err }, "playhq ingest unavailable");
        res.status(503).json({ error: err.message });
        return;
      }
      req.log.error({ err }, "playhq ingest failed");
      res.status(500).json({ error: "ingest failed" });
    }
  },
);

export default router;
