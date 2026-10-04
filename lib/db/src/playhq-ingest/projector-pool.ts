import pg from "pg";
import { envInt, envSsl } from "../env";

const { Pool } = pg;

/**
 * Write connection for the PlayHQ → central projector — and nothing else.
 *
 * Central is read-only from the app (`../central.ts` blocks every write). The projector is the
 * one sanctioned writer: it copies finished PlayHQ matches into the central stats tables
 * (plan: docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md, D1). It gets its OWN
 * pool on `CENTRAL_PROJECTOR_DATABASE_URL`, a role that may write exactly the tables in
 * `PROJECTOR_WRITABLE` (DDL: `scripts/sql/central-projector.sql`).
 *
 * As with the ingest role, the scope is checked, not assumed: `assertProjectorScope()` refuses a
 * superuser or a role that can write any other table in `central`, `wa`, `playhq` or `public`, so a
 * mis-pasted secret fails closed instead of opening a wide write path.
 *
 * Created on first use, so importing this module needs no env.
 */
let poolInstance: pg.Pool | null = null;
let scopeChecked: Promise<void> | null = null;

/** The only tables the projector role may write. */
export const PROJECTOR_WRITABLE: readonly string[] = [
  "central.matches",
  "central.match_batting",
  "central.match_bowling",
  "central.match_rosters",
  "central.fall_of_wickets",
  "central.fielding",
  "central.players",
];

export class ProjectorNotConfiguredError extends Error {
  readonly status = 503;
  constructor(message: string) {
    super(message);
    this.name = "ProjectorNotConfiguredError";
  }
}

export function centralProjectorConfigured(): boolean {
  return !!process.env.CENTRAL_PROJECTOR_DATABASE_URL;
}

export function getCentralProjectorPool(): pg.Pool {
  if (poolInstance) return poolInstance;
  const url = process.env.CENTRAL_PROJECTOR_DATABASE_URL;
  if (!url)
    throw new ProjectorNotConfiguredError(
      "CENTRAL_PROJECTOR_DATABASE_URL is not set — the central_projector write role.",
    );
  poolInstance = new Pool({
    connectionString: url,
    ssl: envSsl("CENTRAL_PROJECTOR_DB_SSL", url),
    max: envInt("CENTRAL_PROJECTOR_POOL_MAX", 2),
    idleTimeoutMillis: envInt("CENTRAL_PROJECTOR_POOL_IDLE_TIMEOUT_MS", 30_000),
    connectionTimeoutMillis: envInt("CENTRAL_PROJECTOR_POOL_CONNECTION_TIMEOUT_MS", 10_000),
    statement_timeout: envInt("CENTRAL_PROJECTOR_STATEMENT_TIMEOUT_MS", 60_000),
  });
  poolInstance.on("error", (err) => {
    console.error("[central-projector] idle client error", err);
  });
  return poolInstance;
}

type Scope = { superuser: boolean; writable: string[] };

type Queryable = Pick<pg.Pool, "query">;

/** What the connected role could write beyond `PROJECTOR_WRITABLE`. Exported for tests. */
export async function inspectProjectorScope(pool: Queryable): Promise<Scope> {
  const su = await pool.query<{ rolsuper: boolean }>(
    `select rolsuper from pg_roles where rolname = current_user`,
  );
  const writable = await pool.query<{ what: string }>(
    `select n.nspname || ' (create)' as what
       from pg_namespace n
      where n.nspname in ('central', 'wa', 'playhq', 'public') and has_schema_privilege(n.oid, 'CREATE')
     union all
     select n.nspname || '.' || c.relname as what
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname in ('central', 'wa', 'playhq', 'public') and c.relkind in ('r', 'p')
        and (has_table_privilege(c.oid, 'INSERT') or has_table_privilege(c.oid, 'UPDATE')
             or has_table_privilege(c.oid, 'DELETE') or has_table_privilege(c.oid, 'TRUNCATE'))
        and n.nspname || '.' || c.relname <> all($1::text[])
     order by 1`,
    [PROJECTOR_WRITABLE],
  );
  return {
    superuser: su.rows[0]?.rolsuper === true,
    writable: writable.rows.map((r) => r.what),
  };
}

/**
 * Throw unless the projector role is scoped to `PROJECTOR_WRITABLE`. Checked once per pool; a
 * failure is not cached, so fixing the role takes effect without a restart.
 */
export async function assertProjectorScope(
  pool: Queryable = getCentralProjectorPool(),
): Promise<void> {
  if (!scopeChecked)
    scopeChecked = (async () => {
      const scope = await inspectProjectorScope(pool);
      if (scope.superuser || scope.writable.length)
        throw new ProjectorNotConfiguredError(
          `CENTRAL_PROJECTOR_DATABASE_URL's role can write more than the projector tables (${
            scope.superuser ? "superuser" : scope.writable.slice(0, 5).join(", ")
          }) — refusing to project. Use the central_projector role (scripts/sql/central-projector.sql).`,
        );
    })().catch((err) => {
      scopeChecked = null;
      throw err;
    });
  return scopeChecked;
}

/** Close the projector pool (shutdown / test teardown). Safe when never opened. */
export async function closeCentralProjectorPool(): Promise<void> {
  const p = poolInstance;
  poolInstance = null;
  scopeChecked = null;
  if (p) await p.end();
}
