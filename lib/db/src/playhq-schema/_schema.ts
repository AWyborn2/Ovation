import { pgSchema } from "drizzle-orm/pg-core";

/**
 * The Postgres schema the PlayHQ landing tables live in. Same database and
 * same read-only role as `central.*` for reads; written only through
 * `@workspace/db/playhq-ingest` — by `scripts/src/playhq-load.ts` and by the
 * scheduled-ingest endpoint on its own playhq-scoped role (DDL in
 * `scripts/sql/playhq-schema.sql`).
 */
export const playhqSchema = pgSchema("playhq");
