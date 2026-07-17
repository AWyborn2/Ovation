import { pgTable, integer, text } from "drizzle-orm/pg-core";

/**
 * Singleton table (id=1) holding the platform brand for Ovation itself.
 * Read by GET /tenant-brand on the apex host so the landing page and
 * platform admin shell reflect admin-set branding without a code change.
 * Updated exclusively via PATCH /platform/admin/platform-brand.
 *
 * All brand columns are nullable: null means "fall back to the built-in
 * DEFAULT_BRAND value" rather than storing the default redundantly.
 *
 * `accent_colour` maps to `primaryColour` in the ClubBrand shape (buttons,
 * nav highlights). The column name reflects its narrower scope compared with
 * a tenant's full three-colour brand.
 */
export const platformSettingsTable = pgTable("platform_settings", {
  id: integer("id").primaryKey(),
  name: text("name"),
  logoUrl: text("logo_url"),
  accentColour: text("accent_colour"),
  faviconUrl: text("favicon_url"),
});

export type PlatformSettingsRow = typeof platformSettingsTable.$inferSelect;
