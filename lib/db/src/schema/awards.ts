import { pgTable, serial, integer, text, boolean, index, check, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenantIdColumn } from "./_tenant";

export const awardsTable = pgTable(
  "awards",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    // Unique per tenant (awards_tenant_key_unique, hybrid stats plan U8, R17).
    key: text("key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    displayOrder: integer("display_order").notNull().default(0),
    votingEnabled: boolean("voting_enabled").notNull().default(false),
    // How a season's winner is determined: 'voted' (captain 3-2-1 ballots),
    // 'points' (auto-tallied from match stats for `pointsGrade`), or 'manual'
    // (admin records the winner directly).
    mechanism: text("mechanism").notNull().default("manual"),
    // Public visibility. Draft awards (published=false) are admin-only.
    published: boolean("published").notNull().default(false),
    // For 'points' awards: the single grade whose match stats are tallied.
    pointsGrade: text("points_grade"),
  },
  (t) => ({
    idxTenant: index("awards_tenant_idx").on(t.tenantId),
    uqTenantKey: unique("awards_tenant_key_unique").on(t.tenantId, t.key),
    chkMechanism: check(
      "awards_mechanism_check",
      sql`"mechanism" IN ('voted', 'points', 'manual')`,
    ),
  }),
);

export const awardWinnersTable = pgTable(
  "award_winners",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    awardId: integer("award_id")
      .notNull()
      .references(() => awardsTable.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    // A player id in the TENANT's id space (its crosswalk ints; for Halls Head
    // also its native players.id while it reads native) — deliberately no FK to
    // the native players table (hybrid stats plan U8, KTD3). Writes are checked
    // by assertPlayerInTenantSpace (api-server/src/lib/curated-player-space.ts).
    playerId: integer("player_id"),
    // NULL uses the legacy playerId. [] explicitly means no links.
    // No native FK: these are tenant-scoped native or crosswalk identities.
    playerIds: integer("player_ids").array(),
    name: text("name").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    // Public visibility for an individual winner row. Defaults true so a
    // recorded winner shows once its award is published.
    published: boolean("published").notNull().default(true),
  },
  (t) => ({
    idxAward: index("award_winners_award_idx").on(t.awardId),
    idxTenant: index("award_winners_tenant_idx").on(t.tenantId),
  }),
);

export type AwardRow = typeof awardsTable.$inferSelect;
export type AwardWinnerRow = typeof awardWinnersTable.$inferSelect;
