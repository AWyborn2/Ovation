import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable, type TenantRow } from "@workspace/db";
import { UpdateTenantBrandBody } from "@workspace/api-zod";
import { getTenantBrand, invalidateTenantBrandCache } from "../lib/tenant-brand";
import { getRequestEntitlements } from "../lib/tenant";
import { getTenantId, isPlatformRequest } from "../middlewares/tenant-context";
import { requireAdmin } from "../middlewares/require-admin";

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

// Self-service update of the current tenant's own cosmetic branding fields, by
// that tenant's own admin. `plan` and `customDomain` are not properties on
// UpdateTenantBrandBody at all (see openapi.yaml) — those stay exclusively on
// the super-admin-only platform console (platform-admin.ts).
router.patch("/tenant-brand", requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateTenantBrandBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const tenantId = getTenantId(req);
  const updates: Partial<
    Pick<
      TenantRow,
      | "name"
      | "shortName"
      | "logoUrl"
      | "faviconUrl"
      | "primaryColour"
      | "secondaryColour"
      | "tertiaryColour"
    >
  > = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.shortName !== undefined) updates.shortName = parsed.data.shortName;
  if (parsed.data.logoUrl !== undefined) updates.logoUrl = parsed.data.logoUrl;
  if (parsed.data.faviconUrl !== undefined) updates.faviconUrl = parsed.data.faviconUrl;
  if (parsed.data.primaryColour !== undefined) updates.primaryColour = parsed.data.primaryColour;
  if (parsed.data.secondaryColour !== undefined) updates.secondaryColour = parsed.data.secondaryColour;
  if (parsed.data.tertiaryColour !== undefined) updates.tertiaryColour = parsed.data.tertiaryColour;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  await db.update(tenantsTable).set(updates).where(eq(tenantsTable.id, tenantId));
  invalidateTenantBrandCache(tenantId);
  const brand = await getTenantBrand(tenantId);
  res.json(brand);
});

// The tenant's plan + resolved feature entitlements (dormant ⇒ everything on).
// The web reads this to hide/lock paid UI without locking anything during the pilot.
router.get("/tenant-plan", async (req, res): Promise<void> => {
  res.json(await getRequestEntitlements(req));
});

export default router;
