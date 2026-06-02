import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { importsTable } from "./imports";

/**
 * One row per imported match scorecard (one round, one grade, one season).
 * Retained permanently as the club's game-by-game history. The per-player
 * lines live in `match_player_lines`. Deleting the source import cascades the
 * match (and its lines) away.
 */
export const matchesTable = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    importId: integer("import_id")
      .notNull()
      .references(() => importsTable.id, { onDelete: "cascade" }),
    grade: text("grade").notNull(),
    season: integer("season").notNull(),
    round: integer("round"),
    competition: text("competition"),
    matchDate: text("match_date"),
    venue: text("venue"),
    result: text("result"),
    opponent: text("opponent"),
    hhccScore: text("hhcc_score"),
    opponentScore: text("opponent_score"),
    abandoned: boolean("abandoned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique("matches_grade_season_round_unique").on(t.grade, t.season, t.round)],
);

export type MatchRow = typeof matchesTable.$inferSelect;
