import { eq } from "drizzle-orm";
import { db, clubsTable, tenantsTable } from "@workspace/db";
import { DEFAULT_BRAND, type HallsHeadBrand } from "@workspace/scorecard/brand";

/**
 * Per-tenant brand (logo + colours + badge style), the single shape every
 * renderer reads.  Extends the shared club-brand shape with tenant-only fields.
 */
export type TenantBrand = HallsHeadBrand & { badgeStyle: string };

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
  badgeStyle: string;
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
 * chain is unit-testable. Precedence per field: the tenant row's own brand
 * columns (admin-saved branding) → the `clubs` register row (seed data from
 * central, where `appClubId` is set) → the neutral {@link DEFAULT_BRAND}
 * fallback. Tenant branding wins so that admin edits in the platform console
 * take immediate effect rather than being shadowed by the clubs register.
 */
export function buildTenantBrand(
  tenant: TenantBrandRow | null,
  club: ClubBrandRow | null,
): TenantBrand {
  const primaryColour =
    tenant?.primaryColour ?? club?.primaryColour ?? DEFAULT_BRAND.primaryColour;
  const tenantSuppliedPrimary =
    (tenant?.primaryColour ?? club?.primaryColour) != null;
  return {
    name: tenant?.name ?? club?.name ?? DEFAULT_BRAND.name,
    shortName: tenant?.shortName ?? club?.shortName ?? DEFAULT_BRAND.shortName,
    logoUrl: tenant?.logoUrl ?? club?.logoUrl ?? DEFAULT_BRAND.logoUrl,
    logoUrl128: club?.logoUrl128 ?? tenant?.logoUrl ?? DEFAULT_BRAND.logoUrl128,
    backgroundUrl: tenant?.backgroundUrl ?? DEFAULT_BRAND.backgroundUrl,
    faviconUrl: tenant?.faviconUrl ?? DEFAULT_BRAND.faviconUrl,
    primaryColour,
    secondaryColour:
      tenant?.secondaryColour ??
      club?.secondaryColour ??
      (tenantSuppliedPrimary ? primaryColour : DEFAULT_BRAND.secondaryColour),
    tertiaryColour:
      tenant?.tertiaryColour ??
      club?.tertiaryColour ??
      (tenantSuppliedPrimary ? primaryColour : DEFAULT_BRAND.tertiaryColour),
    badgeStyle: tenant?.badgeStyle ?? "shield",
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
