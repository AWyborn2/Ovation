import { pgTable, serial, integer, text, boolean } from "drizzle-orm/pg-core";
import { playersTable } from "./players";
import { tenantIdColumn } from "./_tenant";

export const lifeMembersTable = pgTable("life_members", {
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
});

export type LifeMemberRow = typeof lifeMembersTable.$inferSelect;
