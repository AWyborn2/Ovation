import { doublePrecision, integer, text } from "drizzle-orm/pg-core";
import { centralSchema } from "./_schema";

/**
 * Central PCA per-innings bowling line. `innings` is the 1-based batting
 * sequence the bowling was delivered in; `club_id` is the bowling side.
 */
export const centralMatchBowlingTable = centralSchema.table("match_bowling", {
  id: integer("id").primaryKey(),
  matchId: integer("match_id"),
  innings: integer("innings"),
  clubId: integer("club_id"),
  teamName: text("team_name"),
  participantId: text("participant_id"),
  playerName: text("player_name"),
  overs: doublePrecision("overs"),
  maidens: integer("maidens"),
  runs: integer("runs"),
  wickets: integer("wickets"),
  economy: doublePrecision("economy"),
  wides: integer("wides"),
  noBalls: integer("no_balls"),
});

export type CentralMatchBowlingRow =
  typeof centralMatchBowlingTable.$inferSelect;
