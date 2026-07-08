import { index, integer, text } from "drizzle-orm/pg-core";
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
}, (t) => ({
  // Live index on the central DB (migration central_perf_indexes_club_and_match,
  // 2026-07-09). Documentation only — the app never runs DDL against central.
  idxClubMatch: index("idx_central_match_rosters_club_match").on(t.clubId, t.matchId),
}));

export type CentralMatchRosterRow =
  typeof centralMatchRostersTable.$inferSelect;
