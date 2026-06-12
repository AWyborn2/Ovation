import { doublePrecision, integer, text } from "drizzle-orm/pg-core";
import { centralSchema } from "./_schema";

/**
 * Central PCA per-innings batting line. `innings` is the 1-based batting
 * sequence; `club_id` identifies which side the line belongs to (filter reads by
 * the tenant's club). `participant_id` links to `players` (NULL for opposition
 * lines without a resolved participant).
 */
export const centralMatchBattingTable = centralSchema.table("match_batting", {
  id: integer("id").primaryKey(),
  matchId: integer("match_id"),
  innings: integer("innings"),
  clubId: integer("club_id"),
  teamName: text("team_name"),
  batOrder: integer("bat_order"),
  participantId: text("participant_id"),
  playerName: text("player_name"),
  runs: integer("runs"),
  balls: integer("balls"),
  fours: integer("fours"),
  sixes: integer("sixes"),
  strikeRate: doublePrecision("strike_rate"),
  dismissal: text("dismissal"),
  dismissalType: text("dismissal_type"),
  fielder: text("fielder"),
});

export type CentralMatchBattingRow =
  typeof centralMatchBattingTable.$inferSelect;
