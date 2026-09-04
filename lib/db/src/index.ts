import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { envInt } from "./env";
import { lazyProxy } from "./lazy";

const { Pool } = pg;

/** What `drizzle(pool, { schema })` returns, including the `$client` pool handle. */
export type Db = NodePgDatabase<typeof schema> & { $client: pg.Pool };

let poolInstance: pg.Pool | null = null;
let dbInstance: Db | null = null;

/**
 * Tenant-DB pool, created on FIRST USE rather than at import.
 *
 * Connecting lazily means importing `@workspace/db` (for its schema, types or
 * helpers) never requires `DATABASE_URL` to be set — unit tests that mock the
 * database, codegen, and tooling can all load this module hermetically. The
 * first real query still fails fast with a clear message when the URL is
 * missing.
 *
 * Explicit bounds/timeouts (env-overridable) rather than pg defaults: bounded
 * size, an idle timeout to release quiet connections, a connection timeout so
 * outages fail fast, and a server-side statement_timeout so a runaway query
 * can't stall a worker indefinitely.
 */
export function getPool(): pg.Pool {
  if (poolInstance) return poolInstance;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
  }
  poolInstance = new Pool({
    connectionString: url,
    max: envInt("POOL_MAX", 10),
    idleTimeoutMillis: envInt("POOL_IDLE_TIMEOUT_MS", 30_000),
    connectionTimeoutMillis: envInt("POOL_CONNECTION_TIMEOUT_MS", 10_000),
    statement_timeout: envInt("STATEMENT_TIMEOUT_MS", 30_000),
  });
  // An idle client can be dropped by the server or a network blip; without a
  // listener that is an unhandled 'error' event on the pool and crashes the
  // process.
  poolInstance.on("error", (err) => {
    console.error("[tenant-db] idle client error", err);
  });
  return poolInstance;
}

/** The Drizzle handle for the tenant database (see {@link getPool}). */
export function getDb(): Db {
  if (dbInstance) return dbInstance;
  dbInstance = drizzle(getPool(), { schema });
  return dbInstance;
}

/**
 * Close the tenant pool (graceful shutdown / test teardown). Safe to call when
 * no connection was ever opened. A later `getDb()` re-creates the pool.
 */
export async function closeDb(): Promise<void> {
  const p = poolInstance;
  poolInstance = null;
  dbInstance = null;
  if (p) await p.end();
}

/**
 * Backwards-compatible value exports. `db` and `pool` behave exactly like the
 * eager objects they replace (every property access and method call is
 * forwarded to the real instance) but only connect when first touched.
 */
export const db: Db = lazyProxy(getDb);
export const pool: pg.Pool = lazyProxy(getPool);

export * from "./schema";
