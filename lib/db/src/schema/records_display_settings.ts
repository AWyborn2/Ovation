import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

// One row per tenant (unique on tenantId) controlling how that tenant's public
// website Records page behaves by default: which tab opens first, the default
// grade for the By Grade tab, the default grade filter for the Partnerships
// tab, and the default sort for the Centuries and 5-Wicket Hauls tables.
// Visitors can still change every control themselves after the page loads.
export const recordsDisplaySettingsTable = pgTable(
  "records_display_settings",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    // Tab pre-selected on first load.
    // One of: total | by-grade | partnerships | centuries | five-for.
    defaultTab: text("default_tab").notNull().default("total"),
    // Default grade for the By Grade tab. Empty string = first available grade.
    byGradeDefaultGrade: text("by_grade_default_grade").notNull().default(""),
    // Default grade filter for the Partnerships tab. Empty string = All grades
    // (highest stand per wicket across every grade).
    partnershipsDefaultGrade: text("partnerships_default_grade").notNull().default(""),
    // Default sort for the Centuries table, as "<column>-<dir>"
    // (column: grade|batsman|score|season; dir: asc|desc).
    centuriesSort: text("centuries_sort").notNull().default("season-desc"),
    // Default sort for the 5-Wicket Hauls table, as "<column>-<dir>"
    // (column: grade|bowler|figures|season; dir: asc|desc).
    fiveForSort: text("five_for_sort").notNull().default("season-desc"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqTenant: uniqueIndex("records_display_settings_tenant_unique").on(t.tenantId),
  }),
);

export type RecordsDisplaySettingsRow = typeof recordsDisplaySettingsTable.$inferSelect;
