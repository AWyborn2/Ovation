import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { getTenantCentralClubId, TenantNotFoundError } from "../lib/tenant";
import { CorrectionsStoreMissingError, withCorrectionsStore } from "../lib/club-corrections";
import { loadIdentityDrift } from "../lib/identity-drift";

/**
 * Identity drift admin (hybrid stats plan U17; R9, R10, R16).
 *
 * Read-only: lists the association player GUIDs the club's layer still names
 * (crosswalk, renames, merges) that no longer have a line for the club, with
 * the curated rows and corrections that depend on each. Shown as "Broken
 * links" on the corrections screen. The tenant always comes from request
 * context and central is read for its club only, so a club's admin sees its
 * own drift and nobody else's. Same check as scripts/src/check-identity-drift.ts.
 */
const router: IRouter = Router();

router.get("/club-identity-drift", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  let clubId: number;
  try {
    clubId = await getTenantCentralClubId(tenantId);
  } catch (err) {
    if (!(err instanceof TenantNotFoundError)) throw err;
    res.status(409).json({ error: "This club has no association data." });
    return;
  }
  try {
    const drift = await withCorrectionsStore(() => loadIdentityDrift(tenantId, clubId));
    res.json(drift.items);
  } catch (err) {
    if (!(err instanceof CorrectionsStoreMissingError)) throw err;
    res.status(err.status).json({ error: err.message });
  }
});

export default router;
