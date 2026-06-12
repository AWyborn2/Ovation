import { integer, text } from "drizzle-orm/pg-core";
import { centralSchema } from "./_schema";

/**
 * Central PCA club rename/merge history — one row per name a club held over a
 * season range. Backs the lineage view `v_club_combined`.
 */
export const centralClubNameHistoryTable = centralSchema.table(
  "club_name_history",
  {
    id: integer("id").primaryKey(),
    clubId: integer("club_id"),
    name: text("name"),
    seasonFrom: text("season_from"),
    seasonTo: text("season_to"),
    status: text("status"),
    note: text("note"),
  },
);

export type CentralClubNameHistoryRow =
  typeof centralClubNameHistoryTable.$inferSelect;
