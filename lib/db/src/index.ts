import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { envInt } from "./env";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/**
 * Tenant-DB pool with explicit bounds/timeouts (env-overridable) rather than pg
 * defaults: bounded size, an idle timeout to release quiet connections, a
 * connection timeout so outages fail fast, and a server-side statement_timeout
 * so a runaway query can't stall a worker indefinitely.
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: envInt("POOL_MAX", 10),
  idleTimeoutMillis: envInt("POOL_IDLE_TIMEOUT_MS", 30_000),
  connectionTimeoutMillis: envInt("POOL_CONNECTION_TIMEOUT_MS", 10_000),
  statement_timeout: envInt("STATEMENT_TIMEOUT_MS", 30_000),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
