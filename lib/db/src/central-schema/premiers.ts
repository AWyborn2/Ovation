import { integer, text } from "drizzle-orm/pg-core";
import { centralSchema } from "./_schema";

/**
 * Central PCA premiership winners, per season/grade/format. `confidence` flags
 * how certain the record is; `match_id` links the decider where known. Tenant
 * honour boards seed from this but curated overrides stay tenant-side.
 */
export const centralPremiersTable = centralSchema.table("premiers", {
  id: integer("id").primaryKey(),
  season: text("season"),
  grade: text("grade"),
  format: text("format"),
  clubId: integer("club_id"),
  club: text("club"),
  deciderRound: text("decider_round"),
  matchDate: text("match_date"),
  opponentClubId: integer("opponent_club_id"),
  opponent: text("opponent"),
  venue: text("venue"),
  confidence: text("confidence"),
  note: text("note"),
  matchId: integer("match_id"),
});

export type CentralPremierRow = typeof centralPremiersTable.$inferSelect;
