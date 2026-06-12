import { pgSchema } from "drizzle-orm/pg-core";

/**
 * The shared Postgres schema every central PCA table lives in. Kept in its own
 * module so the per-table files and the barrel can both import it without a
 * circular-load ordering hazard.
 */
export const centralSchema = pgSchema("central");
