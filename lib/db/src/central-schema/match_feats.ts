import { index, integer, jsonb, text } from "drizzle-orm/pg-core";
import { centralSchema } from "./_schema";

/** What a feat row records, by kind. */
export type CentralFeatDetail =
  | {
      kind: "hatTrick";
      wickets: { seq: number; over: number | null; dismissed: string | null; how: string }[];
    }
  | { kind: "fiveCatches"; catches: number };

/**
 * Central match feats detected from PlayHQ ball-by-ball and fielding data when a
 * match is projected (ADR-005): a hat-trick, or five catches in one innings. One
 * row per feat; the projector deletes and re-inserts a match's rows each time it
 * projects it. `participant_id` links to `players`; private players are excluded
 * at read time like every other achievement.
 */
export const centralMatchFeatsTable = centralSchema.table(
  "match_feats",
  {
    id: integer("id").primaryKey(),
    matchId: integer("match_id").notNull(),
    innings: integer("innings"),
    clubId: integer("club_id"),
    participantId: text("participant_id"),
    playerName: text("player_name"),
    kind: text("kind").notNull().$type<"hatTrick" | "fiveCatches">(),
    detail: jsonb("detail").$type<CentralFeatDetail>(),
  },
  (t) => ({
    // Created by scripts/sql/central-projector.sql; the app never runs DDL against central.
    idxClubMatch: index("idx_central_match_feats_club_match").on(t.clubId, t.matchId),
  }),
);

export type CentralMatchFeatRow = typeof centralMatchFeatsTable.$inferSelect;
