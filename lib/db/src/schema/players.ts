import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const playersTable = pgTable("players", {
  id: serial("id").primaryKey(),
  surname: text("surname").notNull(),
  givenName: text("given_name").notNull(),
  gradesPlayed: text("grades_played"),
  totalGames: integer("total_games"),
  totalRuns: integer("total_runs"),
  totalWickets: integer("total_wickets"),
  deceased: boolean("deceased").notNull().default(false),
  imageUrl: text("image_url"),
  cardRole: text("card_role"),
  cardRating: integer("card_rating"),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
