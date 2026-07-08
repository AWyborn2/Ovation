import { doublePrecision, index, integer, text } from "drizzle-orm/pg-core";
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
}, (t) => ({
  // Live index on the central DB (migration central_perf_indexes_club_and_match,
  // 2026-07-09). Documentation only — the app never runs DDL against central.
  idxClubMatch: index("idx_central_match_bowling_club_match").on(t.clubId, t.matchId),
}));

export type CentralMatchBowlingRow =
  typeof centralMatchBowlingTable.$inferSelect;
