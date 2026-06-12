import { integer, text } from "drizzle-orm/pg-core";
import { centralSchema } from "./_schema";

/**
 * Central PCA club register. Every association club is first-class (unlike the
 * tenant `public.clubs`, which is one-club-centric). Lineage columns
 * (`parent_club_id`, `lineage_role`, `active_from/to`) model club renames/merges.
 */
export const centralClubsTable = centralSchema.table("clubs", {
  clubId: integer("club_id").primaryKey(),
  name: text("name"),
  shortName: text("short_name"),
  primaryColour: text("primary_colour"),
  parentClubId: integer("parent_club_id"),
  lineageRole: text("lineage_role"),
  activeFrom: text("active_from"),
  activeTo: text("active_to"),
});

export type CentralClubRow = typeof centralClubsTable.$inferSelect;
