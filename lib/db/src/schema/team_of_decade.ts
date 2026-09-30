import { pgTable, serial, integer, text, boolean, index, unique } from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

export const teamOfDecadeBoardsTable = pgTable(
  "team_of_decade_boards",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    // Unique per tenant (team_of_decade_boards_tenant_key_unique, U8, R17).
    key: text("key").notNull(),
    title: text("title").notNull(),
    teamLabel: text("team_label").notNull().default(""),
    periodLabel: text("period_label").notNull().default(""),
    subtitle: text("subtitle").notNull().default(""),
    published: boolean("published").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => ({
    idxTenant: index("team_of_decade_boards_tenant_idx").on(t.tenantId),
    uqTenantKey: unique("team_of_decade_boards_tenant_key_unique").on(t.tenantId, t.key),
  }),
);

export const teamOfDecadeMembersTable = pgTable(
  "team_of_decade_members",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    boardId: integer("board_id")
      .notNull()
      .references(() => teamOfDecadeBoardsTable.id, { onDelete: "cascade" }),
    // A player id in the TENANT's id space (its crosswalk ints; for Halls Head
    // also its native players.id while it reads native) — deliberately no FK to
    // the native players table (hybrid stats plan U8, KTD3). Writes are checked
    // by assertPlayerInTenantSpace (api-server/src/lib/curated-player-space.ts).
    playerId: integer("player_id"),
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
    idxTenant: index("team_of_decade_members_tenant_idx").on(t.tenantId),
  }),
);

export type TeamOfDecadeBoardRow = typeof teamOfDecadeBoardsTable.$inferSelect;
export type TeamOfDecadeMemberRow = typeof teamOfDecadeMembersTable.$inferSelect;
