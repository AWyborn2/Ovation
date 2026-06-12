import { integer, text } from "drizzle-orm/pg-core";
import { centralSchema } from "./_schema";

/**
 * Central PCA ladder standings per grade. `club_id` links the club register;
 * `club` is the plain-text label as published.
 */
export const centralLadderTable = centralSchema.table("ladder", {
  id: integer("id").primaryKey(),
  grade: text("grade"),
  clubId: integer("club_id"),
  club: text("club"),
  played: integer("played"),
  won: integer("won"),
  lost: integer("lost"),
  tied: integer("tied"),
  noResult: integer("no_result"),
});

export type CentralLadderRow = typeof centralLadderTable.$inferSelect;
