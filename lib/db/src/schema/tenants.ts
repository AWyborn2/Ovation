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
 * - The brand columns (name … juniorsColour) are the per-tenant theme; the
 *   brand resolver prefers the `appClubId` clubs-register row where set, then
 *   these, then the built-in fallback.
 * - `useNavyBase` → when true the tenant's UI uses the full navy base (dark-only
 *   design mode), overriding any light-mode surfaces. Defaults false.
 * - `lastActiveAt` → when a club admin last acted on this tenant (advanced,
 *   throttled, from the club-admin auth path). Null = never active — the
 *   onboarding-stall signal the platform health dashboard surfaces.
 * - `suspendedAt` → when the tenant was suspended, or null when active. This
 *   column records and displays suspended state; enforcement (blocking access)
 *   is a separate follow-up.
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
  backgroundUrl: text("background_url"),
  backgroundColour: text("background_colour"),
  primaryColour: text("primary_colour"),
  juniorsColour: text("juniors_colour"),
  // Short club tagline shown under the club name on pack cards (e.g.
  // "CRICKET CLUB · EST 1991"). Null = no tagline; renderers show nothing rather
  // than leaking another club's founding line.
  tagline: text("tagline"),
  useNavyBase: boolean("use_navy_base").notNull().default(false),
  customDomain: text("custom_domain"),
  // Plan tier: free | club | pro (legacy "pilot" reads as free). Drives feature
  // entitlements; enforcement is dormant until BILLING_ENABLED=true.
  plan: text("plan").notNull().default("free"),
  // Badge shape for grade badges (diamond | shield | hexagon | oval | crest).
  // Null → default "diamond". Stored as text; validated client-side.
  badgeStyle: text("badge_style"),
  // Tenant health (platform dashboard). Both nullable, no backfill.
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TenantRow = typeof tenantsTable.$inferSelect;
export type InsertTenant = typeof tenantsTable.$inferInsert;
