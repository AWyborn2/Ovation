import { pgTable, serial, integer, text, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { type z } from "zod/v4";
import { tenantIdColumn } from "./_tenant";

export const premiershipsTable = pgTable(
  "premierships",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    year: integer("year").notNull(),
    grade: text("grade").notNull(),
    competition: text("competition").notNull(),
    venue: text("venue"),
    matchDate: text("match_date"),
    result: text("result"),
    mom: text("mom"),
    notes: text("notes"),
    /**
     * `central.premiers.id` this row was seeded from (central-backed tenants
     * only; null for hand-curated rows). The seeding key: a re-seed matches on
     * it and only backfills, so a club's own edits are never overwritten.
     */
    centralPremierId: integer("central_premier_id"),
    /**
     * `central.matches.match_id` of the decider — the Grand Final scorecard a
     * central-backed tenant's `/matches/:id` serves. Null when unknown.
     */
    centralMatchId: integer("central_match_id"),
  },
  (t) => ({
    idxTenant: index("premierships_tenant_idx").on(t.tenantId),
    uniqTenantCentralPremier: uniqueIndex("premierships_tenant_central_premier_uq").on(
      t.tenantId,
      t.centralPremierId,
    ),
  }),
);

export const premiershipPlayersTable = pgTable(
  "premiership_players",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    premiershipId: integer("premiership_id")
      .notNull()
      .references(() => premiershipsTable.id, { onDelete: "cascade" }),
    // A player id in the TENANT's id space (its crosswalk ints; for Halls Head
    // also its native players.id while it reads native) — deliberately no FK to
    // the native players table (hybrid stats plan U8, KTD3). Writes are checked
    // by assertPlayerInTenantSpace (api-server/src/lib/curated-player-space.ts).
    playerId: integer("player_id"),
    name: text("name").notNull(),
    isCaptain: boolean("is_captain").notNull().default(false),
    isMotm: boolean("is_motm").notNull().default(false),
    battingOrder: integer("batting_order"),
    /**
     * Central PlayHQ participant GUID for a player seeded from a central
     * scorecard (or linked by a central-backed tenant's admin). Such a row's
     * `player_id` stays null and the link is resolved at read time through the
     * tenant's `player_id_map`, so a merged-away GUID lands on its keeper.
     */
    participantId: text("participant_id"),
  },
  (t) => ({
    idxTenant: index("premiership_players_tenant_idx").on(t.tenantId),
    idxPremiership: index("premiership_players_premiership_idx").on(t.premiershipId),
  }),
);

export const insertPremiershipSchema = createInsertSchema(premiershipsTable).omit({ id: true });
export type InsertPremiership = z.infer<typeof insertPremiershipSchema>;
export type Premiership = typeof premiershipsTable.$inferSelect;

export const insertPremiershipPlayerSchema = createInsertSchema(premiershipPlayersTable).omit({
  id: true,
});
export type InsertPremiershipPlayer = z.infer<typeof insertPremiershipPlayerSchema>;
export type PremiershipPlayer = typeof premiershipPlayersTable.$inferSelect;
