import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { centralDb } from "@workspace/db/central";
import { HealthCheckResponse, ReadinessCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

/** Liveness: the process is up and serving HTTP. Never touches a database. */
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/** Bound how long a readiness probe may wait on either database. */
const PROBE_TIMEOUT_MS = 2_000;

async function probe(run: () => Promise<unknown>): Promise<"ok" | "error"> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("probe timed out")), PROBE_TIMEOUT_MS);
      }),
    ]);
    return "ok";
  } catch {
    return "error";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Readiness: can this instance actually serve requests? Runs `SELECT 1` on the
 * tenant database and the central database with a short timeout, so an
 * autoscaler stops routing to an instance whose remote central connection has
 * died instead of letting every stats read 500. 503 when either fails.
 */
router.get("/readyz", async (_req, res): Promise<void> => {
  const [tenantDb, central] = await Promise.all([
    probe(() => db.execute(sql`select 1`)),
    probe(() => centralDb.execute(sql`select 1`)),
  ]);
  const status = tenantDb === "ok" && central === "ok" ? "ok" : "degraded";
  const data = ReadinessCheckResponse.parse({ status, db: tenantDb, central });
  res.status(status === "ok" ? 200 : 503).json(data);
});

export default router;
