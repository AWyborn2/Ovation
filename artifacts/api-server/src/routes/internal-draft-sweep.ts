import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { eq, isNull } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { RunDraftSweepBody } from "@workspace/api-zod";
import { runDraftSweep } from "../lib/draft-sweep";
import { env } from "../config";

/**
 * `POST /api/internal/draft-sweep` — the machine-to-machine entry to the
 * drafting sweep (Social Studio, KTD10). Called by the scheduled job (every
 * tenant) and by the fixtures projection script (the tenants it touched).
 *
 * Mounted BEFORE the tenant-context middleware: the tenant comes from the body,
 * never from the host, and the only credential is the shared sweep secret. No
 * secret configured means the endpoint is closed.
 */
const router: IRouter = Router();

function secretMatches(req: Request): boolean {
  const expected = env.SOCIAL_SWEEP_SECRET();
  const given = req.get("x-sweep-secret");
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

router.post("/draft-sweep", async (req, res): Promise<void> => {
  if (!secretMatches(req)) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const parsed = RunDraftSweepBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { tenantId, scope = "scheduled" } = parsed.data;

  const tenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(tenantId != null ? eq(tenantsTable.id, tenantId) : isNull(tenantsTable.suspendedAt));
  if (tenantId != null && tenants.length === 0) {
    res.status(404).json({ error: "tenant not found" });
    return;
  }

  const results = [];
  for (const t of tenants) {
    try {
      const summary = await runDraftSweep(t.id, { kind: scope }, req.log);
      results.push({ tenantId: t.id, ok: true, ...summary });
    } catch (err) {
      req.log.error({ err, tenantId: t.id }, "draft sweep failed");
      results.push({
        tenantId: t.id,
        ok: false,
        centralMatches: 0,
        matchSummaries: 0,
        matchDay: 0,
        teamLists: 0,
      });
    }
  }
  res.json({ results });
});

export default router;
