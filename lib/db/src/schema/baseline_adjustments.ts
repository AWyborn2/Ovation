import { pgTable, serial, integer, text, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { playersTable } from "./players";

/**
 * Records the per-(grade, season, player) counting-stat deltas that a "peel"
 * backfill subtracted from the season=NULL baseline snapshot, so the peel can be
 * reversed exactly (even when it floored a player's baseline at zero).
 *
 * One row per affected player. The presence of any row for a (grade, season)
 * means that season was committed in "peel" mode; an "add" backfill stores
 * nothing here. Stored values are the POSITIVE amounts actually removed from the
 * baseline (>= 0, never more than the baseline held).
 */
export const baselineAdjustmentsTable = pgTable(
  "baseline_adjustments",
  {
    id: serial("id").primaryKey(),
    grade: text("grade").notNull(),
    season: integer("season").notNull(),
    playerId: integer("player_id")
      .notNull()
      .references(() => playersTable.id, { onDelete: "cascade" }),
    games: integer("games").notNull().default(0),
    innings: integer("innings").notNull().default(0),
    notOuts: integer("not_outs").notNull().default(0),
    runs: integer("runs").notNull().default(0),
    fifties: integer("fifties").notNull().default(0),
    hundreds: integer("hundreds").notNull().default(0),
    wickets: integer("wickets").notNull().default(0),
    runsConceded: integer("runs_conceded").notNull().default(0),
    fiveWickets: integer("five_wickets").notNull().default(0),
    catches: integer("catches").notNull().default(0),
    stumpings: integer("stumpings").notNull().default(0),
    runOuts: integer("run_outs").notNull().default(0),
  },
  (t) => [unique().on(t.grade, t.season, t.playerId)],
);

export const insertBaselineAdjustmentSchema = createInsertSchema(
  baselineAdjustmentsTable,
).omit({ id: true });
export type InsertBaselineAdjustment = z.infer<
  typeof insertBaselineAdjustmentSchema
>;
export type BaselineAdjustment = typeof baselineAdjustmentsTable.$inferSelect;
