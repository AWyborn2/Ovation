import { Router, type IRouter } from "express";
import { getTenantBrand } from "../lib/tenant-brand";
import { getTenantId } from "../middlewares/tenant-context";

const router: IRouter = Router();

// The current tenant's brand (name, short name, logo, colours), resolved from
// the per-request tenant context. The web/mobile clients fetch this once to set
// the theme tokens, header/footer copy, and document title.
router.get("/tenant-brand", async (req, res): Promise<void> => {
  const brand = await getTenantBrand(getTenantId(req));
  res.json(brand);
});

export default router;
