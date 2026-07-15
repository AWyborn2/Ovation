import type { TenantRow } from "@workspace/db";

/**
 * Shape a tenant row for the platform-admin console (plan, branding, counts,
 * health). Pure and type-only on `@workspace/db` (no runtime DB import), so the
 * derivations here — branding completeness and timestamp serialization — are
 * unit-testable without a database. Both the tenant list and detail handlers
 * feed through this shaper, so they stay in lock-step.
 */
export function toAdminTenant(
  t: TenantRow,
  centralClubName: string | null,
  adminCount: number,
) {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    plan: t.plan,
    centralClubId: t.centralClubId,
    centralClubName,
    customDomain: t.customDomain,
    readsFromCentral: t.readsFromCentral,
    createdAt:
      t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    adminCount,
    shortName: t.shortName,
    logoUrl: t.logoUrl,
    faviconUrl: t.faviconUrl,
    primaryColour: t.primaryColour,
    secondaryColour: t.secondaryColour,
    tertiaryColour: t.tertiaryColour,
    lastActiveAt:
      t.lastActiveAt instanceof Date
        ? t.lastActiveAt.toISOString()
        : t.lastActiveAt,
    suspendedAt:
      t.suspendedAt instanceof Date
        ? t.suspendedAt.toISOString()
        : t.suspendedAt,
    // Branding is "complete" when the tenant set its own logo AND primary colour
    // (explicit branding, not defaults / clubs-register fallback). Derived, not
    // stored, so it can't drift from the underlying columns.
    brandingComplete: t.logoUrl != null && t.primaryColour != null,
  };
}
