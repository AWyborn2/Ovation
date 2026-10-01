import pg from "pg";
import { envInt, envSsl } from "../env";

const { Pool } = pg;

/**
 * Write connection for the scheduled PlayHQ ingest — and nothing else.
 *
 * `playhq.*` lives in the central Postgres, but the app's central handle (`../central.ts`)
 * is read-only by design and stays that way. Ingest therefore gets its OWN pool on
 * `PLAYHQ_INGEST_DATABASE_URL`: a database role that may read and write schema `playhq`
 * and has no write privilege on `central` or `wa` (DDL: `scripts/sql/playhq-ingest-role.sql`).
 *
 * The role's scope is checked, not assumed: `assertIngestScope()` refuses a connection that
 * can write `central`/`wa` or is a superuser, so a mis-provisioned secret (say, the
 * Supabase `postgres` URL pasted by mistake) fails closed instead of handing the API a
 * write path into the association dataset.
 *
 * Created on first use, like the central pool, so importing this module needs no env.
 */
let poolInstance: pg.Pool | null = null;
let scopeChecked: Promise<void> | null = null;

export class IngestNotConfiguredError extends Error {
  readonly status = 503;
  constructor(message: string) {
    super(message);
    this.name = "IngestNotConfiguredError";
  }
}

export function playhqIngestConfigured(): boolean {
  return !!process.env.PLAYHQ_INGEST_DATABASE_URL;
}

export function getPlayhqIngestPool(): pg.Pool {
  if (poolInstance) return poolInstance;
  const url = process.env.PLAYHQ_INGEST_DATABASE_URL;
  if (!url)
    throw new IngestNotConfiguredError(
      "PLAYHQ_INGEST_DATABASE_URL is not set — the playhq-scoped write role for scheduled ingest.",
    );
  poolInstance = new Pool({
    connectionString: url,
    ssl: envSsl("PLAYHQ_INGEST_DB_SSL", url),
    // Ingest is one request at a time (the runner is serial); keep remote sessions few.
    max: envInt("PLAYHQ_INGEST_POOL_MAX", 2),
    idleTimeoutMillis: envInt("PLAYHQ_INGEST_POOL_IDLE_TIMEOUT_MS", 30_000),
    connectionTimeoutMillis: envInt("PLAYHQ_INGEST_POOL_CONNECTION_TIMEOUT_MS", 10_000),
    // A season of scorecards is many batched upserts; allow each one time, not the whole load.
    statement_timeout: envInt("PLAYHQ_INGEST_STATEMENT_TIMEOUT_MS", 120_000),
  });
  poolInstance.on("error", (err) => {
    console.error("[playhq-ingest] idle client error", err);
  });
  return poolInstance;
}

type Scope = { superuser: boolean; writable: string[] };

/** What the connected role could write outside `playhq`. Exported for tests. */
export async function inspectIngestScope(pool: pg.Pool): Promise<Scope> {
  const su = await pool.query<{ rolsuper: boolean }>(
    `select rolsuper from pg_roles where rolname = current_user`,
  );
  const writable = await pool.query<{ what: string }>(
    `select n.nspname || ' (create)' as what
       from pg_namespace n
      where n.nspname in ('central', 'wa') and has_schema_privilege(n.oid, 'CREATE')
     union all
     select n.nspname || '.' || c.relname as what
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('central', 'wa') and c.relkind in ('r', 'p')
        and (has_table_privilege(c.oid, 'INSERT') or has_table_privilege(c.oid, 'UPDATE')
             or has_table_privilege(c.oid, 'DELETE') or has_table_privilege(c.oid, 'TRUNCATE'))
     order by 1`,
  );
  return {
    superuser: su.rows[0]?.rolsuper === true,
    writable: writable.rows.map((r) => r.what),
  };
}

/**
 * Throw unless the ingest role is scoped to `playhq`. Checked once per pool; a failure is
 * not cached, so fixing the role takes effect without a restart.
 */
export async function assertIngestScope(pool: pg.Pool = getPlayhqIngestPool()): Promise<void> {
  if (!scopeChecked)
    scopeChecked = (async () => {
      const scope = await inspectIngestScope(pool);
      if (scope.superuser || scope.writable.length)
        throw new IngestNotConfiguredError(
          `PLAYHQ_INGEST_DATABASE_URL's role can write outside playhq (${
            scope.superuser ? "superuser" : scope.writable.slice(0, 5).join(", ")
          }) — refusing to ingest. Use the playhq_ingest role (scripts/sql/playhq-ingest-role.sql).`,
        );
    })().catch((err) => {
      scopeChecked = null;
      throw err;
    });
  return scopeChecked;
}

/** Close the ingest pool (shutdown / test teardown). Safe when never opened. */
export async function closePlayhqIngestPool(): Promise<void> {
  const p = poolInstance;
  poolInstance = null;
  scopeChecked = null;
  if (p) await p.end();
}
