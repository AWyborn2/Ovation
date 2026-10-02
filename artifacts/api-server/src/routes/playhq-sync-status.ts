import { Router, type IRouter } from "express";
import { IngestNotConfiguredError } from "@workspace/db/playhq-ingest";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { tenantSyncStatus } from "../lib/playhq-health";

/**
 * `GET /api/admin/playhq-sync/status` — a club admin's view of its own PlayHQ sync: when
 * fixtures last refreshed and whether an incident is open (sync plan U9). Tenant-scoped by the
 * request's tenant; a club that isn't linked or synced gets a plain "not synced" answer.
 */
const router: IRouter = Router();

router.get("/admin/playhq-sync/status", requireAdmin, async (req, res): Promise<void> => {
  try {
    res.json(await tenantSyncStatus(getTenantId(req)));
  } catch (err) {
    if (err instanceof IngestNotConfiguredError) {
      // Sync isn't provisioned on this server: report "unknown" rather than an error banner.
      res.json({
        linked: true,
        syncEnabled: false,
        lastRefreshedAt: null,
        stale: false,
        staleSince: null,
      });
      return;
    }
    req.log.error({ err }, "playhq sync status failed");
    res.status(500).json({ error: "sync status failed" });
  }
});

export default router;
