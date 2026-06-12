import { integer, text } from "drizzle-orm/pg-core";
import { centralSchema } from "./_schema";

/**
 * Central PCA team list for a match — used where a fixture was played but no
 * scorecard was recorded ("Played (stats not recorded)").
 */
export const centralMatchRostersTable = centralSchema.table("match_rosters", {
  id: integer("id").primaryKey(),
  matchId: integer("match_id"),
  clubId: integer("club_id"),
  teamName: text("team_name"),
  participantId: text("participant_id"),
  playerName: text("player_name"),
});

export type CentralMatchRosterRow =
  typeof centralMatchRostersTable.$inferSelect;
