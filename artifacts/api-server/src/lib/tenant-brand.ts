import { eq } from "drizzle-orm";
import { db, clubsTable, tenantsTable } from "@workspace/db";
import { DEFAULT_BRAND, type HallsHeadBrand } from "@workspace/scorecard/brand";

/**
 * Per-tenant brand (logo + colours + badge style), the single shape every
 * renderer reads. Extends the established brand shape with the badge selector.
 */
export type TenantBrand = HallsHeadBrand & { badgeStyle?: string | null };

/** Minimal brand columns read from the `tenants` row. */
interface TenantBrandRow {
  name: string | null;
  shortName: string | null;
  logoUrl: string | null;
  backgroundUrl: string | null;
  faviconUrl: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  tertiaryColour: string | null;
  badgeStyle: string | null;
}

/** Minimal brand columns read from the `clubs` register row (`appClubId`). */
interface ClubBrandRow {
  name: string | null;
  shortName: string | null;
  logoUrl: string | null;
  logoUrl128: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  tertiaryColour: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<number, { value: TenantBrand; at: number }>();

/**
 * Merge the brand sources into the final brand, pure (no IO) so the fallback
 * chain is unit-testable.
 *
 * Colour precedence (primaryColour / secondaryColour / tertiaryColour):
 *   tenant row (admin-saved) → clubs register row (seed/default) → neutral DEFAULT_BRAND
 *
 * Both the club self-serve PATCH (`/tenant-brand`) and the platform admin PATCH
 * (`/platform/admin/tenants/:id/brand`) write to the `tenants` table, so the
 * tenant row must win for colours — otherwise every saved value is silently
 * overridden by the clubs-register row.  The clubs register becomes the
 * default/fallback (used when the tenant has explicitly set nothing).
 *
 * Non-colour fields (name, logo) keep the clubs-register row as primary source
 * because those come from the authoritative central registry.  Halls Head's own
 * brand comes from its clubs/tenant record (seeded), so the neutral fallback
 * only applies to tenants that have set no brand — it never leaks Halls Head.
 */
export function buildTenantBrand(
  tenant: TenantBrandRow | null,
  club: ClubBrandRow | null,
): TenantBrand {
  // Tenant row wins for colours; clubs register is the fallback/default.
  const primaryColour =
    tenant?.primaryColour ?? club?.primaryColour ?? DEFAULT_BRAND.primaryColour;
  // When any primary colour is supplied (from either source), derive missing
  // accents from that primary rather than leaking the neutral default colours.
  // The all-null case still resolves to the full default brand.
  const anyPrimarySupplied =
    (tenant?.primaryColour ?? club?.primaryColour) != null;
  return {
    name: club?.name ?? tenant?.name ?? DEFAULT_BRAND.name,
    shortName: club?.shortName ?? tenant?.shortName ?? DEFAULT_BRAND.shortName,
    logoUrl: club?.logoUrl ?? tenant?.logoUrl ?? DEFAULT_BRAND.logoUrl,
    // The tenants row carries no 128px logo: prefer the clubs register's 128px,
    // else the tenant's own logo (better than the default club's), else fallback.
    logoUrl128: club?.logoUrl128 ?? tenant?.logoUrl ?? DEFAULT_BRAND.logoUrl128,
    // No clubs-register equivalent for backgroundUrl — tenant row only, else the
    // neutral default (no image).
    backgroundUrl: tenant?.backgroundUrl ?? DEFAULT_BRAND.backgroundUrl,
    // No clubs-register equivalent for faviconUrl either — tenant row only,
    // else the neutral default (the platform favicon).
    faviconUrl: tenant?.faviconUrl ?? DEFAULT_BRAND.faviconUrl,
    primaryColour,
    secondaryColour:
      tenant?.secondaryColour ??
      club?.secondaryColour ??
      (anyPrimarySupplied ? primaryColour : DEFAULT_BRAND.secondaryColour),
    tertiaryColour:
      tenant?.tertiaryColour ??
      club?.tertiaryColour ??
      (anyPrimarySupplied ? primaryColour : DEFAULT_BRAND.tertiaryColour),
    // Badge style — tenant row only (clubs register has no badge concept).
    badgeStyle: tenant?.badgeStyle ?? null,
  };
}

/**
 * Resolve a tenant's official branding (logo + colours). Reads the tenant row,
 * joined to its `clubs` register record where `appClubId` is set, and merges via
 * {@link buildTenantBrand}. Cached briefly per tenant to avoid hitting the DB on
 * every match/social request.
 */
export async function getTenantBrand(tenantId: number): Promise<TenantBrand> {
  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

  const [tenant] = await db
    .select({
      name: tenantsTable.name,
      shortName: tenantsTable.shortName,
      logoUrl: tenantsTable.logoUrl,
      backgroundUrl: tenantsTable.backgroundUrl,
      faviconUrl: tenantsTable.faviconUrl,
      primaryColour: tenantsTable.primaryColour,
      secondaryColour: tenantsTable.secondaryColour,
      tertiaryColour: tenantsTable.tertiaryColour,
      badgeStyle: tenantsTable.badgeStyle,
      appClubId: tenantsTable.appClubId,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  let club: ClubBrandRow | null = null;
  if (tenant?.appClubId != null) {
    const [row] = await db
      .select({
        name: clubsTable.name,
        shortName: clubsTable.shortName,
        logoUrl: clubsTable.logoUrl,
        logoUrl128: clubsTable.logoUrl128,
        primaryColour: clubsTable.primaryColour,
        secondaryColour: clubsTable.secondaryColour,
        tertiaryColour: clubsTable.tertiaryColour,
      })
      .from(clubsTable)
      .where(eq(clubsTable.id, tenant.appClubId));
    club = row ?? null;
  }

  const value = buildTenantBrand(tenant ?? null, club);
  cache.set(tenantId, { value, at: Date.now() });
  return value;
}

/**
 * @deprecated Halls Head is tenant #1 — call `getTenantBrand(getTenantId(req))`
 * instead. Retained so `req`-less callers (match-detail/honour-display builders)
 * compile unchanged during the white-label transition.
 */
export async function getHallsHeadBrand(): Promise<TenantBrand> {
  return getTenantBrand(1);
}

/**
 * Drop a tenant's cached brand so the next {@link getTenantBrand} read reflects
 * a just-written change immediately, rather than serving the pre-update value
 * for up to {@link CACHE_TTL_MS}. Call after any write to a tenant's own brand
 * columns or its linked `clubs` register row.
 */
export function invalidateTenantBrandCache(tenantId: number): void {
  cache.delete(tenantId);
}
