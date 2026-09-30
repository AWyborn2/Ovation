import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

/**
 * Club history store (hybrid stats plan U9; R12, R13, KTD3, KTD4, KTD5).
 *
 * Central supplies every season it covers; this tenant-scoped store holds a
 * club's STATS history from before that — pre-digital career totals, season
 * totals and match lines — at whatever grain the club kept them. Imported
 * honours (honour boards, awards, records, centuries lists) do NOT come here:
 * they go into the existing curated tables so they appear on the pages clubs
 * already use (KTD4). The native stats tables are untouched; Halls Head's stay
 * its rollback path and seed its club history (U12).
 *
 * Nothing reads these tables yet — the club overlay (U10) consumes them.
 *
 * Player ids (KTD3): `player_id` is an id in the TENANT's player space, i.e.
 * the tenant's `player_id_map` ints (for Halls Head also its native
 * `players.id` while it reads native). There is deliberately no FK to the
 * native `players` table — another tenant's id 5 is not Halls Head's player 5.
 * A pre-digital-only player (never seen by central) gets a SYNTHETIC crosswalk
 * entry minted in `player_id_map` with a club-local participant key
 * (`club:<uuid>`, see player_id_map.ts), so they share the same id space.
 */

/** Grain of a history row. */
export const CLUB_HISTORY_GRAINS = ["career", "season", "match"] as const;
export type ClubHistoryGrain = (typeof CLUB_HISTORY_GRAINS)[number];

/**
 * One import of club history (a spreadsheet, a scanned book, the Halls Head
 * native seed). Undo = delete the batch: its rows and coverage cascade.
 */
export const clubHistoryBatchesTable = pgTable(
  "club_history_batches",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    /** Where the data came from, e.g. "xlsx", "scorebook", "hh-native-seed". */
    source: text("source").notNull(),
    /** Admin-facing label, e.g. "1985–2002 career totals (club book)". */
    label: text("label").notNull(),
    note: text("note"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenant: index("club_history_batches_tenant_idx").on(t.tenantId),
  }),
);

/**
 * What a batch covers (R13): one row per (grade, season) it supplies; a null
 * season means career-grain rows with no season. Kept as rows rather than a
 * grades × seasons cross product because coverage is rarely rectangular
 * (A Grade 1985–2002, B Grade 1995–2002). The boundary check and the cut-over
 * preview (U13) read this to find overlap with central seasons (KTD5).
 */
export const clubHistoryBatchCoverageTable = pgTable(
  "club_history_batch_coverage",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => clubHistoryBatchesTable.id, { onDelete: "cascade" }),
    /** App grade string (the same labels the grade classifier produces). */
    grade: text("grade").notNull(),
    /** Season start year (2003 = 2003/04). Null = career grain. */
    season: integer("season"),
  },
  (t) => ({
    idxTenant: index("club_history_batch_coverage_tenant_idx").on(t.tenantId),
    idxBatch: index("club_history_batch_coverage_batch_idx").on(t.batchId),
    uqBatchGradeSeason: unique("club_history_batch_coverage_batch_grade_season_unique")
      .on(t.batchId, t.grade, t.season)
      .nullsNotDistinct(),
  }),
);

/**
 * One history stat line. Figures follow `player_grade_season_stats`, with the
 * high score and best bowling split into sortable parts and bowling kept as
 * balls (overs = floor(balls / 6) + (balls % 6) / 10 on display) so 6-ball
 * sums stay exact. Every figure is nullable: old books often record runs and
 * wickets but not balls faced or fours.
 *
 * Grain rules (checked): career rows have no season; season and match rows
 * have one. Match rows may carry a descriptor (date, opponent, round).
 */
