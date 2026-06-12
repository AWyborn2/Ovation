/**
 * Drizzle schema for the central PCA database — Postgres schema `central`.
 *
 * READ-ONLY mirror of the shared association database (see CLAUDE.md, "The
 * central PCA database"). Every table is defined with `pgSchema("central")` so
 * it never collides with the tenant app's `public` tables. These definitions
 * describe an EXTERNAL database the app only ever reads; nothing here pushes or
 * migrates this schema.
 *
 * Generated to match the central DB DDL exactly (the source `pca_full_postgres.sql`
 * the live schema was loaded from): all columns nullable except the primary keys,
 * no FK constraints or defaults, `is_private` is INTEGER 0/1, and season/date/round
 * fields are free TEXT. Regenerate if the central schema changes.
 *
 * Tables: clubs, players, matches, match_batting, match_bowling, match_rosters,
 * fall_of_wickets, fielding, ladder, premiers, club_name_history. The career/
 * lineage `v_*` views are queried directly, not modelled here.
 */
export * from "./_schema";
export * from "./clubs";
export * from "./players";
export * from "./matches";
export * from "./match_batting";
export * from "./match_bowling";
export * from "./match_rosters";
export * from "./fall_of_wickets";
export * from "./fielding";
export * from "./ladder";
export * from "./premiers";
export * from "./club_name_history";
