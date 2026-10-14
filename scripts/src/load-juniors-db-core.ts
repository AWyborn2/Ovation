/**
 * load-juniors-db-core.ts — pure pieces of the one-off juniors loader
 * (load-juniors-db.ts), kept apart so they are tested without a database.
 *
 * The loader serves exactly one club: tenant 1 (Halls Head), seasons before 2026/27,
 * ids below the junior sync id band (junior PlayHQ sync plan KTD6, R12, AE2). Its
 * before/after report counts that club's rows only; another club's juniors, or rows
 * the sync made, never show up as the loader's changes.
 */

import { JUNIOR_SYNC_FIRST_SEASON, JUNIOR_SYNC_ID_START } from "@workspace/db/schema";

/** The only tenant the juniors loader writes. */
export const LOADER_TENANT_ID = 1;

/** First season (start year) the junior PlayHQ sync owns; the loader stays below it. */
export const LOADER_SEASON_LIMIT = JUNIOR_SYNC_FIRST_SEASON;

/** First id of the junior sync id band (`junior_sync_id_seq`); the loader stays below it. */
export const SYNC_ID_START = JUNIOR_SYNC_ID_START;

/** Public junior tables the loader writes, reported before and after a run. */
export const TRACKED_TABLES = [
  "junior_matches",
  "junior_match_batting",
  "junior_match_bowling",
  "junior_match_rosters",
  "junior_participants",
  "junior_premierships",
  "junior_premiership_players",
] as const;

export type TrackedTable = (typeof TRACKED_TABLES)[number];

/** Tables with their own tenant column; the rest reach the tenant through a parent. */
const TENANT_COLUMN_TABLES: ReadonlySet<TrackedTable> = new Set([
  "junior_matches",
  "junior_participants",
  "junior_premierships",
]);

const LINE_TABLES: ReadonlySet<TrackedTable> = new Set([
  "junior_match_batting",
  "junior_match_bowling",
  "junior_match_rosters",
]);

/**
 * SQL counting the loader tenant's rows in one tracked table. Line tables count rows
 * on the tenant's matches; premiership players rows on the tenant's premierships.
 */
export function tenantCountSql(table: TrackedTable): string {
  const t = LOADER_TENANT_ID;
  if (TENANT_COLUMN_TABLES.has(table)) {
    return `SELECT count(*) FROM public.${table} WHERE tenant_id = ${t}`;
  }
  if (LINE_TABLES.has(table)) {
    return (
      `SELECT count(*) FROM public.${table} ` +
      `WHERE match_id IN (SELECT id FROM public.junior_matches WHERE tenant_id = ${t})`
    );
  }
  return (
    `SELECT count(*) FROM public.${table} ` +
    `WHERE premiership_id IN (SELECT id FROM public.junior_premierships WHERE tenant_id = ${t})`
  );
}

/**
 * SQL counting the loader tenant's rows the loader must never touch: synced rows
 * (id in the sync band) and rows of seasons the sync owns. Reported so a run's
 * "before -> after" can show they are unchanged.
 */
export function protectedRowsSql(): string {
  const t = LOADER_TENANT_ID;
  return (
    `SELECT count(*) FROM public.junior_matches WHERE tenant_id = ${t} AND (id >= ${SYNC_ID_START} ` +
    `OR coalesce(season_start_year, NULLIF(substring(season from '^[0-9]{4}'), '')::int) >= ${LOADER_SEASON_LIMIT})`
  );
}
