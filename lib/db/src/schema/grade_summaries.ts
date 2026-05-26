import { pgTable, serial, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gradeSummariesTable = pgTable("grade_summaries", {
  id: serial("id").primaryKey(),
  grade: text("grade").notNull().unique(),
  players: integer("players"),
  games: integer("games"),
  innings: integer("innings"),
  runs: integer("runs"),
  wickets: integer("wickets"),
  catches: integer("catches"),
  stumpings: integer("stumpings"),
  runOuts: integer("run_outs"),
});

export const insertGradeSummarySchema = createInsertSchema(gradeSummariesTable).omit({ id: true });
export type InsertGradeSummary = z.infer<typeof insertGradeSummarySchema>;
export type GradeSummary = typeof gradeSummariesTable.$inferSelect;
