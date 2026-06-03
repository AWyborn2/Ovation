import { pgTable, serial, integer, text, boolean } from "drizzle-orm/pg-core";
import { matchesTable } from "./matches";

/**
 * One row per OPPOSITION player per match, captured at import time purely for
 * display on the match detail page. The player's name is stored as plain text:
 * there is intentionally NO foreign key to the club players table, and these
 * rows must NEVER be summed into any club aggregate, record, leaderboard or
 * honour board. Deleting the source match cascades these away.
 */
export const matchOppositionLinesTable = pgTable("match_opposition_lines", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matchesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
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

export type MatchOppositionLineRow = typeof matchOppositionLinesTable.$inferSelect;
