import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { tenantIdColumn } from "./_tenant";

// Upcoming fixtures (tenant-curated). Feeds the fixture-driven social cards
// (Match Day, Team List, Countdown). `source` records where a row came from:
// "manual" (admin CRUD) or "playhq" (projected from the `playhq.*` landing
// schema by `scripts/src/playhq-project-fixtures.ts`). PlayHQ rows carry the
// PlayHQ match GUID in `playhq_match_id`, which is the upsert key for re-syncs:
// the fixture-facing columns (grade, round, opponent, venue, start, home/away)
// are overwritten by each sync, while `notes` and the team list are the
// admin's and are never touched.
export const fixturesTable = pgTable(
  "fixtures",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    grade: text("grade").notNull(),
    roundLabel: text("round_label"),
    opponentName: text("opponent_name").notNull(),
    // Optional link into the shared clubs register (for logo/colour lookups).
    opponentClubId: integer("opponent_club_id"),
    opponentLogoUrl: text("opponent_logo_url"),
    venue: text("venue"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    isHome: boolean("is_home").notNull().default(true),
    notes: text("notes"),
    source: text("source").notNull().default("manual"), // "manual" | "playhq"
    // PlayHQ match GUID for `source = "playhq"` rows; NULL for manual rows.
    playhqMatchId: text("playhq_match_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTenant: index("fixtures_tenant_idx").on(t.tenantId),
    // One fixture per PlayHQ match per tenant — the re-sync upsert target.
    uqTenantPlayhqMatch: uniqueIndex("fixtures_tenant_playhq_match_uidx")
      .on(t.tenantId, t.playhqMatchId)
      .where(sql`"playhq_match_id" IS NOT NULL`),
  }),
);

export type FixtureRow = typeof fixturesTable.$inferSelect;

// One entry in a fixture's ordered XI. Either a register-linked player
// (`playerId`) or a free-typed name (no playerId — e.g. a new signing not yet
// in the register). Fill-in ids (playerId >= 90000) are NEVER allowed here —
// the route rejects them (fill-in exclusion invariant).
export type TeamListPlayer = {
  order: number;
  playerId?: number;
  displayName: string;
  role?: "C" | "WK" | "C/WK";
};

// The published XI for a fixture — exactly one per fixture (unique on
// tenantId+fixtureId; the PUT route upserts). Deleting a fixture cascades.
export const teamListsTable = pgTable(
  "team_lists",
  {
    id: serial("id").primaryKey(),
    tenantId: tenantIdColumn(),
    fixtureId: integer("fixture_id")
      .notNull()
      .references(() => fixturesTable.id, { onDelete: "cascade" }),
    players: jsonb("players").$type<TeamListPlayer[]>().notNull().default([]),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqFixture: uniqueIndex("team_lists_tenant_fixture_unique").on(t.tenantId, t.fixtureId),
  }),
);

export type TeamListRow = typeof teamListsTable.$inferSelect;
