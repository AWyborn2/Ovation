import { pgTable, serial, integer, text, timestamp, jsonb, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { type z } from "zod/v4";

export const importsTable = pgTable(
  "imports",
  {
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
  },
  (_t) => ({
    chkKind: check("imports_kind_check", sql`"kind" IN ('csv', 'match', 'match-batch')`),
  }),
);

export const insertImportSchema = createInsertSchema(importsTable).omit({ id: true });
export type InsertImport = z.infer<typeof insertImportSchema>;
export type ImportRecord = typeof importsTable.$inferSelect;
