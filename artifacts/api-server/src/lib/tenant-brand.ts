import { eq } from "drizzle-orm";
import { db, clubsTable, tenantsTable, platformSettingsTable } from "@workspace/db";
import { DEFAULT_BRAND, type HallsHeadBrand } from "@workspace/scorecard/brand";

/**
 * Per-tenant brand (logo + colours + badge style), the single shape every
 * renderer reads. Extends the established brand shape with the badge selector
 * and the navy-base design-mode flag.
 */
export type TenantBrand = HallsHeadBrand & {
  badgeStyle?: string | null;
  useNavyBase: boolean;
};

/** Minimal brand columns read from the `tenants` row. */
interface TenantBrandRow {
  name: string | null;
  shortName: string | null;
  /** Optional so callers that predate the tagline column still typecheck; the
   * live `getTenantBrand` select always supplies it. */
  tagline?: string | null;
  logoUrl: string | null;
  backgroundUrl: string | null;
  faviconUrl: string | null;
  backgroundColour: string | null;
  primaryColour: string | null;
  juniorsColour: string | null;
  useNavyBase: boolean;
  badgeStyle: string | null;
  /** Optional so pre-existing test fixtures compile; the live `getTenantBrand`
   * select always supplies it. */
  themeOverrides?: Record<string, string> | null;
}

