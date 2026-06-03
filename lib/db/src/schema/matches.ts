import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { importsTable } from "./imports";

/**
 * One row per imported match scorecard, identified by (grade, season, round,
 * stage). A regular match carries a numeric `round` with `stage` NULL; a finals
 * match carries a `stage` name (e.g. "Grand Final") with `round` NULL.
 * Retained permanently as the club's game-by-game history. The per-player
 * lines live in `match_player_lines`. Deleting the source import cascades the
 * match (and its lines) away.
 *
 * The identity uniqueness — `UNIQUE NULLS NOT DISTINCT (grade, season, round,
 * stage)` — is intentionally NOT declared here. drizzle-kit 0.31 cannot detect
 * existing multi-column / NULLS-NOT-DISTINCT uniques, so it re-proposes them
 * every push and hangs the non-interactive post-merge on a TTY prompt. It is
 * created idempotently by scripts/src/ensure-constraints.ts instead. See
 * lib/db/src/schema/cap_register.ts for the full rationale.
 */
export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  importId: integer("import_id")
    .notNull()
    .references(() => importsTable.id, { onDelete: "cascade" }),
  grade: text("grade").notNull(),
  season: integer("season").notNull(),
  round: integer("round"),
  stage: text("stage"),
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
});

export type MatchRow = typeof matchesTable.$inferSelect;
