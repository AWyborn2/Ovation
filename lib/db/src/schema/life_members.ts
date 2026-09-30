import { pgTable, serial, integer, text, boolean, index } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

export const lifeMembersTable = pgTable(
  "life_members",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    name: text("name").notNull(),
    inductionYear: integer("induction_year").notNull(),
    isPlayingMember: boolean("is_playing_member").notNull().default(true),
    // A player id in the TENANT's id space (its crosswalk ints; for Halls Head
    // also its native players.id while it reads native) — deliberately no FK to
    // the native players table (hybrid stats plan U8, KTD3). Writes are checked
    // by assertPlayerInTenantSpace (api-server/src/lib/curated-player-space.ts).
    playerId: integer("player_id"),
    roleLabel: text("role_label"),
    blurb: text("blurb").notNull().default(""),
  },
  (t) => ({
    idxTenant: index("life_members_tenant_idx").on(t.tenantId),
  }),
);

export type LifeMemberRow = typeof lifeMembersTable.$inferSelect;
