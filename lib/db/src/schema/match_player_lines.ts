import { pgTable, serial, integer, text, boolean } from "drizzle-orm/pg-core";
import { matchesTable } from "./matches";
import { playersTable } from "./players";

/**
 * One row per HHCC player per match: their batting line, bowling line, and
 * fielding tally for that single game. Season aggregates are derived by summing
 * these rows; the rows themselves are the permanent per-match record surfaced
 * on the player profile.
 */
export const matchPlayerLinesTable = pgTable("match_player_lines", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matchesTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  // Batting
  batted: boolean("batted").notNull().default(false),
  battingPos: integer("batting_pos"),
  runs: integer("runs"),
  balls: integer("balls"),
  fours: integer("fours"),
  sixes: integer("sixes"),
  notOut: boolean("not_out").notNull().default(false),
  dismissal: text("dismissal"),
  // Bowling
  bowled: boolean("bowled").notNull().default(false),
  overs: text("overs"),
  maidens: integer("maidens"),
  runsConceded: integer("runs_conceded"),
  wickets: integer("wickets"),
  wides: integer("wides"),
  noBalls: integer("no_balls"),
  // Fielding
  catches: integer("catches").notNull().default(0),
  stumpings: integer("stumpings").notNull().default(0),
  runOuts: integer("run_outs").notNull().default(0),
});

export type MatchPlayerLineRow = typeof matchPlayerLinesTable.$inferSelect;
