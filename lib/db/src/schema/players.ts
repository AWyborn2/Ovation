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
  // Placeholder players used to fill an XI in a scorecard (master IDs from
  // 90001). Hidden from the public directory. Loaded from the master DB.
  isFillIn: boolean("is_fill_in").notNull().default(false),
  // Capped A-grade players whose career stats were never registered (master IDs
  // from 95001). They appear in the cap register but carry no recorded stats.
  isCapOnly: boolean("is_cap_only").notNull().default(false),
});

export const insertPlayerSchema = createInsertSchema(playersTable).omit({ id: true });
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof playersTable.$inferSelect;
