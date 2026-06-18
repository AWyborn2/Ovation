import { Router, type IRouter } from "express";
import { getTenantBrand } from "../lib/tenant-brand";
import { getRequestEntitlements } from "../lib/tenant";
import { getTenantId, isPlatformRequest } from "../middlewares/tenant-context";

const router: IRouter = Router();

// The current tenant's brand (name, short name, logo, colours), resolved from
// the per-request tenant context. The web/mobile clients fetch this once to set
// the theme tokens, header/footer copy, and document title.
//
// On the apex/marketing host (platform mode) there is no tenant, so the response
// is `{ platform: true }` — the SPA's boot signal to mount the landing page tree
// instead of a club app.
router.get("/tenant-brand", async (req, res): Promise<void> => {
  if (isPlatformRequest(req)) {
    res.json({ platform: true });
    return;
  }
  const brand = await getTenantBrand(getTenantId(req));
  res.json(brand);
});

// The tenant's plan + resolved feature entitlements (dormant ⇒ everything on).
// The web reads this to hide/lock paid UI without locking anything during the pilot.
router.get("/tenant-plan", async (req, res): Promise<void> => {
  res.json(await getRequestEntitlements(req));
});

export default router;
