/**
 * Repoint every tenant's SEEDED default card theme at that tenant's own brand.
 *
 * `ensureThemes` used to seed each tenant a "Club Classic" theme with hard-coded
 * literals — which are Halls Head's palette. Because the renderer resolves
 * tokens `junior > override > theme > brand`, that seeded theme OUTRANKS the
 * tenant's real brand colours, so every club's share cards rendered in Halls
 * Head's accent and panel regardless of their own branding.
 *
 * The seeding bug is fixed at source, but `ensureThemes` returns early when a
 * tenant already has any theme, so existing tenants keep the bad row forever.
 * This heals them.
 *
 * SAFETY — this only touches rows that are provably untouched seed rows:
 *   - name = 'Club Classic' AND is_default
 *   - accent AND bg_panel still equal the exact legacy literals
 * An admin who has edited their theme (renamed it, changed either colour) fails
 * that predicate and is left alone. Tenants whose brand carries no usable colour
 * are also left alone rather than being rewritten to another arbitrary default.
 *
 * Idempotent: after a run the updated rows no longer match the literals, so a
 * second run updates nothing.
 *
 * Run with: pnpm --filter @workspace/scripts run rebrand-seeded-card-themes
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// The exact values `ensureThemes` used to seed for every tenant.
const LEGACY_ACCENT = "#FBD039";
const LEGACY_PANEL = "#3F3C4C";

async function main() {
  // `tenants.primary_colour` / `juniors_colour` are the tenant-level brand
  // overrides; fall back to the linked club's colours the same way
  // `getTenantBrand` does, so a tenant that inherits its club's palette is
  // healed too. Only a strict 6-digit hex is accepted.
  const result = await db.execute(sql`
    UPDATE card_themes ct
    SET accent = COALESCE(b.primary_colour, ct.accent),
        bg_panel = COALESCE(b.juniors_colour, ct.bg_panel)
    FROM (
      SELECT t.id AS tenant_id,
             NULLIF(COALESCE(t.primary_colour, c.primary_colour), '') AS primary_colour,
             NULLIF(COALESCE(t.juniors_colour, c.juniors_colour), '') AS juniors_colour
      FROM tenants t
      LEFT JOIN clubs c ON c.id = t.app_club_id
    ) b
    WHERE ct.tenant_id = b.tenant_id
      AND ct.name = 'Club Classic'
      AND ct.is_default
      AND ct.accent = ${LEGACY_ACCENT}
      AND ct.bg_panel = ${LEGACY_PANEL}
      AND (
        b.primary_colour ~ '^#[0-9a-fA-F]{6}$'
        OR b.juniors_colour ~ '^#[0-9a-fA-F]{6}$'
      )
  `);
  const updated = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  console.log(
    updated === 0
      ? "No seeded themes needed rebranding (already healed, edited by an admin, or no brand colours set)."
      : `Rebranded ${updated} seeded card theme(s) to their tenant's own colours.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
