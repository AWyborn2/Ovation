import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

// Admin-configurable navigation items, one row per item across four public
// surfaces: the senior top menu, the junior top menu, the junior dashboard
// quick-link cards, and the internal admin hub tiles. App-config (never
// replaced by the master ETL). Plain config data — nothing is derived from it.
//
// `surface` is one of: "senior_menu" | "junior_menu" | "junior_quick_links" |
// "admin_tiles".
//
// `target` holds either an internal route path (e.g. "/players") when
// `isExternal` is false, or a full custom URL (e.g. "https://...") when
// `isExternal` is true (rendered as <a target="_blank">).
export const navItemsTable = pgTable(
  "nav_items",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    surface: text("surface").notNull(),
    label: text("label").notNull(),
    // Description for card-style surfaces (junior quick-links, admin tiles).
    description: text("description").notNull().default(""),
    // Curated icon key mapped to a lucide icon on the client. Empty = no icon.
    iconKey: text("icon_key").notNull().default(""),
    target: text("target").notNull().default(""),
    isExternal: boolean("is_external").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    visible: boolean("visible").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxSurface: index("nav_items_surface_idx").on(t.surface),
  }),
);

export type NavItemRow = typeof navItemsTable.$inferSelect;
