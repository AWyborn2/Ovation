/**
 * null-legacy-placeholder-logos.ts — one-time audit/cleanup for the Ovation
 * placeholder-logo swap (U5, KTD6).
 *
 * `DEFAULT_BRAND.logoUrl`/`logoUrl128` moved from the neutral
 * `/placeholder-club-logo.svg` to `/ovation-logo.svg`. Both `isUnbranded`
 * (`artifacts/cricket-club/src/pages/admin.tsx`) and the brand resolver
 * (`buildTenantBrand`) compare a tenant's resolved brand to `DEFAULT_BRAND` by
 * exact string equality, so any tenant row that stored the OLD placeholder
 * literal would silently diverge from both the old and new default after the
 * swap (no longer "unbranded", but not really branded either). This script
 * finds and nulls those rows so they fall back to the new default cleanly.
 *
 * Dry-run by default (reports only, writes nothing). Pass --live to apply.
 *
 *   pnpm --filter @workspace/scripts run null-legacy-placeholder-logos
 *   ... -- --live                # actually null the matching rows
 *
 * Requires DATABASE_URL (tenant DB). Idempotent: re-running after --live
 * finds 0 matching rows. Never touches central.
 */
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";

const LEGACY_LOGO_URL = "/placeholder-club-logo.svg";

const flag = (n: string): boolean => process.argv.slice(2).includes(`--${n}`);

async function main(): Promise<void> {
  const live = flag("live");

  const matches = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      name: tenantsTable.name,
      logoUrl: tenantsTable.logoUrl,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.logoUrl, LEGACY_LOGO_URL));

  if (matches.length === 0) {
    console.log(
      "null-legacy-placeholder-logos: no tenant rows store the legacy placeholder literal.",
    );
    return;
  }

  for (const t of matches) {
    console.log(
      `${live ? "" : "[dry-run] "}tenant #${t.id} ${t.slug} (${t.name}): logoUrl = ${t.logoUrl} -> null`,
    );
  }

  if (!live) {
    console.log(
      `null-legacy-placeholder-logos: dry run complete, ${matches.length} row(s) would be nulled. Re-run with --live to apply.`,
    );
    return;
  }

  await db
    .update(tenantsTable)
    .set({ logoUrl: null })
    .where(eq(tenantsTable.logoUrl, LEGACY_LOGO_URL));

  console.log(
    `null-legacy-placeholder-logos: done — nulled logoUrl on ${matches.length} tenant row(s).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
