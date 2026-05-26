import { pgTable, serial, integer, text, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";

export const playerGradeStatsTable = pgTable("player_grade_stats", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => playersTable.id, { onDelete: "cascade" }),
  surname: text("surname").notNull(),
  givenName: text("given_name").notNull(),
  grade: text("grade").notNull(),
  games: integer("games"),
  innings: integer("innings"),
  notOuts: integer("not_outs"),
  runs: integer("runs"),
  batAvg: real("bat_avg"),
  highScore: text("high_score"),
  fifties: integer("fifties"),
  hundreds: integer("hundreds"),
  wickets: integer("wickets"),
  runsConceded: integer("runs_conceded"),
  bowlAvg: real("bowl_avg"),
  bestBowling: text("best_bowling"),
  fiveWickets: integer("five_wickets"),
  catches: integer("catches"),
  stumpings: integer("stumpings"),
  runOuts: integer("run_outs"),
});

export const insertPlayerGradeStatSchema = createInsertSchema(playerGradeStatsTable).omit({ id: true });
export type InsertPlayerGradeStat = z.infer<typeof insertPlayerGradeStatSchema>;
export type PlayerGradeStat = typeof playerGradeStatsTable.$inferSelect;