/** Minimal brand columns read from the `clubs` register row (`appClubId`). */
interface ClubBrandRow {
  name: string | null;
  shortName: string | null;
  logoUrl: string | null;
  logoUrl128: string | null;
  backgroundColour: string | null;
  primaryColour: string | null;
  juniorsColour: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<number, { value: TenantBrand; at: number }>();

/**
 * Merge the brand sources into the final brand, pure (no IO) so the fallback
 * chain is unit-testable.
 *
 * Colour precedence (backgroundColour / primaryColour / juniorsColour):
 *   tenant row (admin-saved) → clubs register row (seed/default) → neutral DEFAULT_BRAND
 *
 * Both the club self-serve PATCH (`/tenant-brand`) and the platform admin PATCH
 * (`/platform/admin/tenants/:id/brand`) write to the `tenants` table, so the
 * tenant row must win for colours — otherwise every saved value is silently
 * overridden by the clubs-register row.  The clubs register becomes the
 * default/fallback (used when the tenant has explicitly set nothing).
 *
 * `logoUrl` follows the same tenant-wins rule as colours: the Branding PATCH
 * writes the admin-uploaded logo to the `tenants` row, so a non-empty tenant
 * logo must win — otherwise every uploaded club crest is silently overridden by
 * the (often stale/seeded) clubs-register URL and the card renders a blank logo.
 * The clubs register is the seed/default, used only when the tenant uploaded
 * nothing.  (Empty strings count as "unset" — a cleared upload falls back too.)
 *
 * Other non-colour fields (name) keep the clubs-register row as primary source
 * because those come from the authoritative central registry.  Halls Head's own
 * brand comes from its clubs/tenant record (seeded), so the neutral fallback
 * only applies to tenants that have set no brand — it never leaks Halls Head.
 */
export function buildTenantBrand(
  tenant: TenantBrandRow | null,
  club: ClubBrandRow | null,
): TenantBrand {
  // Tenant row wins for colours; clubs register is the fallback/default.
  const backgroundColour =
    tenant?.backgroundColour ?? club?.backgroundColour ?? DEFAULT_BRAND.backgroundColour;
  // When any background colour is supplied (from either source), derive missing
  // accents from that background rather than leaking the neutral default colours.
  // The all-null case still resolves to the full default brand.
  const anyBackgroundSupplied =
    (tenant?.backgroundColour ?? club?.backgroundColour) != null;
  return {
    name: club?.name ?? tenant?.name ?? DEFAULT_BRAND.name,
    shortName: club?.shortName ?? tenant?.shortName ?? DEFAULT_BRAND.shortName,
    // Tagline is tenant-row only (no clubs-register equivalent); null when the
    // tenant has set none, so a brand-less club shows nothing under the name.
    tagline: tenant?.tagline ?? DEFAULT_BRAND.tagline,
    // Admin-uploaded tenant logo wins (empty string = unset); clubs register is
    // the seed fallback, then the neutral default. See the precedence note above.
    logoUrl: tenant?.logoUrl || club?.logoUrl || DEFAULT_BRAND.logoUrl,
    // The tenants row carries no dedicated 128px logo. When the tenant uploaded a
    // logo that genuinely overrides the register (differs from it), use that for
    // the 128px slot too so the upload shows everywhere. Otherwise prefer the
    // clubs register's optimised 128px, then the tenant logo, then the fallback.
    logoUrl128:
      (tenant?.logoUrl && tenant.logoUrl !== club?.logoUrl ? tenant.logoUrl : "") ||
      club?.logoUrl128 ||
      tenant?.logoUrl ||
      DEFAULT_BRAND.logoUrl128,
    // No clubs-register equivalent for backgroundUrl — tenant row only, else the
    // neutral default (no image).
    backgroundUrl: tenant?.backgroundUrl ?? DEFAULT_BRAND.backgroundUrl,
    // No clubs-register equivalent for faviconUrl either — tenant row only,
    // else the neutral default (the platform favicon).
    faviconUrl: tenant?.faviconUrl ?? DEFAULT_BRAND.faviconUrl,
    backgroundColour,
    primaryColour:
      tenant?.primaryColour ??
      club?.primaryColour ??
      (anyBackgroundSupplied ? backgroundColour : DEFAULT_BRAND.primaryColour),
    juniorsColour:
      tenant?.juniorsColour ??
      club?.juniorsColour ??
      (anyBackgroundSupplied ? backgroundColour : DEFAULT_BRAND.juniorsColour),
    // Badge style — tenant row only (clubs register has no badge concept).
    badgeStyle: tenant?.badgeStyle ?? null,
    // Navy-base flag — tenant row only, defaults false when unset.
    useNavyBase: tenant?.useNavyBase ?? false,
    // Per-token theme overrides — tenant row only, null when the tenant has set
    // none (the fully-derived theme). The clubs register has no override concept.
    themeOverrides: tenant?.themeOverrides ?? null,
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
      tagline: tenantsTable.tagline,
      logoUrl: tenantsTable.logoUrl,
      backgroundUrl: tenantsTable.backgroundUrl,
      faviconUrl: tenantsTable.faviconUrl,
      backgroundColour: tenantsTable.backgroundColour,
      primaryColour: tenantsTable.primaryColour,
      juniorsColour: tenantsTable.juniorsColour,
      useNavyBase: tenantsTable.useNavyBase,
      badgeStyle: tenantsTable.badgeStyle,
      themeOverrides: tenantsTable.themeOverrides,
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
        backgroundColour: clubsTable.backgroundColour,
        primaryColour: clubsTable.primaryColour,
        juniorsColour: clubsTable.juniorsColour,
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

// ---------------------------------------------------------------------------
// Platform brand (apex host) — singleton platform_settings id=1
// ---------------------------------------------------------------------------

export interface PlatformBrandFields {
  platform: true;
  name: string | null;
  logoUrl: string | null;
  primaryColour: string | null;
  faviconUrl: string | null;
}

let platformBrandCache: { value: PlatformBrandFields; at: number } | null = null;

/**
 * Read the Ovation platform brand from `platform_settings` id=1.
 * Falls back to DEFAULT_BRAND values when the row is absent or a field is null.
 * Cached for {@link CACHE_TTL_MS} to avoid a DB round-trip on every landing
 * page load; invalidated by {@link invalidatePlatformBrandCache} after a PATCH.
 */
export async function getPlatformBrandFields(): Promise<PlatformBrandFields> {
  if (platformBrandCache && Date.now() - platformBrandCache.at < CACHE_TTL_MS) {
    return platformBrandCache.value;
  }

  const [row] = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.id, 1));

  // Apply DEFAULT_BRAND as the server-side fallback so every platform brand
  // field is non-null even before a super-admin has made any edits.
  const value: PlatformBrandFields = {
    platform: true,
    name: row?.name ?? DEFAULT_BRAND.name,
    logoUrl: row?.logoUrl ?? DEFAULT_BRAND.logoUrl ?? null,
    primaryColour: row?.accentColour ?? DEFAULT_BRAND.primaryColour ?? null,
    faviconUrl: row?.faviconUrl ?? DEFAULT_BRAND.faviconUrl ?? null,
  };
  platformBrandCache = { value, at: Date.now() };
  return value;
}

/** Drop the platform brand cache after a PATCH so the next GET is fresh. */
export function invalidatePlatformBrandCache(): void {
  platformBrandCache = null;
}

/**
 * Upsert platform_settings id=1 with the given fields and return the updated
 * PlatformBrandFields. Accepts partial updates: undefined fields are left as-is
 * (the PATCH semantics the route handler needs).
 */
export async function upsertPlatformBrand(fields: {
  name?: string | null;
  logoUrl?: string | null;
  accentColour?: string | null;
  faviconUrl?: string | null;
}): Promise<PlatformBrandFields> {
  // Upsert: create the singleton row if it doesn't exist yet; then update
  // only the fields that were explicitly supplied. We do a two-step
  // (insert-ignore then update) rather than ON CONFLICT DO UPDATE with a
  // partial set, because Drizzle's onConflictDoUpdate can't express "only
  // update columns whose value was supplied in the JS call".
  // Seed with DEFAULT_BRAND values so the admin editor is pre-populated
  // from day one rather than showing a blank form.
  await db
    .insert(platformSettingsTable)
    .values({
      id: 1,
      name: DEFAULT_BRAND.name,
      logoUrl: DEFAULT_BRAND.logoUrl,
      accentColour: DEFAULT_BRAND.primaryColour,
      faviconUrl: DEFAULT_BRAND.faviconUrl,
    })
    .onConflictDoNothing();

  const updates: Partial<{
    name: string | null;
    logoUrl: string | null;
    accentColour: string | null;
    faviconUrl: string | null;
  }> = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.logoUrl !== undefined) updates.logoUrl = fields.logoUrl;
  if (fields.accentColour !== undefined) updates.accentColour = fields.accentColour;
  if (fields.faviconUrl !== undefined) updates.faviconUrl = fields.faviconUrl;

  let row;
  if (Object.keys(updates).length > 0) {
    [row] = await db
      .update(platformSettingsTable)
      .set(updates)
      .where(eq(platformSettingsTable.id, 1))
      .returning();
  } else {
    [row] = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.id, 1));
  }

  invalidatePlatformBrandCache();
  return {
    platform: true,
    name: row?.name ?? DEFAULT_BRAND.name,
    logoUrl: row?.logoUrl ?? DEFAULT_BRAND.logoUrl ?? null,
    primaryColour: row?.accentColour ?? DEFAULT_BRAND.primaryColour ?? null,
    faviconUrl: row?.faviconUrl ?? DEFAULT_BRAND.faviconUrl ?? null,
  };
}
