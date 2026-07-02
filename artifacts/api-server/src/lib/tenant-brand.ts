import { eq } from "drizzle-orm";
import { db, clubsTable, tenantsTable } from "@workspace/db";
import { DEFAULT_BRAND, type HallsHeadBrand } from "@workspace/scorecard/brand";

/**
 * Per-tenant brand (logo + colours), the single shape every renderer reads.
 * Structurally the established brand shape; aliased for the white-label naming.
 */
export type TenantBrand = HallsHeadBrand;

/** Minimal brand columns read from the `tenants` row. */
interface TenantBrandRow {
  name: string | null;
  shortName: string | null;
  logoUrl: string | null;
  primaryColour: string | null;
  secondaryColour: string | null;
  tertiaryColour: string | null;
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
 * chain is unit-testable. Precedence per field: the `clubs` register row (the
 * brand source of truth today, where `appClubId` is set) → the tenant row's own
 * brand columns → the neutral {@link DEFAULT_BRAND} fallback. Halls Head's own
 * brand comes from its clubs/tenant record (seeded), so the neutral fallback
 * only applies to tenants that have set no brand — it never leaks Halls Head.
 */
export function buildTenantBrand(
  tenant: TenantBrandRow | null,
  club: ClubBrandRow | null,
): TenantBrand {
  const primaryColour =
    club?.primaryColour ?? tenant?.primaryColour ?? DEFAULT_BRAND.primaryColour;
  // When a tenant supplies a primary colour but no secondary/tertiary (e.g. a
  // central-sourced club that only has a primary), derive the missing accents
  // from its OWN primary rather than leaking the default club's (Halls Head's
  // gold/brown). The all-null case still resolves to the full default brand.
  const tenantSuppliedPrimary =
    (club?.primaryColour ?? tenant?.primaryColour) != null;
  return {
    name: club?.name ?? tenant?.name ?? DEFAULT_BRAND.name,
    shortName: club?.shortName ?? tenant?.shortName ?? DEFAULT_BRAND.shortName,
    logoUrl: club?.logoUrl ?? tenant?.logoUrl ?? DEFAULT_BRAND.logoUrl,
    // The tenants row carries no 128px logo: prefer the clubs register's 128px,
    // else the tenant's own logo (better than the default club's), else fallback.
    logoUrl128: club?.logoUrl128 ?? tenant?.logoUrl ?? DEFAULT_BRAND.logoUrl128,
    primaryColour,
    secondaryColour:
      club?.secondaryColour ??
      tenant?.secondaryColour ??
      (tenantSuppliedPrimary ? primaryColour : DEFAULT_BRAND.secondaryColour),
    tertiaryColour:
      club?.tertiaryColour ??
      tenant?.tertiaryColour ??
      (tenantSuppliedPrimary ? primaryColour : DEFAULT_BRAND.tertiaryColour),
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
      primaryColour: tenantsTable.primaryColour,
      secondaryColour: tenantsTable.secondaryColour,
      tertiaryColour: tenantsTable.tertiaryColour,
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
