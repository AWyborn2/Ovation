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

/**
 * Whether a central club can be provisioned as a new tenant. False once
 * `active_to` is set — the club has folded, or renamed/merged into a
 * successor row (see the lineage columns above). Either way, provisioning
 * THIS id doesn't make sense: the successor row, if any, is what should be
 * signed up instead. Pure and DB-free so both `provisionTenant` (same
 * package) and the `/platform/available-clubs` route (a consumer of
 * `@workspace/db/central`, which re-exports this module) can share one
 * definition without a new cross-package dependency.
 */
export function isCentralClubProvisionable(club: Pick<CentralClubRow, "activeTo">): boolean {
  return club.activeTo == null;
}
