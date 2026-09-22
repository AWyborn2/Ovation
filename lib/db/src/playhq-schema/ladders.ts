import {
  boolean,
  integer,
  jsonb,
  numeric,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { playhqSchema } from "./_schema";

/**
 * The season ladder as PlayHQ publishes it — one row per ladder table x team.
 * A grade can publish several ladders (e.g. "One Day" and "Two Day"), hence
 * `ladder_name` in the key. Numeric columns come back from pg as strings.
 */
export const playhqLaddersTable = playhqSchema.table(
  "ladders",
  {
    gradeId: uuid("grade_id").notNull(),
    ladderName: text("ladder_name").notNull(),
    teamId: uuid("team_id").notNull(),
    teamName: text("team_name"),
    orgId: uuid("org_id"),
    rank: integer("rank"),
    played: integer("played"),
    competitionPoints: numeric("competition_points"),
    bonusPoints: numeric("bonus_points"),
    quotient: numeric("quotient"),
    netRunRate: numeric("net_run_rate"),
    won: integer("won"),
    lost: integer("lost"),
    ties: integer("ties"),
    noResults: integer("no_results"),
    byes: integer("byes"),
    forfeits: integer("forfeits"),
    disqualifications: integer("disqualifications"),
    adjustments: numeric("adjustments"),
    runsFor: integer("runs_for"),
    oversFaced: numeric("overs_faced"),
    wicketsLost: integer("wickets_lost"),
    runsAgainst: integer("runs_against"),
    oversBowled: numeric("overs_bowled"),
    wicketsTaken: integer("wickets_taken"),
    includesAdjustments: boolean("includes_adjustments"),
    includesUnofficial: boolean("includes_unofficial"),
    raw: jsonb("raw"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.gradeId, t.ladderName, t.teamId] }),
  }),
);

export type PlayhqLadderRow = typeof playhqLaddersTable.$inferSelect;
