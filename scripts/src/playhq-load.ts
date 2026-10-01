/**
 * playhq-load.ts — load dumps produced by the `playcricket-stats-scraper` skill's in-page
 * harness (`.claude/skills/playcricket-stats-scraper/harness.js`) into the `playhq.*` raw
 * landing schema defined in `scripts/sql/playhq-schema.sql`.
 *
 * Usage (CENTRAL_DATABASE_URL must be set — same Postgres as `central` / `wa`):
 *   pnpm --filter @workspace/scripts run playhq-load -- --init --yes         # create schema
 *   pnpm --filter @workspace/scripts run playhq-load -- --file=<dump.json> --dry-run
 *   pnpm --filter @workspace/scripts run playhq-load -- --file=<dump.json> --yes
 *   pnpm --filter @workspace/scripts run playhq-load -- --dir=<folder> --yes  # every *.json
 *   pnpm --filter @workspace/scripts run playhq-load -- --report=8            # changes, last 8 days
 *   pnpm --filter @workspace/scripts run playhq-load -- --ddl                 # print the schema
 *   pnpm --filter @workspace/scripts run playhq-load -- --file=<dump.json> --yes --project
 *       # …then project each linked tenant's fixtures (needs DATABASE_URL too)
 *
 * This is BUILD/OPS tooling in the mould of normalize-central-active-clubs.ts: it opens its
 * own `pg` pool on CENTRAL_DATABASE_URL and writes ONLY to schema `playhq`. The parsing and
 * upsert logic lives in `@workspace/db/playhq-ingest`, shared with the API's scheduled-ingest
 * endpoint; this file is the CLI around it. The app's `centralDb` handle stays read-only;
 * projecting this data into `central.*` is a separate, reviewed step. A non-local host is
 * refused unless `--yes` is passed. Every write is an idempotent upsert keyed on PlayHQ GUIDs,
 * so re-loading the same dump is a no-op and re-loading a newer dump records what changed
 * (see `playhq.fixture_changes`).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  loadRows,
  rowsFromDump,
  type Dump,
  type LoadRows,
  type Queryable,
  type Row,
} from "@workspace/db/playhq-ingest";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argValue(flag: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && !process.argv[idx + 1]?.startsWith("--") ? process.argv[idx + 1] : undefined;
}
const argValues = (flag: string): string[] =>
  process.argv.filter((a) => a.startsWith(`${flag}=`)).map((a) => a.slice(flag.length + 1));
const has = (flag: string) => process.argv.includes(flag);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = path.join(HERE, "..", "sql", "playhq-schema.sql");

export function sslFor(url: string): { rejectUnauthorized: true } | false {
  const raw = (process.env.CENTRAL_DB_SSL ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "require") return { rejectUnauthorized: true };
  if (raw === "0" || raw === "false" || raw === "disable") return false;
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)
    ? false
    : { rejectUnauthorized: true };
}

export function confirmTarget(url: string): void {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  console.log(`Target database host: ${host || "(unset)"} (schema playhq)`);
  const local =
    ["", "localhost", "127.0.0.1", "::1", "[::1]"].includes(host) || host.endsWith(".localhost");
  if (local || has("--yes")) return;
  throw new Error(
    `CENTRAL_DATABASE_URL points at a non-local host (${host}). Re-run with --yes to confirm you intend to write playhq.* there.`,
  );
}

function dumpFiles(): string[] {
  const files = argValues("--file");
  const dir = argValue("--dir");
  if (dir)
    for (const f of fs.readdirSync(dir).sort())
      if (f.toLowerCase().endsWith(".json")) files.push(path.join(dir, f));
  return files;
}

function summarise(rows: LoadRows): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rows)) out[k] = (v as Row[]).length;
  return out;
}

async function report(c: Queryable, days: number): Promise<void> {
  const changes = await c.query(
    `select fc.changed_at, g.name as grade, m.round_name, m.home_team_name, m.away_team_name,
            fc.field, fc.old_value, fc.new_value
       from playhq.fixture_changes fc
       join playhq.matches m on m.id = fc.match_id
       left join playhq.grades g on g.id = m.grade_id
      where fc.changed_at >= now() - ($1 || ' days')::interval
      order by fc.changed_at desc, g.name, m.round_name`,
    [String(days)],
  );
  console.log(`Fixture changes in the last ${days} days: ${changes.rows.length}`);
  for (const r of changes.rows)
    console.log(
      `  ${String(r.changed_at).slice(0, 16)}  ${r.grade} ${r.round_name}: ${r.home_team_name} v ${r.away_team_name}  ${r.field}: ${r.old_value ?? "∅"} → ${r.new_value ?? "∅"}`,
    );
  const upcoming = await c.query(
    `select g.name as grade, count(*)::int as n, min(m.start_at) as next_start
       from playhq.matches m left join playhq.grades g on g.id = m.grade_id
      where m.start_at >= now() and m.start_at < now() + interval '14 days'
      group by g.name order by g.name`,
  );
  console.log(
    `Upcoming matches in the next 14 days: ${upcoming.rows.reduce((n, r) => n + Number(r.n), 0)}`,
  );
  for (const r of upcoming.rows)
    console.log(`  ${r.grade}: ${r.n} (next ${String(r.next_start).slice(0, 16)})`);
  const results = await c.query(
    `select count(*)::int as n from playhq.matches
      where status = 'COMPLETED' and updated_at >= now() - ($1 || ' days')::interval`,
    [String(days)],
  );
  console.log(`Completed matches touched in the last ${days} days: ${results.rows[0]?.n ?? 0}`);
}

async function main(): Promise<void> {
  if (has("--ddl")) {
    process.stdout.write(fs.readFileSync(SCHEMA_SQL, "utf8"));
    return;
  }
  const files = dumpFiles();
  const dryRun = has("--dry-run");
  const init = has("--init");
  const reportDays = argValue("--report") ?? (has("--report") ? "8" : undefined);
  const project = has("--project");
  if (!init && !files.length && reportDays === undefined && !project)
    throw new Error(
      "Nothing to do: pass --init, --file=<dump.json>, --dir=<folder>, --report[=days], --project or --ddl.",
    );

  const parsed = files.map((f) => {
    const dump = JSON.parse(fs.readFileSync(f, "utf8")) as Dump;
    if (!Array.isArray(dump.records)) throw new Error(`${f}: not a harness dump (no records[])`);
    return { file: f, rows: rowsFromDump(dump, path.basename(f)) };
  });
  for (const p of parsed) console.log(`${p.file}: ${JSON.stringify(summarise(p.rows))}`);
  if (dryRun) {
    console.log("--dry-run: nothing written.");
    return;
  }

  const url = process.env.CENTRAL_DATABASE_URL;
  if (!url)
    throw new Error(
      "CENTRAL_DATABASE_URL must be set (the Postgres that holds central/wa/playhq).",
    );
  confirmTarget(url);
  const pool = new pg.Pool({ connectionString: url, ssl: sslFor(url), max: 2 });
  try {
    if (init) {
      await pool.query(fs.readFileSync(SCHEMA_SQL, "utf8"));
      console.log("playhq schema applied (idempotent).");
    }
    for (const p of parsed) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const { counts } = await loadRows(
          client as unknown as Queryable,
          p.rows,
          path.basename(p.file),
          { collector: "cli" },
        );
        await client.query("commit");
        console.log(`${p.file}: loaded ${JSON.stringify(counts)}`);
      } catch (e) {
        await client.query("rollback");
        throw e;
      } finally {
        client.release();
      }
    }
    if (reportDays !== undefined)
      await report(pool as unknown as Queryable, Number(reportDays) || 8);
  } finally {
    await pool.end();
  }
  if (project) {
    // Push the freshly loaded matches into each linked tenant's fixtures
    // (Social Studio). Needs DATABASE_URL as well; --yes covers both hosts.
    const { confirmDatabaseTarget } = await import("./lib/cli");
    confirmDatabaseTarget();
    const { projectFixtures } = await import("@workspace/db/playhq-ingest");
    await projectFixtures({ dryRun: false });
  }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly)
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