export const clubHistoryRowsTable = pgTable(
  "club_history_rows",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => clubHistoryBatchesTable.id, { onDelete: "cascade" }),
    /** Tenant-space player id (KTD3). No FK to native players by design. */
    playerId: integer("player_id").notNull(),
    /** App grade string. */
    grade: text("grade").notNull(),
    /** Season start year. Null only for career grain. */
    season: integer("season"),
    grain: text("grain").$type<ClubHistoryGrain>().notNull(),

    // ── Match descriptor (match grain only) ─────────────────────────────────
    matchDate: date("match_date"),
    opponent: text("opponent"),
    round: text("round"),

    // ── Batting ─────────────────────────────────────────────────────────────
    games: integer("games"),
    innings: integer("innings"),
    notOuts: integer("not_outs"),
    runs: integer("runs"),
    highScore: integer("high_score"),
    highScoreNotOut: boolean("high_score_not_out"),
    ballsFaced: integer("balls_faced"),
    fours: integer("fours"),
    sixes: integer("sixes"),
    fifties: integer("fifties"),
    hundreds: integer("hundreds"),

    // ── Bowling ─────────────────────────────────────────────────────────────
    ballsBowled: integer("balls_bowled"),
    maidens: integer("maidens"),
    runsConceded: integer("runs_conceded"),
    wickets: integer("wickets"),
    bestBowlingWickets: integer("best_bowling_wickets"),
    bestBowlingRuns: integer("best_bowling_runs"),
    fiveWickets: integer("five_wickets"),

    // ── Fielding ────────────────────────────────────────────────────────────
    catches: integer("catches"),
    stumpings: integer("stumpings"),
    runOuts: integer("run_outs"),
  },
  (t) => ({
    idxTenant: index("club_history_rows_tenant_idx").on(t.tenantId),
    idxBatch: index("club_history_rows_batch_idx").on(t.batchId),
    idxTenantPlayer: index("club_history_rows_tenant_player_idx").on(t.tenantId, t.playerId),
    idxTenantGradeSeason: index("club_history_rows_tenant_grade_season_idx").on(
      t.tenantId,
      t.grade,
      t.season,
    ),
    chkGrain: check("club_history_rows_grain_check", sql`"grain" IN ('career', 'season', 'match')`),
    chkGrainSeason: check(
      "club_history_rows_grain_season_check",
      sql`("grain" = 'career') = ("season" IS NULL)`,
    ),
    chkMatchDescriptor: check(
      "club_history_rows_match_descriptor_check",
      sql`"grain" = 'match' OR ("match_date" IS NULL AND "opponent" IS NULL AND "round" IS NULL)`,
    ),
    chkPlayer: check("club_history_rows_player_id_check", sql`"player_id" > 0`),
  }),
);

/**
 * Pre-digital boundary per tenant (R12, KTD5): the FIRST season central
 * supplies. Seasons before it come only from club history; the boundary season
 * and later come only from central — one source per (grade, season).
 *
 * One row with `grade` NULL is the club default; rows with a grade override it
 * for that grade (AE1: default 2003 with B Grade 2004). No row at all = no
 * boundary: central supplies everything it has and club history adds nothing
 * season-grained. `start_season` is a season start year (2003 = 2003/04).
 */
export const clubHistoryBoundariesTable = pgTable(
  "club_history_boundaries",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    /** App grade string; NULL = the club default. */
    grade: text("grade"),
    startSeason: integer("start_season").notNull(),
    updatedBy: text("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqTenantGrade: unique("club_history_boundaries_tenant_grade_unique")
      .on(t.tenantId, t.grade)
      .nullsNotDistinct(),
    chkStartSeason: check(
      "club_history_boundaries_start_season_check",
      sql`"start_season" BETWEEN 1800 AND 2200`,
    ),
  }),
);

export type ClubHistoryBatch = typeof clubHistoryBatchesTable.$inferSelect;
export type ClubHistoryBatchCoverage = typeof clubHistoryBatchCoverageTable.$inferSelect;
export type ClubHistoryRow = typeof clubHistoryRowsTable.$inferSelect;
export type InsertClubHistoryRow = typeof clubHistoryRowsTable.$inferInsert;
export type ClubHistoryBoundary = typeof clubHistoryBoundariesTable.$inferSelect;

/**
 * The (grade, season) pairs a set of history rows covers — what a batch's
 * coverage rows should be. Career rows contribute (grade, null). Sorted by
 * grade, then season with career first, deduplicated.
 */
export function coverageOf(
  rows: ReadonlyArray<{ grade: string; season: number | null }>,
): Array<{ grade: string; season: number | null }> {
  const seen = new Map<string, { grade: string; season: number | null }>();
  for (const r of rows) seen.set(`${r.grade}\u0000${r.season ?? ""}`, r);
  return [...seen.values()]
    .map(({ grade, season }) => ({ grade, season }))
    .sort((a, b) => a.grade.localeCompare(b.grade) || (a.season ?? -1) - (b.season ?? -1));
}

/**
 * The boundary season for a grade: its override, else the club default, else
 * null (no boundary). Pure, for the overlay (U10) and the preview (U13).
 */
export function boundaryFor(
  boundaries: ReadonlyArray<{ grade: string | null; startSeason: number }>,
  grade: string,
): number | null {
  const override = boundaries.find((b) => b.grade === grade);
  if (override) return override.startSeason;
  return boundaries.find((b) => b.grade === null)?.startSeason ?? null;
}
