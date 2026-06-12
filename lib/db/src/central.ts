import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as centralSchema from "./central-schema";

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
 *      That is enforced two ways below: the exported type omits the write
 *      builders, and a runtime Proxy throws if `insert`/`update`/`delete` are
 *      ever accessed.
 *
 * See CLAUDE.md ("The central PCA database") for the data model and the
 * central-read transition plan.
 */

const { CENTRAL_DATABASE_URL } = process.env;

if (!CENTRAL_DATABASE_URL) {
  throw new Error(
    "CENTRAL_DATABASE_URL must be set — the read-only connection string for the " +
      "central PCA database (Postgres schema `central`). It is separate from " +
      "DATABASE_URL (the tenant app DB).",
  );
}

/**
 * Dedicated pool for the central DB. Kept module-private so callers cannot reach
 * the raw (write-capable) connection — all access goes through `centralDb`.
 */
const centralPool = new Pool({ connectionString: CENTRAL_DATABASE_URL });

type CentralSchema = typeof centralSchema;

/** Drizzle methods that mutate; blocked at both the type and runtime level. */
const BLOCKED_WRITE_METHODS = new Set(["insert", "update", "delete"]);

/**
 * Read-only Drizzle handle for the central DB. The write builders are removed
 * from the type so a stray `centralDb.insert(...)` fails to compile, and the
 * runtime Proxy below throws if reflection or `any` slips one past the compiler.
 */
export type CentralDb = Omit<
  NodePgDatabase<CentralSchema>,
  "insert" | "update" | "delete"
>;

const rawCentralDb = drizzle(centralPool, { schema: centralSchema });

/**
 * The single export callers use to read the central DB. Select-only: every read
 * builder (`select`, `query`, `execute`, …) passes through; the write builders
 * throw. Filter reads by the tenant's `club_id` at the call site.
 */
export const centralDb: CentralDb = new Proxy(rawCentralDb, {
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

export * from "./central-schema";
