import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, tenantsTable, type TenantRow } from "@workspace/db";
import { UpdateTenantBrandBody } from "@workspace/api-zod";
import {
  getTenantBrand,
  invalidateTenantBrandCache,
  getPlatformBrandFields,
} from "../lib/tenant-brand";
import { invalidateClubBrandOverlayCache } from "../lib/club-brand";
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
    // Return the platform brand fields so the landing page header, document
    // title, and favicon reflect admin-configured values without a redeploy.
    res.json(await getPlatformBrandFields());
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
      | "tagline"
      | "logoUrl"
      | "faviconUrl"
      | "backgroundUrl"
      | "backgroundColour"
      | "primaryColour"
      | "juniorsColour"
      | "badgeStyle"
      | "useNavyBase"
      | "themeOverrides"
    >
  > = {};
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.shortName !== undefined) updates.shortName = parsed.data.shortName;
  if (parsed.data.tagline !== undefined) updates.tagline = parsed.data.tagline;
  if (parsed.data.logoUrl !== undefined) updates.logoUrl = parsed.data.logoUrl;
  if (parsed.data.faviconUrl !== undefined) updates.faviconUrl = parsed.data.faviconUrl;
  if (parsed.data.backgroundUrl !== undefined) updates.backgroundUrl = parsed.data.backgroundUrl;
  if (parsed.data.backgroundColour !== undefined)
    updates.backgroundColour = parsed.data.backgroundColour;
  if (parsed.data.primaryColour !== undefined) updates.primaryColour = parsed.data.primaryColour;
  if (parsed.data.juniorsColour !== undefined) updates.juniorsColour = parsed.data.juniorsColour;
  if (parsed.data.badgeStyle !== undefined) updates.badgeStyle = parsed.data.badgeStyle;
  if (parsed.data.useNavyBase !== undefined) updates.useNavyBase = parsed.data.useNavyBase;
  if (parsed.data.themeOverrides !== undefined) updates.themeOverrides = parsed.data.themeOverrides;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Nothing to update" });
    return;
  }

  const [row] = await db
    .update(tenantsTable)
    .set(updates)
    .where(eq(tenantsTable.id, tenantId))
    .returning();
  if (!row) {
    // The tenant vanished between requireAdmin's lookup and this write (no
    // transaction spans them) -- without this check the update silently
    // matches zero rows and the code below would still return a 200 with the
    // fallback/default brand, looking like a successful update for a tenant
    // that no longer exists.
    res.status(404).json({ error: "No such tenant" });
    return;
  }
  invalidateTenantBrandCache(tenantId);
  // This tenant's brand also drives how it appears as an OPPONENT on other
  // tenants' scorecards; drop that overlay cache so the change shows at once.
  invalidateClubBrandOverlayCache();
  const brand = await getTenantBrand(tenantId);
  res.json(brand);
});

// The tenant's plan + resolved feature entitlements (dormant ⇒ everything on).
// The web reads this to hide/lock paid UI without locking anything during the pilot.
router.get("/tenant-plan", async (req, res): Promise<void> => {
  res.json(await getRequestEntitlements(req));
});

export default router;
