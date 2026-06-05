import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

// Singleton settings controlling how the public website Matches page behaves by
// default: which grade + season load first, the order grades appear in the grade
// menu, and the within-season round-order direction. App-config (never replaced
// by the master ETL).
export const matchDisplaySettingsTable = pgTable("match_display_settings", {
  id: serial("id").primaryKey(),
  // Default grade pre-selected on first load. Empty string = "All grades".
  defaultGrade: text("default_grade").notNull().default(""),
  // How the default season is chosen: "latest" (newest available season),
  // "specific" (the defaultSeason value), or "all" (All seasons).
  defaultSeasonMode: text("default_season_mode").notNull().default("all"),
  // Specific season start-year used when defaultSeasonMode = "specific".
  defaultSeason: integer("default_season"),
  // Ordered list of grade names for the grade menu. Grades not listed fall back
  // to the built-in seniority order, appended after the configured ones.
  gradeOrder: text("grade_order").array().notNull().default([]),
  // Within-season round direction: "desc" (latest round first, current default)
  // or "asc" (round 1 first). Season ordering always stays newest-first.
  roundOrder: text("round_order").notNull().default("desc"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MatchDisplaySettingsRow = typeof matchDisplaySettingsTable.$inferSelect;
