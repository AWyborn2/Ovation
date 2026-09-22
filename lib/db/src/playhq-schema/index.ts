/**
 * Drizzle schema for the PlayHQ landing zone — Postgres schema `playhq`, in the
 * same database as `central.*` and read through the same read-only handle.
 *
 * Source of truth for the DDL is `scripts/sql/playhq-schema.sql`, applied and
 * populated by `scripts/src/playhq-load.ts` from dumps the
 * `playcricket-stats-scraper` skill produces. The app never writes here. Only
 * the tables the app reads are modelled (organisations, grades, matches,
 * ladders); scorecards, balls and player stats stay in the landing schema
 * until a feature needs them.
 *
 * Every column is nullable except the keys, mirroring the DDL.
 */
export * from "./_schema";
export * from "./organisations";
export * from "./grades";
export * from "./matches";
export * from "./ladders";
