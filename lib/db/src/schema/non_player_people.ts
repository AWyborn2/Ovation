import { pgTable, serial, text, index } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

/**
 * Non-player people — club officials who served the club (e.g. Secretaries,
 * Treasurers) but never played a game, so they have no row in `players`.
 *
 * Lightweight by design: a name and an optional bio. A `club_roles` row can
 * link to one of these instead of a player (see `club_roles.nonPlayerId`),
 * which lets committee/captain rows render a clickable name with a small bio
 * page for people who would otherwise be dead plain text forever.
 */
export const nonPlayerPeopleTable = pgTable(
  "non_player_people",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    name: text("name").notNull(),
    bio: text("bio"),
  },
  (t) => ({
    idxTenant: index("non_player_people_tenant_idx").on(t.tenantId),
  }),
);

export type NonPlayerPersonRow = typeof nonPlayerPeopleTable.$inferSelect;
