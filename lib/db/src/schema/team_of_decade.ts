import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";
import { tenantIdColumn } from "./_tenant";

export const teamOfDecadeBoardsTable = pgTable("team_of_decade_boards", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdColumn(),
  // NOTE(tenant): `key` is globally unique; multi-tenant wants UNIQUE(tenant_id, key).
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  teamLabel: text("team_label").notNull().default(""),
  periodLabel: text("period_label").notNull().default(""),
  subtitle: text("subtitle").notNull().default(""),
  published: boolean("published").notNull().default(false),
  displayOrder: integer("display_order").notNull().default(0),
});

export const teamOfDecadeMembersTable = pgTable(
  "team_of_decade_members",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    boardId: integer("board_id")
      .notNull()
      .references(() => teamOfDecadeBoardsTable.id, { onDelete: "cascade" }),
    playerId: integer("player_id").references(() => playersTable.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    battingOrder: integer("batting_order").notNull().default(0),
    role: text("role").notNull().default(""),
    isCaptain: boolean("is_captain").notNull().default(false),
    isViceCaptain: boolean("is_vice_captain").notNull().default(false),
    isWicketkeeper: boolean("is_wicketkeeper").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => ({
    idxBoard: index("tod_members_board_idx").on(t.boardId),
  }),
);

export type TeamOfDecadeBoardRow = typeof teamOfDecadeBoardsTable.$inferSelect;
export type TeamOfDecadeMemberRow =
  typeof teamOfDecadeMembersTable.$inferSelect;
