import { pgTable, serial, integer, text, boolean } from "drizzle-orm/pg-core";

/**
 * Opposition (and HHCC) club reference, loaded from the master DB. Carries brand
 * colours and PlayHQ logo URLs so per-match scorecards can render opposition
 * branding (the rendering itself lands in the dependent match-history task).
 */
export const clubsTable = pgTable("clubs", {
  id: serial("id").primaryKey(),
  playhqOrgId: text("playhq_org_id"),
  name: text("name").notNull(),
  slug: text("slug"),
  type: text("type"),
  role: text("role"),
  playhqOrgPage: text("playhq_org_page"),
  logoUrl: text("logo_url"),
  logoUrl128: text("logo_url_128"),
  primaryColour: text("primary_colour"),
  secondaryColour: text("secondary_colour"),
  tertiaryColour: text("tertiary_colour"),
  quaternaryColour: text("quaternary_colour"),
  tertiaryApprox: boolean("tertiary_approx").notNull().default(false),
  shortName: text("short_name"),
});

export type ClubRow = typeof clubsTable.$inferSelect;
