import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Tenant register for the white-label platform. One row per club that runs
 * Ovation as its own branded app. Halls Head is tenant #1 (the demo).
 *
 * - `centralClubId` → the club's id in `central.clubs` (the shared PCA dataset
 *   the stats reads are filtered by). Halls Head = 1.
 * - `appClubId` → the tenant app's own `clubs` register row that the brand
 *   resolver reads today for the canonical logo/colours (Halls Head = 2).
 *   Nullable: future tenants may brand purely from the columns below.
 * - `readsFromCentral` → the stats DATA SOURCE for this tenant. False (default) =
 *   read the tenant's own native tables (Halls Head: full curated history). True =
 *   read the central PCA DB filtered by `centralClubId` (clubs with no native
 *   data, e.g. Mandurah). Per-tenant by design so enabling central for one club
 *   never blanks another that relies on its native tables.
 * - The brand columns (name … tertiaryColour) are the per-tenant theme; the
 *   brand resolver prefers the `appClubId` clubs-register row where set, then
 *   these, then the built-in fallback.
 */
export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  centralClubId: integer("central_club_id").notNull(),
  appClubId: integer("app_club_id"),
  readsFromCentral: boolean("reads_from_central").notNull().default(false),
  name: text("name").notNull(),
  shortName: text("short_name"),
  logoUrl: text("logo_url"),
  faviconUrl: text("favicon_url"),
  primaryColour: text("primary_colour"),
  secondaryColour: text("secondary_colour"),
  tertiaryColour: text("tertiary_colour"),
  customDomain: text("custom_domain"),
  // Plan tier: free | club | pro (legacy "pilot" reads as free). Drives feature
  // entitlements; enforcement is dormant until BILLING_ENABLED=true.
  plan: text("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TenantRow = typeof tenantsTable.$inferSelect;
export type InsertTenant = typeof tenantsTable.$inferInsert;
