import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as centralSchema from "./central-schema";
import { envInt, envSsl } from "./env";
import { lazyProxy } from "./lazy";

const { Pool } = pg;

/**
 * Read-only connection to the central PCA database (Postgres schema `central`).
 *
 * INVARIANT — this module is READ-ONLY and stands completely apart from the
 * tenant database in `./index.ts`:
 *
 *   1. It uses its OWN pool on `CENTRAL_DATABASE_URL`. It must NEVER share, wrap,
 *      or import the tenant pool/`db` from `./index.ts`, and `./index.ts` must
 *      never import this module. The two connections stay isolated.
 *   2. The central DB is an external, shared association dataset the app only
 *      ever READS. The app must never insert/update/delete or run DDL against it.
 *      That is enforced three ways: the exported type omits the write builders,
 *      a runtime Proxy throws if `insert`/`update`/`delete`/`transaction`/
 *      `$client` are ever accessed, and the database role behind
 *      `CENTRAL_DATABASE_URL` should be SELECT-only with
 *      `default_transaction_read_only = on` (plan.md §2.6).
 *
 * The pool is created on FIRST USE, not at import: importing this module (or
 * anything that transitively imports it) no longer requires
 * `CENTRAL_DATABASE_URL`, so unit tests and tooling load hermetically and the
 * CI secret is no longer needed just to import the app.
 *
 * See CLAUDE.md ("The central PCA database") for the data model and the
 * central-read transition plan.
 */

type CentralSchema = typeof centralSchema;

/**
 * Read-only Drizzle handle for the central DB. The write builders are removed
 * from the type so a stray `centralDb.insert(...)` fails to compile, and the
 * runtime Proxy below throws if reflection or `any` slips one past the compiler.
 */
export type CentralDb = Omit<
  NodePgDatabase<CentralSchema>,
  "insert" | "update" | "delete" | "transaction" | "refreshMaterializedView" | "$client"
>;

/**
 * Drizzle members that can mutate or hand out the raw connection; blocked at
 * both the type and runtime level. `transaction` is blocked because a callback
 * receives a full (writable) transaction handle; `$client` because it is the
 * raw pg pool. Read-only raw SQL goes through `execute`, which stays open and
 * is additionally protected by the read-only database role.
 */
const BLOCKED_WRITE_METHODS = new Set([
  "insert",
  "update",
  "delete",
  "transaction",
  "refreshMaterializedView",
  "$client",
]);

let centralPoolInstance: pg.Pool | null = null;
let centralDbInstance: CentralDb | null = null;

/**
 * Dedicated pool for the central DB. Kept module-private so callers cannot reach
 * the raw (write-capable) connection — all access goes through `centralDb`.
 *
 * The central DB is a REMOTE Supabase session pooler reached over the internet,
 * so the pool is explicitly bounded and time-limited rather than left on pg's
 * defaults: a small `max` (the session pooler hands out real backend sessions),
 * an idle timeout so quiet servers release remote sessions, a connection
 * timeout so a network outage fails fast instead of hanging requests, and a
 * server-side `statement_timeout` so no single read can stall a worker.
 */
function getCentralPool(): pg.Pool {
  if (centralPoolInstance) return centralPoolInstance;
  const url = process.env.CENTRAL_DATABASE_URL;
  if (!url) {
    throw new Error(
      "CENTRAL_DATABASE_URL must be set — the read-only connection string for the " +
        "central PCA database (Postgres schema `central`). It is separate from " +
        "DATABASE_URL (the tenant app DB).",
    );
  }
  centralPoolInstance = new Pool({
    connectionString: url,
    // Verified TLS to the remote pooler regardless of what the URL says; local
    // CI databases opt out via CENTRAL_DB_SSL=0 (auto for loopback hosts).
    ssl: envSsl("CENTRAL_DB_SSL", url),
    max: envInt("CENTRAL_POOL_MAX", 5),
    idleTimeoutMillis: envInt("CENTRAL_POOL_IDLE_TIMEOUT_MS", 30_000),
    connectionTimeoutMillis: envInt("CENTRAL_POOL_CONNECTION_TIMEOUT_MS", 10_000),
    statement_timeout: envInt("CENTRAL_STATEMENT_TIMEOUT_MS", 30_000),
  });
  // A remote pooler can drop an idle client at any time. Without a listener
  // that surfaces as an unhandled 'error' event on the pool and takes the
  // process down.
  centralPoolInstance.on("error", (err) => {
    console.error("[central-db] idle client error", err);
  });
  return centralPoolInstance;
}

/**
 * The read-only Drizzle handle, created on first use. Select-only: every read
 * builder (`select`, `query`, `execute`, …) passes through; the write builders
 * throw. Filter reads by the tenant's `club_id` at the call site.
 */
export function getCentralDb(): CentralDb {
  if (centralDbInstance) return centralDbInstance;
  const raw = drizzle(getCentralPool(), { schema: centralSchema });
  centralDbInstance = new Proxy(raw, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && BLOCKED_WRITE_METHODS.has(prop)) {
        throw new Error(
          `centralDb.${prop}() is not allowed — the central PCA database is ` +
            "read-only. Use select/query only.",
        );
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as unknown as CentralDb;
  return centralDbInstance;
}

/**
 * Close the central pool (graceful shutdown / test teardown). Safe to call when
 * no connection was ever opened.
 */
export async function closeCentralDb(): Promise<void> {
  const p = centralPoolInstance;
  centralPoolInstance = null;
  centralDbInstance = null;
  if (p) await p.end();
}

/**
 * Backwards-compatible value export: behaves like the eager `centralDb` it
 * replaces but only connects when first touched.
 */
export const centralDb: CentralDb = lazyProxy(getCentralDb);

export * from "./central-schema";
