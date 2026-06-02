import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const importsTable = pgTable("imports", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  grade: text("grade"),
  season: integer("season"),
  // "csv" = whole-season PlayCricket export; "match" = single-round xlsx scorecard.
  kind: text("kind").notNull().default("csv"),
  round: integer("round"),
  rowCount: integer("row_count").notNull().default(0),
  status: text("status").notNull().default("pending"),
  payload: jsonb("payload"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertImportSchema = createInsertSchema(importsTable).omit({ id: true });
export type InsertImport = z.infer<typeof insertImportSchema>;
export type ImportRecord = typeof importsTable.$inferSelect;
