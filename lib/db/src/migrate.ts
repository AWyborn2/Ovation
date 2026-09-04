/**
 * Apply the tenant-database migrations in `lib/db/migrations` (plan.md §5.4).
 *
 *   pnpm --filter @workspace/db run migrate
 *
 * Replaces `drizzle-kit push` + `scripts/src/ensure-constraints.ts` in CI and in
 * the Replit post-merge hook. Migrations are generated from the Drizzle schema
 * with `run generate` and reviewed like any other code; `push` stays available
 * for local experiments only.
 *
 * Databases that predate the migrations directory were built with `push` and
 * already carry every table in migration 0000. Running 0000 against them would
 * fail on the first CREATE TABLE, so on first contact this runner BASELINES
 * such a database: when the migrations ledger is empty but `public.tenants`
 * exists, it records 0000 as applied without executing it, and then applies
 * everything after it. `0001_reconcile_pushed_databases.sql` is that follow-up:
 * an idempotent pass that adds the constraints and indexes `push` never owned.
 * A fresh database (CI, a new environment) runs 0000 for real and 0001 is a
 * no-op. Pass `--no-baseline` to disable the detection.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, db } from "./index";

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../migrations", import.meta.url));
// drizzle-orm's defaults; kept explicit so the baseline insert and migrate()
// can never disagree about where the ledger lives.
const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

type JournalEntry = { idx: number; when: number; tag: string };

function readJournal(): JournalEntry[] {
  const raw = fs.readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8");
  return (JSON.parse(raw) as { entries: JournalEntry[] }).entries;
}

async function regclassExists(qualified: string): Promise<boolean> {
  const res = await db.execute<{ r: string | null }>(sql`select to_regclass(${qualified}) as r`);
  return res.rows[0]?.r != null;
}

/**
 * Record migration 0000 as applied on a database that was built with `push`,
 * so `migrate()` starts from 0001. Returns true when a baseline was written.
 */
async function baselineIfPushed(): Promise<boolean> {
  const ledger = `${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`;
  if (await regclassExists(ledger)) {
    const res = await db.execute<{ n: string }>(
      sql`select count(*)::text as n from ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)}`,
    );
    if (Number(res.rows[0]?.n ?? "0") > 0) return false;
  }
  // No ledger (or an empty one). A schema that already has the tenants table
  // was pushed; an empty database gets the real 0000.
  if (!(await regclassExists("public.tenants"))) return false;

  const first = readJournal()[0];
  if (!first) throw new Error("migrations journal is empty");
  const file = fs.readFileSync(path.join(MIGRATIONS_FOLDER, `${first.tag}.sql`));
  const hash = createHash("sha256").update(file).digest("hex");

  await db.execute(sql`create schema if not exists ${sql.identifier(MIGRATIONS_SCHEMA)}`);
  await db.execute(
    sql`create table if not exists ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} (
      id serial primary key,
      hash text not null,
      created_at bigint
    )`,
  );
  await db.execute(
    sql`insert into ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} ("hash", "created_at")
        values (${hash}, ${first.when})`,
  );
  console.log(`migrate: baselined pushed database at ${first.tag} (not executed)`);
  return true;
}

async function appliedCount(): Promise<number> {
  if (!(await regclassExists(`${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`))) return 0;
  const res = await db.execute<{ n: string }>(
    sql`select count(*)::text as n from ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)}`,
  );
  return Number(res.rows[0]?.n ?? "0");
}

async function main(): Promise<void> {
  const allowBaseline = !process.argv.includes("--no-baseline");
  const journal = readJournal();
  if (allowBaseline) await baselineIfPushed();

  const before = await appliedCount();
  await migrate(db, {
    migrationsFolder: MIGRATIONS_FOLDER,
    migrationsSchema: MIGRATIONS_SCHEMA,
    migrationsTable: MIGRATIONS_TABLE,
  });
  const after = await appliedCount();

  const applied = journal.slice(journal.length - (after - before)).map((e) => e.tag);
  if (applied.length === 0) {
    console.log(`migrate: up to date (${journal.length} migrations, ${after} recorded)`);
  } else {
    for (const tag of applied) console.log(`migrate: applied ${tag}`);
  }
}

main()
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error(err);
    await closeDb().catch(() => undefined);
    process.exit(1);
  });
