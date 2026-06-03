import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  real,
  timestamp,
} from "drizzle-orm/pg-core";
import { awardsTable } from "./awards";

/**
 * Per-(award, season) scoring rules for a 'points' award. The award's
 * `pointsGrade` fixes which grade's match stats are tallied; this row controls,
 * for one season, which stat categories count and how many points each is
 * worth. Each category is a (enabled, value) pair: when enabled, the player's
 * seasonal total for that category is multiplied by `value` and added to their
 * score. `includeFinals` decides whether finals matches (matches.stage NOT
 * NULL) are counted alongside regular rounds.
 *
 * Categories:
 *  - runs / wickets / catches / stumpings / runOuts: simple seasonal sums.
 *  - games: count of matches the player has a line in.
 *  - fifties: innings of 50-99 runs. hundreds: innings of 100+.
 *  - fiveWickets: innings of 5+ wickets.
 *
 * The (award_id, season) uniqueness is enforced by `ensure-constraints`, not the
 * Drizzle schema (see cap_register.ts for the rationale).
 */
export const awardPointsConfigTable = pgTable("award_points_config", {
  id: serial("id").primaryKey(),
  awardId: integer("award_id")
    .notNull()
    .references(() => awardsTable.id, { onDelete: "cascade" }),
  season: integer("season").notNull(),
  includeFinals: boolean("include_finals").notNull().default(false),
  // Admin switch for showing the live points leaderboard publicly (mirrors the
  // voting tally's `tallyVisible`).
  leaderboardVisible: boolean("leaderboard_visible").notNull().default(false),

  runsEnabled: boolean("runs_enabled").notNull().default(true),
  runsValue: real("runs_value").notNull().default(1),
  wicketsEnabled: boolean("wickets_enabled").notNull().default(true),
  wicketsValue: real("wickets_value").notNull().default(1),
  catchesEnabled: boolean("catches_enabled").notNull().default(true),
  catchesValue: real("catches_value").notNull().default(1),
  stumpingsEnabled: boolean("stumpings_enabled").notNull().default(true),
  stumpingsValue: real("stumpings_value").notNull().default(1),
  runOutsEnabled: boolean("run_outs_enabled").notNull().default(false),
  runOutsValue: real("run_outs_value").notNull().default(1),
  gamesEnabled: boolean("games_enabled").notNull().default(false),
  gamesValue: real("games_value").notNull().default(0),
  fiftiesEnabled: boolean("fifties_enabled").notNull().default(false),
  fiftiesValue: real("fifties_value").notNull().default(0),
  hundredsEnabled: boolean("hundreds_enabled").notNull().default(false),
  hundredsValue: real("hundreds_value").notNull().default(0),
  fiveWicketsEnabled: boolean("five_wickets_enabled").notNull().default(false),
  fiveWicketsValue: real("five_wickets_value").notNull().default(0),

  finalisedAt: timestamp("finalised_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AwardPointsConfigRow = typeof awardPointsConfigTable.$inferSelect;
