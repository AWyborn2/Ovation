/**
 * load-matches.ts — bulk-load the master DB's complete PlayHQ-era match
 * history into the app's match tables and reconcile match-era seasons
 * against the career baseline.
 *
 *   pnpm --filter @workspace/scripts run load-matches            # preview only
 *   pnpm --filter @workspace/scripts run load-matches -- --commit
 *   pnpm --filter @workspace/scripts run load-matches -- --file=<path>
 *
 * Pipeline:
 *   1. Pick the newest attached_assets/halls_head_cricket_postgres_*.sql
 *      (overridable with --file=).
 *   2. Preprocess the dump and (re)build an isolated `staging` schema.
 *   3. PREVIEW: print what would be loaded (match / line counts). (default)
 *   4. --commit: run scripts/sql/matches-etl.sql inside a single transaction —
 *      it reverses any prior bulk reconciliation, reloads matches + lines,
 *      derives season snapshots, peels them out of the career baseline, and
 *      recomputes derived aggregates — then verify the career invariant.
 *
 * Re-runnable: every run resets and reloads the bulk match data.
 * The ETL is pure SQL; this file only orchestrates psql and reports.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const assetsDir = join(repoRoot, "attached_assets");
const etlSql = join(__dirname, "..", "sql", "matches-etl.sql");
const stagingOut = "/tmp/hhcc-matches-staging.sql";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const fileArg = args.find((a) => a.startsWith("--file="))?.slice("--file=".length);

/** App tables the ETL writes / recomputes — used for the before/after diff. */
const TRACKED_TABLES = [
  "imports",
  "matches",
  "match_player_lines",
  "match_opposition_lines",
  "player_grade_season_stats",
  "player_grade_stats",
  "grade_summaries",
  "baseline_adjustments",
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
      out[t] = null;
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
  // Load the dump in ONE transaction; per-statement autocommit makes large dumps
  // crawl past the bash/exec timeout.
  psqlFile(stagingOut, true);
}

/**
 * Create the app_grade / season_start helpers in `staging` so the preview
 * scope query can run before the ETL. The ETL re-creates them (CREATE OR
 * REPLACE), so this is just to make preview self-sufficient.
 */
function defineHelpers(): void {
  psql(`
    CREATE OR REPLACE FUNCTION staging.app_grade(g text) RETURNS text AS $fn$
      SELECT CASE upper(btrim(coalesce(g, '')))
        WHEN 'A' THEN 'A Grade' WHEN 'A GRADE' THEN 'A Grade' WHEN 'MENS A GRADE' THEN 'A Grade'
        WHEN 'B' THEN 'B Grade' WHEN 'B GRADE' THEN 'B Grade'
        WHEN 'C' THEN 'C Grade' WHEN 'C GRADE' THEN 'C Grade'
        WHEN 'D' THEN 'D Grade' WHEN 'D GRADE' THEN 'D Grade'
        WHEN 'E' THEN 'E Grade' WHEN 'E GRADE' THEN 'E Grade'
        WHEN 'F' THEN 'F Grade' WHEN 'F GRADE' THEN 'F Grade'
        WHEN 'FEMALE A' THEN 'Female A Grade' WHEN 'FEMALE A GRADE' THEN 'Female A Grade'
        WHEN 'FEMALE B' THEN 'Female B Grade' WHEN 'FEMALE B GRADE' THEN 'Female B Grade'
        WHEN 'PPL' THEN 'PPL' WHEN 'PEEL PREMIER LEAGUE' THEN 'PPL'
        WHEN 'U21 COLTS' THEN 'Colts' WHEN 'COLTS' THEN 'Colts'
        ELSE CASE WHEN g ~* '^mid-year t20 '
          THEN staging.app_grade(regexp_replace(g, '^[Mm]id-[Yy]ear [Tt]20 ', ''))
          ELSE NULLIF(btrim(g), '') END
      END;
    $fn$ LANGUAGE sql IMMUTABLE;
    CREATE OR REPLACE FUNCTION staging.season_start(s text) RETURNS int AS $fn$
      SELECT NULLIF(substring(btrim(coalesce(s, '')) from '^[0-9]{4}'), '')::int;
    $fn$ LANGUAGE sql IMMUTABLE;`);
}

function main(): void {
  const dumpPath = pickDump();
  console.log(`\n=== load-matches (${commit ? "COMMIT" : "PREVIEW"}) ===`);
  console.log(`dump: ${dumpPath}`);

  const before = counts("public", TRACKED_TABLES);

  console.log("\nbuilding staging schema...");
  buildStaging(dumpPath);
  defineHelpers();

  const staging = counts("staging", ["matches", "match_batting", "match_bowling"]);
  console.log("\nstaging row counts:");
  for (const [t, n] of Object.entries(staging)) console.log(`  ${t.padEnd(22)} ${n ?? "-"}`);

  // What the load would write (grades/seasons/matches in scope).
  const scope = psql(`
    SET search_path TO staging, public;
    SELECT
      count(*) FILTER (WHERE staging.app_grade(parent_grade) IS NOT NULL
                        AND staging.season_start(season) IS NOT NULL
                        AND source_key IS NOT NULL) AS in_scope,
      count(*) AS total
    FROM staging.matches;`).split("|");
  console.log(`\nmatches in scope: ${scope[0]} of ${scope[1]} master rows`);

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
    console.log(
      `  ${t.padEnd(28)} ${String(before[t] ?? "-").padStart(6)} -> ${String(after[t] ?? "-").padStart(6)}`,
    );
  }

  console.log("\n--- verification ---");
  // Career invariant: per-grade aggregate games must equal master career_stats
  // rolled by parent grade (baseline + peeled match-era seasons = career).
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

  const negative = psql(`
    SELECT count(*) FROM public.player_grade_season_stats
    WHERE COALESCE(games,0) < 0 OR COALESCE(runs,0) < 0 OR COALESCE(wickets,0) < 0`);
  console.log(`  negative baseline rows after peel: ${negative} (expect 0)`);

  const dated = psql(`SELECT count(*) FROM public.matches WHERE source_key IS NOT NULL AND match_date IS NOT NULL`);
  console.log(`  bulk matches with a match_date (drive milestones): ${dated}`);

  console.log("\nDone.");
}

main();
