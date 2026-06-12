import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { playersTable } from "./players";
import { tenantIdColumn } from "./_tenant";

export const honourBoardsTable = pgTable("honour_boards", {
  id: serial("id").primaryKey(),
  tenantId: tenantIdColumn(),
  // NOTE(tenant): `key` is globally unique today; a true multi-tenant setup
  // wants UNIQUE(tenant_id, key) (move to ensure-constraints.ts per the gotcha).
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  title: text("title").notNull(),
  subtitle: text("subtitle").notNull().default(""),
  headlineLabel: text("headline_label").notNull().default(""),
  supportingLabel: text("supporting_label").notNull().default(""),
  displayOrder: integer("display_order").notNull().default(0),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const honourBoardOverridesTable = pgTable(
  "honour_board_overrides",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    boardKey: text("board_key").notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    pinned: boolean("pinned").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false),
    note: text("note").notNull().default(""),
  },
  (t) => ({
    uniqBoardPlayer: uniqueIndex("hbo_board_player_unique").on(
      t.boardKey,
      t.playerId,
    ),
    idxBoard: index("hbo_board_idx").on(t.boardKey),
  }),
);

export type HonourBoardRow = typeof honourBoardsTable.$inferSelect;
export type HonourBoardOverrideRow =
  typeof honourBoardOverridesTable.$inferSelect;
