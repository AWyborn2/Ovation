/**
 * load-juniors-db.ts — load the club's self-contained JUNIORS PostgreSQL export
 * into the app's isolated junior_* tables. Junior data is kept COMPLETELY
 * SEPARATE from the senior data by club decision; nothing here touches the
 * senior tables.
 *
 *   pnpm --filter @workspace/scripts run load-juniors-db            # preview only
 *   pnpm --filter @workspace/scripts run load-juniors-db -- --commit
 *   pnpm --filter @workspace/scripts run load-juniors-db -- --file=<path>
 *
 * Pipeline:
 *   1. Pick the newest attached_assets/halls_head_juniors_postgres_*.sql
 *      (overridable with --file=).
 *   2. Preprocess the dump and (re)build an isolated `juniors_staging` schema
 *      (distinct from the master loader's `staging` schema).
 *   3. PREVIEW: print staging row counts + current public counts. (default)
 *   4. --commit: run the SQL ETL (scripts/sql/juniors-etl.sql) inside a single
 *      transaction — it fully replaces the junior_* tables and re-applies any
 *      admin-set junior↔senior cross-reference links.
 *
 * The ETL is pure SQL; this file only orchestrates psql and reports.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const assetsDir = join(repoRoot, "attached_assets");
const etlSql = join(__dirname, "..", "sql", "juniors-etl.sql");
const stagingOut = "/tmp/hhcc-juniors-staging.sql";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const fileArg = args
  .find((a) => a.startsWith("--file="))
  ?.slice("--file=".length);

/** Public junior_* tables the ETL replaces — used for the preview diff. */
const TRACKED_TABLES = [
  "junior_matches",
  "junior_match_batting",
  "junior_match_bowling",
  "junior_match_rosters",
  "junior_participants",
  "junior_premierships",
  "junior_premiership_players",
];

/** Staging table names as they appear in the dump. */
const STAGING_TABLES = [
  "matches",
  "match_batting",
  "match_bowling",
  "match_rosters",
  "junior_participants",
  "junior_premierships",
  "junior_premiership_players",
];

function psql(sql: string): string {
  return execFileSync(
    "psql",
    [DATABASE_URL!, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ).trim();
}

function psqlFile(path: string, singleTxn = false): void {
  const a = [DATABASE_URL!, "-X", "-q", "-v", "ON_ERROR_STOP=1"];
  if (singleTxn) a.push("--single-transaction");
  a.push("-f", path);
  execFileSync("psql", a, { stdio: "inherit", maxBuffer: 64 * 1024 * 1024 });
}

function counts(
  schema: string,
  tables: string[],
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const t of tables) {
    try {
      out[t] = Number(psql(`SELECT count(*) FROM ${schema}.${t}`));
    } catch {
      out[t] = null; // table absent in this schema
    }
  }
  return out;
}

function pickDump(): string {
  if (fileArg) return fileArg;
  const matches = readdirSync(assetsDir)
    .filter((f) => /^halls_head_juniors_postgres_.*\.sql$/.test(f))
    .sort();
  if (matches.length === 0) {
    console.error(
      `No halls_head_juniors_postgres_*.sql found in ${assetsDir}`,
    );
    process.exit(1);
  }
  return join(assetsDir, matches[matches.length - 1]);
}

/** Preprocess the raw dump so it loads into an isolated `juniors_staging` schema. */
function buildStaging(dumpPath: string): void {
  let sql = readFileSync(dumpPath, "utf8");
  // Strip inline FK clauses so staging load order / missing-parent never fails.
  sql = sql.replace(
    /\s+REFERENCES\s+"?\w+"?\s*\([^)]*\)(\s+ON\s+DELETE\s+(?:CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION|SET\s+DEFAULT))?/gi,
    "",
  );
  const header =
    "DROP SCHEMA IF EXISTS juniors_staging CASCADE;\nCREATE SCHEMA juniors_staging;\nSET search_path TO juniors_staging;\n";
  writeFileSync(stagingOut, header + sql, "utf8");
  // Load the dump in ONE transaction; per-statement autocommit makes large dumps
  // crawl past the bash/exec timeout.
  psqlFile(stagingOut, true);
}

function main(): void {
  const dumpPath = pickDump();
  console.log(`\n=== load-juniors-db (${commit ? "COMMIT" : "PREVIEW"}) ===`);
  console.log(`dump: ${dumpPath}`);

  const before = counts("public", TRACKED_TABLES);

  console.log("\nbuilding juniors_staging schema...");
  buildStaging(dumpPath);
  const staging = counts("juniors_staging", STAGING_TABLES);
  console.log("\nstaging row counts:");
  for (const [t, n] of Object.entries(staging))
    console.log(`  ${t.padEnd(28)} ${n ?? "-"}`);

  if (!commit) {
    console.log("\n--- PREVIEW: current public row counts (no changes made) ---");
    for (const t of TRACKED_TABLES)
      console.log(`  ${t.padEnd(28)} ${before[t] ?? "-"}`);
    console.log("\nRe-run with --commit to apply the load.");
    return;
  }

  console.log("\nrunning ETL (single transaction)...");
  psqlFile(etlSql, true);

  const after = counts("public", TRACKED_TABLES);
  console.log("\n--- table row counts: before -> after ---");
  for (const t of TRACKED_TABLES) {
    console.log(
      `  ${t.padEnd(28)} ${String(before[t] ?? "-").padStart(6)} -> ${String(
        after[t] ?? "-",
      ).padStart(6)}`,
    );
  }

  const privateCount = psql(
    `SELECT count(*) FROM public.junior_participants WHERE is_private`,
  );
  const linkCount = psql(
    `SELECT count(*) FROM public.junior_participants WHERE senior_player_id IS NOT NULL`,
  );
  console.log("\n--- verification ---");
  console.log(`  private participants (hidden by API): ${privateCount}`);
  console.log(`  preserved junior->senior links:       ${linkCount}`);

  console.log("\nDone.");
}

main();
