import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";
import { importsTable } from "./imports";

export const playerGradeSeasonStatsTable = pgTable("player_grade_season_stats", {
  id: serial("id").primaryKey(),
  importId: integer("import_id").references(() => importsTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  grade: text("grade").notNull(),
  season: integer("season"),
  games: integer("games"),
  innings: integer("innings"),
  notOuts: integer("not_outs"),
  runs: integer("runs"),
  highScore: text("high_score"),
  fifties: integer("fifties"),
  hundreds: integer("hundreds"),
  wickets: integer("wickets"),
  runsConceded: integer("runs_conceded"),
  bestBowling: text("best_bowling"),
  fiveWickets: integer("five_wickets"),
  catches: integer("catches"),
  stumpings: integer("stumpings"),
  runOuts: integer("run_outs"),
});

export const insertPlayerGradeSeasonStatSchema = createInsertSchema(playerGradeSeasonStatsTable).omit({ id: true });
export type InsertPlayerGradeSeasonStat = z.infer<typeof insertPlayerGradeSeasonStatSchema>;
export type PlayerGradeSeasonStat = typeof playerGradeSeasonStatsTable.$inferSelect;
