import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
 *   design mode), overriding any light-mode surfaces. Defaults false. This is the
 *   low-level flag behind the "App look" selector: Ovation Broadcast = true (fixed
 *   navy broadcast surfaces, the house style), Club look = false (surfaces derived
 *   from the club's own `backgroundColour`).
 * - `themeOverrides` → optional per-token theme overrides, a JSON map keyed by CSS
 *   custom property (e.g. `{ "--card": "#101826", "--radius": "0.75rem" }`). Null =
 *   the theme is fully derived from the colour columns above (the default). Colour
 *   tokens store a 6-digit hex; `--radius`/`--app-font-*` store the raw CSS value.
 *   The engine (`deriveThemeTokens`) overlays these on top of the derived scale, so
 *   an absent map reproduces the pre-override theme byte-for-byte. Club admins write
 *   a curated subset; the platform-admin concierge editor can write any token (the
 *   premium "custom design" offering).
 * - `lastActiveAt` → when a club admin last acted on this tenant (advanced,
 *   throttled, from the club-admin auth path). Null = never active — the
 *   onboarding-stall signal the platform health dashboard surfaces.
 * - `suspendedAt` → when the tenant was suspended, or null when active. This
 *   column records and displays suspended state; enforcement (blocking access)
 *   is a separate follow-up.
 */
export const tenantsTable = pgTable(
  "tenants",
  {
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
    // Per-token theme overrides keyed by CSS custom property (see the doc block
    // above). Null = fully-derived theme (default). Stored as JSONB so the shape
    // can grow without a column-per-token migration.
    themeOverrides: jsonb("theme_overrides").$type<Record<string, string>>(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqCentralClub: uniqueIndex("tenants_central_club_id_uidx").on(t.centralClubId),
    uqCustomDomain: uniqueIndex("tenants_custom_domain_uidx")
      .on(t.customDomain)
      .where(sql`"custom_domain" IS NOT NULL`),
    chkPlan: check("tenants_plan_check", sql`"plan" IN ('free', 'club', 'pro', 'pilot')`),
  }),
);

export type TenantRow = typeof tenantsTable.$inferSelect;
export type InsertTenant = typeof tenantsTable.$inferInsert;
