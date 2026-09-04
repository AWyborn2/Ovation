import { pgTable, serial, integer, text, boolean, index } from "drizzle-orm/pg-core";
import { playersTable } from "./players";
import { tenantIdColumn } from "./_tenant";

export const lifeMembersTable = pgTable(
  "life_members",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    name: text("name").notNull(),
    inductionYear: integer("induction_year").notNull(),
    isPlayingMember: boolean("is_playing_member").notNull().default(true),
    playerId: integer("player_id").references(() => playersTable.id, {
      onDelete: "set null",
    }),
    roleLabel: text("role_label"),
    blurb: text("blurb").notNull().default(""),
  },
  (t) => ({
    idxTenant: index("life_members_tenant_idx").on(t.tenantId),
  }),
);

export type LifeMemberRow = typeof lifeMembersTable.$inferSelect;
