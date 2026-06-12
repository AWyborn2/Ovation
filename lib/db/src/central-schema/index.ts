/**
 * Drizzle schema for the central PCA database — Postgres schema `central`.
 *
 * READ-ONLY mirror of the shared association database (see CLAUDE.md, "The
 * central PCA database"). Every table here is defined with `pgSchema("central")`
 * so it never collides with the tenant app's `public` tables. These definitions
 * describe an EXTERNAL database the app only ever reads; nothing in the app
 * pushes or migrates this schema.
 *
 * The table definitions are generated from a live introspection of the central
 * DB (`information_schema.columns WHERE table_schema = 'central'`) so column
 * names/types are ground-truth, not guessed. Re-introspect and regenerate if the
 * central schema changes.
 *
 * Tables: clubs, players, matches, match_batting, match_bowling, match_rosters,
 * fall_of_wickets, fielding, ladder, premiers, club_name_history.
 */
import { pgSchema } from "drizzle-orm/pg-core";

/** The shared Postgres schema every central table lives in. */
export const centralSchema = pgSchema("central");

// Table definitions are added per-table (one file each) once introspected.
// export * from "./clubs";
// export * from "./players";
// export * from "./matches";
// ...
