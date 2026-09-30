import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

export const honourBoardsTable = pgTable(
  "honour_boards",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    // Unique per tenant (honour_boards_tenant_key_unique): two clubs may each
    // have an "a-grade-premiers" board (hybrid stats plan U8, R17).
    key: text("key").notNull(),
    label: text("label").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    headlineLabel: text("headline_label").notNull().default(""),
    supportingLabel: text("supporting_label").notNull().default(""),
    displayOrder: integer("display_order").notNull().default(0),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({
    idxTenant: index("honour_boards_tenant_idx").on(t.tenantId),
    uqTenantKey: unique("honour_boards_tenant_key_unique").on(t.tenantId, t.key),
  }),
);

export const honourBoardOverridesTable = pgTable(
  "honour_board_overrides",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    boardKey: text("board_key").notNull(),
    // A player id in the TENANT's id space (its crosswalk ints; for Halls Head
    // also its native players.id while it reads native) — deliberately no FK to
    // the native players table (hybrid stats plan U8, KTD3). Writes are checked
    // by assertPlayerInTenantSpace (api-server/src/lib/curated-player-space.ts).
    playerId: integer("player_id").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    hidden: boolean("hidden").notNull().default(false),
    note: text("note").notNull().default(""),
  },
  (t) => ({
    uniqBoardPlayer: uniqueIndex("hbo_tenant_board_player_unique").on(
      t.tenantId,
      t.boardKey,
      t.playerId,
    ),
    idxBoard: index("hbo_board_idx").on(t.boardKey),
    idxTenant: index("honour_board_overrides_tenant_idx").on(t.tenantId),
  }),
);

export type HonourBoardRow = typeof honourBoardsTable.$inferSelect;
export type HonourBoardOverrideRow = typeof honourBoardOverridesTable.$inferSelect;
