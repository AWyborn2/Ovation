import { integer, text } from "drizzle-orm/pg-core";
import { centralSchema } from "./_schema";

/**
 * Central PCA fielding contributions (catches/stumpings/run-outs). `kind`
 * distinguishes the dismissal type; aggregated by the `v_player_fielding` view.
 */
export const centralFieldingTable = centralSchema.table("fielding", {
  id: integer("id").primaryKey(),
  matchId: integer("match_id"),
  clubId: integer("club_id"),
  participantId: text("participant_id"),
  playerName: text("player_name"),
  kind: text("kind"),
});

export type CentralFieldingRow = typeof centralFieldingTable.$inferSelect;
