import { integer, text } from "drizzle-orm/pg-core";
import { centralSchema } from "./_schema";

/**
 * Central PCA player register, keyed on PlayHQ's career-stable participant GUID.
 * `is_private` is INTEGER 0/1 (not boolean). Career figures come from the `v_*`
 * views, not from this row.
 */
export const centralPlayersTable = centralSchema.table("players", {
  participantId: text("participant_id").primaryKey(),
  displayName: text("display_name"),
  isPrivate: integer("is_private"),
  currentClubId: integer("current_club_id"),
  firstSeason: text("first_season"),
  lastSeason: text("last_season"),
  matches: integer("matches"),
});

export type CentralPlayerRow = typeof centralPlayersTable.$inferSelect;
