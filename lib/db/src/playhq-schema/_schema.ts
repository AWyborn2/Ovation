import { pgSchema } from "drizzle-orm/pg-core";

/**
 * The Postgres schema the PlayHQ landing tables live in. Same database and
 * same read-only role as `central.*`; written only by
 * `scripts/src/playhq-load.ts` (DDL in `scripts/sql/playhq-schema.sql`).
 */
export const playhqSchema = pgSchema("playhq");
