import { index, integer, text } from "drizzle-orm/pg-core";
import { centralSchema } from "./_schema";

/**
 * Central PCA fielding contributions (catches/stumpings/run-outs). `kind`
 * distinguishes the dismissal type; aggregated by the `v_player_fielding` view.
 */
export const centralFieldingTable = centralSchema.table(
  "fielding",
  {
    id: integer("id").primaryKey(),
    matchId: integer("match_id"),
    clubId: integer("club_id"),
    participantId: text("participant_id"),
    playerName: text("player_name"),
    kind: text("kind"),
  },
  (t) => ({
    // Live index on the central DB (migration central_perf_indexes_club_and_match,
    // 2026-07-09). Documentation only — the app never runs DDL against central.
    idxClubMatch: index("idx_central_fielding_club_match").on(t.clubId, t.matchId),
  }),
);

export type CentralFieldingRow = typeof centralFieldingTable.$inferSelect;
