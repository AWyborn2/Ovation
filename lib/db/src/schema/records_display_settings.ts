import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Singleton settings controlling how the public website Records page behaves by
// default: which tab opens first, the default grade for the By Grade tab, the
// default grade filter for the Partnerships tab, and the default sort for the
// Centuries and 5-Wicket Hauls tables. Visitors can still change every control
// themselves after the page loads. App-config (never replaced by the master ETL).
export const recordsDisplaySettingsTable = pgTable("records_display_settings", {
  id: serial("id").primaryKey(),
  // Tab pre-selected on first load.
  // One of: total | by-grade | partnerships | centuries | five-for.
  defaultTab: text("default_tab").notNull().default("total"),
  // Default grade for the By Grade tab. Empty string = first available grade.
  byGradeDefaultGrade: text("by_grade_default_grade").notNull().default(""),
  // Default grade filter for the Partnerships tab. Empty string = All grades
  // (highest stand per wicket across every grade).
  partnershipsDefaultGrade: text("partnerships_default_grade")
    .notNull()
    .default(""),
  // Default sort for the Centuries table, as "<column>-<dir>"
  // (column: grade|batsman|score|season; dir: asc|desc).
  centuriesSort: text("centuries_sort").notNull().default("season-desc"),
  // Default sort for the 5-Wicket Hauls table, as "<column>-<dir>"
  // (column: grade|bowler|figures|season; dir: asc|desc).
  fiveForSort: text("five_for_sort").notNull().default("season-desc"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type RecordsDisplaySettingsRow =
  typeof recordsDisplaySettingsTable.$inferSelect;
