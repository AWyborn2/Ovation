import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";

/**
 * Partnership records, loaded from the master DB. The master's partnership data
 * has no per-match link, so this is a records surface (highest stand per wicket
 * per grade, plus the full 50+ list), not a per-match panel. `grade` is the
 * app's flat grade name; `season` is the display label (YYYY/YY).
 */
export const partnershipRecordsTable = pgTable("partnership_records", {
  id: serial("id").primaryKey(),
  grade: text("grade").notNull(),
  wicket: text("wicket").notNull(),
  runs: integer("runs").notNull(),
  batsmen: text("batsmen").notNull(),
  opposition: text("opposition"),
  season: text("season"),
});

export const partnerships50PlusTable = pgTable("partnerships_50plus", {
  id: serial("id").primaryKey(),
  grade: text("grade").notNull(),
  wicket: text("wicket").notNull(),
  runs: integer("runs").notNull(),
  batsmen: text("batsmen").notNull(),
  opposition: text("opposition"),
  season: text("season"),
  source: text("source"),
});

export type PartnershipRecordRow = typeof partnershipRecordsTable.$inferSelect;
export type Partnership50PlusRow = typeof partnerships50PlusTable.$inferSelect;
