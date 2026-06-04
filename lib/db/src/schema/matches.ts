import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { importsTable } from "./imports";
import { playersTable } from "./players";

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

/**
 * Admin-recorded hat-tricks for a match. Hat-tricks cannot be reliably
 * auto-detected from a scorecard, so an admin flags the bowler manually on the
 * match page. One row per (match, player). No DB-level composite unique is
 * declared — drizzle-kit 0.31 can't introspect it and would hang the
 * non-interactive post-merge push on a TTY prompt (see cap_register.ts) — so
 * the toggle endpoint enforces uniqueness in application code (check-then
 * insert/delete). Surfaces on the Milestones board as a dated achievement and
 * cascades away with the match (and thus its source import).
 */
export const matchHatTricksTable = pgTable("match_hat_tricks", {
  id: serial("id").primaryKey(),
  matchId: integer("match_id")
    .notNull()
    .references(() => matchesTable.id, { onDelete: "cascade" }),
  playerId: integer("player_id")
    .notNull()
    .references(() => playersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MatchHatTrickRow = typeof matchHatTricksTable.$inferSelect;
