#!/usr/bin/env node
/**
 * Apply one hand-written migration file to a database you name explicitly —
 * production in practice (CLAUDE.md: production schema changes are applied
 * by hand, before republishing). Usage, from the repo root:
 *
 *   node scripts/apply-production-sql.mjs lib/db/migrations/0035_kind_templates.sql
 *
 * The connection string comes from PROD_DATABASE_URL, or is asked for without
 * echoing it. It is never printed. The workspace's DATABASE_URL is the
 * development database, so it is deliberately not used.
 *
 * What it does:
 *   1. connects and shows which server and database it reached;
 *   2. runs the file's checks (known migrations only) and reports what is
 *      already there — with --check it stops here, changing nothing;
 *   3. asks you to type the database name to confirm;
 *   4. applies the file in one transaction (all or nothing), with a short
 *      lock timeout so it never queues behind a long-running query;
 *   5. runs the checks again and fails loudly if anything is missing.
 *
 * Migrations in lib/db/migrations are written to be re-runnable (IF NOT
 * EXISTS / drop-and-re-add), so running a file that is already applied is
 * safe. The Drizzle ledger is not touched: production's ledger is not a
 * reliable record (see .agents/memory and CLAUDE.md STATUS).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
// pg is a dependency of lib/db; resolve it from there.
const { Client } = createRequire(resolve(repoRoot, "lib/db/package.json"))("pg");

/** Post-conditions per migration: each query must return a truthy `ok`. */
const CHECKS = {
  "0035_kind_templates.sql": [
    [
      "social_drafts has template_version, layout_warnings, layout_check_pending, design_edited_at",
      `select count(*) = 4 as ok from information_schema.columns
        where table_schema = 'public' and table_name = 'social_drafts'
          and column_name in ('template_version','layout_warnings','layout_check_pending','design_edited_at')`,
    ],
    [
      "card_templates has version, updated_at, updated_by_admin_id, replaced_pack_id, notice_dismissed_at",
      `select count(*) = 5 as ok from information_schema.columns
        where table_schema = 'public' and table_name = 'card_templates'
          and column_name in ('version','updated_at','updated_by_admin_id','replaced_pack_id','notice_dismissed_at')`,
    ],
    [
      "social_draft_revisions has pack_id, template_version",
      `select count(*) = 2 as ok from information_schema.columns
        where table_schema = 'public' and table_name = 'social_draft_revisions'
          and column_name in ('pack_id','template_version')`,
    ],
    [
      "index card_templates_kind_unique exists",
      `select to_regclass('public.card_templates_kind_unique') is not null as ok`,
    ],
    [
      "revision reason check allows 'template'",
      `select coalesce(bool_or(pg_get_constraintdef(oid) like '%template%'), false) as ok
         from pg_constraint where conname = 'social_draft_revisions_reason_check'`,
    ],
    [
      "foreign key card_templates.updated_by_admin_id → admins exists",
      `select count(*) = 1 as ok from pg_constraint
        where conname = 'card_templates_updated_by_admin_id_admins_id_fk'`,
    ],
  ],
};

// One reader for the whole run, so answers typed (or piped) ahead aren't lost.
let reader = null;
let closed = false;
const lines = [];
const waiting = [];

function ask(question, { hidden = false } = {}) {
  if (!reader) {
    reader = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = reader._writeToOutput.bind(reader);
    reader._writeToOutput = (s) => {
      // While a hidden answer is being typed, echo only the prompt itself.
      if (!reader.hidden || s.includes(reader.prompt)) write(s);
    };
    reader.on("line", (line) => {
      const next = waiting.shift();
      if (next) next(line.trim());
      else lines.push(line.trim());
    });
    reader.on("close", () => {
      closed = true;
      while (waiting.length) waiting.shift()("");
    });
  }
  // Input ended (e.g. piped answers ran out): answer from what was read.
  if (closed) return Promise.resolve(lines.shift() ?? "");
  reader.hidden = hidden;
  reader.setPrompt(question);
  reader.prompt();
  return new Promise((done) => {
    const finish = (answer) => {
      reader.hidden = false;
      if (hidden) process.stdout.write("\n");
      done(answer);
    };
    if (lines.length) finish(lines.shift());
    else waiting.push(finish);
  });
}

async function runChecks(client, checks) {
  let allOk = true;
  for (const [label, sql] of checks) {
    const { rows } = await client.query(sql);
    const ok = rows[0]?.ok === true;
    allOk &&= ok;
    console.log(`  ${ok ? "✔" : "✘"} ${label}`);
  }
  return allOk;
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: node scripts/apply-production-sql.mjs <migration.sql> [--check]");
    process.exit(2);
  }
  const path = resolve(repoRoot, file);
  const sqlText = readFileSync(path, "utf8");
  const checks = CHECKS[basename(path)] ?? [];

  const url =
    process.env.PROD_DATABASE_URL ||
    (await ask("Production connection string (input hidden): ", { hidden: true }));
  if (!url) {
    console.error("No connection string given.");
    process.exit(2);
  }
  if (process.env.DATABASE_URL && url === process.env.DATABASE_URL) {
    console.error(
      "That is this workspace's DATABASE_URL, which is the development database. Use the production one.",
    );
    process.exit(2);
  }

  const client = new Client({ connectionString: url, application_name: "apply-production-sql" });
  await client.connect();
  try {
    const { rows } = await client.query(
      "select current_database() as db, inet_server_addr()::text as host, version() as version",
    );
    const { db, host, version } = rows[0];
    console.log(`Connected to database "${db}" on ${host ?? "a local socket"}`);
    console.log(`  ${String(version).split(",")[0]}`);
    console.log(`Migration: ${file}`);

    if (checks.length) {
      console.log("Before:");
      const already = await runChecks(client, checks);
      if (already) console.log("Everything this migration adds is already there.");
      if (checkOnly) return;
      if (already) {
        const again = await ask("Re-run it anyway? It is safe to repeat. [y/N] ");
        if (!/^y(es)?$/i.test(again)) return;
      }
    } else {
      console.log("(No built-in checks for this file; it will be applied as written.)");
      if (checkOnly) return;
    }

    const typed = await ask(`Type the database name ("${db}") to apply the migration: `);
    if (typed !== db) {
      console.log("Not confirmed. Nothing was changed.");
      return;
    }

    await client.query("begin");
    try {
      // Wait at most 5 s for a table lock (a sweep or publish may hold one);
      // if it can't get one, nothing is applied and you can simply re-run.
      await client.query("set local lock_timeout = '5s'");
      await client.query("set local statement_timeout = '60s'");
      await client.query(sqlText);
      await client.query("commit");
    } catch (err) {
      await client.query("rollback");
      console.error(`Failed, rolled back, nothing was changed: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    console.log("Applied.");

    if (checks.length) {
      console.log("After:");
      if (!(await runChecks(client, checks))) {
        console.error("Some checks still fail after applying. Look at the output above.");
        process.exitCode = 1;
        return;
      }
      console.log("All checks pass.");
    }
  } finally {
    await client.end();
    reader?.close();
  }
}

main().catch((err) => {
  // Connection errors can carry the URL; print the message only.
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
