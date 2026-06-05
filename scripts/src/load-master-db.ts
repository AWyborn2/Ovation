/**
 * load-master-db.ts — load the club's master PostgreSQL export as the
 * authoritative data source.
 *
 *   pnpm --filter @workspace/scripts run load-master-db            # preview only
 *   pnpm --filter @workspace/scripts run load-master-db -- --commit
 *   pnpm --filter @workspace/scripts run load-master-db -- --file=<path>
 *
 * Pipeline:
 *   1. Pick the newest attached_assets/halls_head_cricket_postgres_*.sql
 *      (overridable with --file=).
 *   2. Preprocess the dump and (re)build an isolated `staging` schema.
 *   3. PREVIEW: print a per-table before/after row-count diff. (default)
 *   4. --commit: run the SQL ETL (scripts/sql/master-etl.sql) inside a single
 *      transaction — it backs up replaced tables into schema
 *      master_load_backup, replaces the master-owned data, recomputes every
 *      derived total, and resets id sequences — then verify against the master.
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
const etlSql = join(__dirname, "..", "sql", "master-etl.sql");
const stagingOut = "/tmp/hhcc-master-staging.sql";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const fileArg = args.find((a) => a.startsWith("--file="))?.slice("--file=".length);

/** Tables the ETL replaces — used for the preview diff. */
const TRACKED_TABLES = [
  "players",
  "player_grade_season_stats",
  "player_grade_stats",
  "grade_summaries",
  "cap_register",
  "premierships",
  "premiership_players",
  "club_roles",
  "award_winners",
  "life_members",
  "team_of_decade_boards",
  "team_of_decade_members",
  "clubs",
  "partnership_records",
  "partnerships_50plus",
  "centuries",
  "five_wicket_hauls",
  "club_records",
  "honour_board_records",
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

function counts(schema: string, tables: string[]): Record<string, number | null> {
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
    .filter((f) => /^halls_head_cricket_postgres_.*\.sql$/.test(f))
    .sort();
  if (matches.length === 0) {
    console.error(`No halls_head_cricket_postgres_*.sql found in ${assetsDir}`);
    process.exit(1);
  }
  return join(assetsDir, matches[matches.length - 1]);
}

/** Preprocess the raw dump so it loads into an isolated `staging` schema. */
function buildStaging(dumpPath: string): void {
  let sql = readFileSync(dumpPath, "utf8");
  // Strip inline FK clauses so staging load order / missing-parent never fails.
  sql = sql.replace(
    /\s+REFERENCES\s+"?\w+"?\s*\([^)]*\)(\s+ON\s+DELETE\s+(?:CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION|SET\s+DEFAULT))?/gi,
    "",
  );
  // The dump's players DDL predates the is_cap_only column but its INSERTs
  // supply it — add the column so the row shape matches.
  sql = sql.replace(
    /is_fill_in BOOLEAN DEFAULT FALSE/,
    "is_fill_in BOOLEAN DEFAULT FALSE,\n  is_cap_only BOOLEAN DEFAULT FALSE",
  );
  const header =
    "DROP SCHEMA IF EXISTS staging CASCADE;\nCREATE SCHEMA staging;\nSET search_path TO staging;\n";
  writeFileSync(stagingOut, header + sql, "utf8");
  psqlFile(stagingOut);
}

function main(): void {
  const dumpPath = pickDump();
  console.log(`\n=== load-master-db (${commit ? "COMMIT" : "PREVIEW"}) ===`);
  console.log(`dump: ${dumpPath}`);

  const before = counts("public", TRACKED_TABLES);

  console.log("\nbuilding staging schema...");
  buildStaging(dumpPath);
  const staging = counts("staging", [
    "players",
    "career_stats",
    "caps",
    "premierships",
    "premiership_players",
    "awards",
    "honour_board",
    "grade_honours",
    "life_members",
    "team_of_decade",
    "clubs",
    "partnership_records",
    "partnerships_50plus",
    "centuries",
    "five_wicket_hauls",
    "club_records",
    "honour_board_records",
  ]);
  console.log("\nstaging row counts:");
  for (const [t, n] of Object.entries(staging)) console.log(`  ${t.padEnd(22)} ${n ?? "-"}`);

  if (!commit) {
    console.log("\n--- PREVIEW: current public row counts (no changes made) ---");
    for (const t of TRACKED_TABLES) console.log(`  ${t.padEnd(28)} ${before[t] ?? "-"}`);
    console.log("\nRe-run with --commit to apply the load.");
    return;
  }

  console.log("\nrunning ETL (single transaction)...");
  psqlFile(etlSql, true);

  const after = counts("public", TRACKED_TABLES);
  console.log("\n--- table row counts: before -> after ---");
  for (const t of TRACKED_TABLES) {
    console.log(`  ${t.padEnd(28)} ${String(before[t] ?? "-").padStart(6)} -> ${String(after[t] ?? "-").padStart(6)}`);
  }

  console.log("\n--- verification ---");
  // Career games per (player, app-grade): app player_grade_stats vs master career_stats rolled by parent grade.
  const mismatch = psql(`
    WITH master AS (
      SELECT cs.player_id, staging.app_grade(cs.parent_grade) AS grade, SUM(cs.games) games
      FROM staging.career_stats cs
      WHERE staging.app_grade(cs.parent_grade) IS NOT NULL
      GROUP BY cs.player_id, staging.app_grade(cs.parent_grade)
    ),
    app AS (
      SELECT player_id, grade, COALESCE(games, 0) games FROM public.player_grade_stats
    )
    SELECT count(*) FROM master m
    FULL JOIN app a ON a.player_id = m.player_id AND a.grade = m.grade
    WHERE COALESCE(m.games, 0) <> COALESCE(a.games, 0)`);
  console.log(`  per-grade game-count mismatches vs master: ${mismatch} (expect 0)`);

  const careerCheck = psql(`
    SELECT count(*) FROM public.players p
    JOIN (SELECT player_id, NULLIF(SUM(games),0) g FROM public.player_grade_stats GROUP BY player_id) s
      ON s.player_id = p.id
    WHERE COALESCE(p.total_games,0) <> COALESCE(s.g,0)`);
  console.log(`  players whose total_games != sum(per-grade games): ${careerCheck} (expect 0)`);

  console.log("\nDone. Backup of replaced tables retained in schema master_load_backup.");
}

main();
