import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { awardsTable } from "./awards";
import { captainsTable } from "./captains";
import { playersTable } from "./players";

/**
 * Per-(award, season) 3-2-1 voting configuration. An award only becomes a voted
 * award for a given season once a config row exists with `votingEnabled = true`.
 * `grades` lists which grade(s) the award's votes are drawn from.
 *
 * The (award_id, season) uniqueness is enforced by `ensure-constraints`, not the
 * Drizzle schema (see captains.ts / cap_register.ts for the rationale).
 */
export const awardVotingConfigTable = pgTable("award_voting_config", {
  id: serial("id").primaryKey(),
  awardId: integer("award_id")
    .notNull()
    .references(() => awardsTable.id, { onDelete: "cascade" }),
  season: integer("season").notNull(),
  votingEnabled: boolean("voting_enabled").notNull().default(true),
  votingOpen: boolean("voting_open").notNull().default(true),
  grades: text("grades").array().notNull().default([]),
  // Public live-tally visibility. `tallyVisible` is the admin's manual switch;
  // `autoHideAfterRounds`, when set, hides the tally once that many rounds have
  // been played (votable rounds with at least one ballot) in the tracked grades.
  tallyVisible: boolean("tally_visible").notNull().default(false),
  autoHideAfterRounds: integer("auto_hide_after_rounds"),
  finalisedAt: timestamp("finalised_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One 3-2-1 ballot per captain per round per grade for a voted award+season.
 * The three picks are the player who polled 3, 2 and 1 votes respectively.
 * Uniqueness on (config_id, captain_id, grade, round) is enforced by
 * `ensure-constraints`.
 */
export const awardBallotsTable = pgTable("award_ballots", {
  id: serial("id").primaryKey(),
  configId: integer("config_id")
    .notNull()
    .references(() => awardVotingConfigTable.id, { onDelete: "cascade" }),
  captainId: integer("captain_id")
    .notNull()
    .references(() => captainsTable.id, { onDelete: "cascade" }),
  grade: text("grade").notNull(),
  round: integer("round").notNull(),
  pick1PlayerId: integer("pick1_player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  pick2PlayerId: integer("pick2_player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  pick3PlayerId: integer("pick3_player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AwardVotingConfigRow = typeof awardVotingConfigTable.$inferSelect;
export type AwardBallotRow = typeof awardBallotsTable.$inferSelect;
