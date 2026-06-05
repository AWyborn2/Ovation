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
import { clubsTable } from "./clubs";

/**
 * One row per imported match scorecard, identified by (grade, season, round,
 * stage). A regular match carries a numeric `round` with `stage` NULL; a finals
 * match carries a `stage` name (e.g. "Grand Final") with `round` NULL.
 * Retained permanently as the club's game-by-game history. The per-player
 * lines live in `match_player_lines`. Deleting the source import cascades the
 * match (and its lines) away.
 *
 * Identity uniqueness is intentionally NOT declared here. drizzle-kit 0.31
 * cannot detect existing multi-column / NULLS-NOT-DISTINCT / partial uniques, so
 * it re-proposes them every push and hangs the non-interactive post-merge on a
 * TTY prompt. They are created idempotently by scripts/src/ensure-constraints.ts
 * instead. See lib/db/src/schema/cap_register.ts for the full rationale.
 *
 * Two ingestion paths key matches differently, so there are two partial uniques:
 *   - Admin per-match uploads carry `source_key = NULL`; they are unique on
 *     `(grade, season, round, stage)` (NULLS NOT DISTINCT) — one match per round.
 *   - The bulk master-DB load stores the master `source_key`; those rows are
 *     unique on `source_key` instead, because parallel competitions (Mid-Year
 *     T20 rolling into the base grade) and multi-fixture Colts/finals rounds make
 *     (grade, season, round, stage) genuinely collide in the historical data.
 */
export const matchesTable = pgTable("matches", {
  id: serial("id").primaryKey(),
  importId: integer("import_id")
    .notNull()
    .references(() => importsTable.id, { onDelete: "cascade" }),
  /**
   * Master-DB identity for bulk-loaded historical matches; NULL for admin
   * per-match uploads. See the partial uniques in ensure-constraints.ts.
   */
  sourceKey: text("source_key"),
  grade: text("grade").notNull(),
  season: integer("season").notNull(),
  round: integer("round"),
  stage: text("stage"),
  competition: text("competition"),
  matchDate: text("match_date"),
  venue: text("venue"),
  result: text("result"),
  opponent: text("opponent"),
  /**
   * Resolved opponent club for branding (logo / colours). NULL when the
   * opponent is only known by a grade label, so rendering must degrade.
   */
  opponentClubId: integer("opponent_club_id").references(() => clubsTable.id, {
    onDelete: "set null",
  }),
  hhccScore: text("hhcc_score"),
  opponentScore: text("opponent_score"),
  /**
   * True when Halls Head batted first, false when they batted second, NULL when
   * unknown. Backfilled from the master DB's innings-order export so the
   * scorecard can render the two innings in true batting order rather than
   * always putting HH first. Uploads leave this NULL (HH-first is assumed).
   */
  hhccBattedFirst: boolean("hhcc_batted_first"),
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
