/**
 * backfill-innings-order.ts — set matches.hhcc_batted_first from the master DB's
 * innings-order export so the scorecard renders the two innings in true batting
 * order (rather than always putting Halls Head first).
 *
 *   pnpm --filter @workspace/scripts run backfill-innings-order            # preview
 *   pnpm --filter @workspace/scripts run backfill-innings-order -- --commit
 *
 * Join chain:
 *   innings_order_changes_*.csv  (match_id, halls_head_batted_first: yes/no/blank)
 *     -> master dump INSERT INTO matches (match_id, source_key, ...)  (match_id -> source_key)
 *       -> app matches.source_key  (set hhcc_batted_first true/false/NULL)
 *
 * Idempotent: re-running re-applies the same values. Uploads (source_key NULL)
 * are never touched. Picks the newest matching file in attached_assets by name
 * unless overridden with --csv= / --dump=.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { db, matchesTable } from "@workspace/db";
import { sql, inArray } from "drizzle-orm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const assetsDir = join(repoRoot, "attached_assets");

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const csvArg = args.find((a) => a.startsWith("--csv="))?.slice("--csv=".length);
const dumpArg = args.find((a) => a.startsWith("--dump="))?.slice("--dump=".length);

/** Newest file (by lexical name) in attached_assets matching a prefix + suffix. */
function newest(prefix: string, suffix: string): string {
  const matches = readdirSync(assetsDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(suffix))
    .sort();
  if (matches.length === 0) {
    throw new Error(`No ${prefix}*${suffix} file found in attached_assets`);
  }
  return join(assetsDir, matches[matches.length - 1]);
}

/** Minimal RFC-4180 CSV row splitter (handles quoted fields with commas). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
  }
  return rows;
}

async function main() {
  const csvPath = csvArg ?? newest("innings_order_changes_", ".csv");
  const dumpPath = dumpArg ?? newest("halls_head_cricket_postgres_", ".sql");
  console.log("CSV:", csvPath);
  console.log("Dump:", dumpPath);

  // 1. CSV: match_id -> halls_head_batted_first (true/false/null).
  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  const header = rows[0];
  const idCol = header.indexOf("match_id");
  const bfCol = header.indexOf("halls_head_batted_first");
  if (idCol === -1 || bfCol === -1) {
    throw new Error("CSV missing match_id or halls_head_batted_first column");
  }
  const battedFirstByMatchId = new Map<string, boolean | null>();
  let yes = 0;
  let no = 0;
  let blank = 0;
  for (const r of rows.slice(1)) {
    const id = r[idCol]?.trim();
    if (!id) continue;
    const raw = (r[bfCol] ?? "").trim().toLowerCase();
    let val: boolean | null;
    if (raw === "yes") {
      val = true;
      yes++;
    } else if (raw === "no") {
      val = false;
      no++;
    } else {
      val = null;
      blank++;
    }
    battedFirstByMatchId.set(id, val);
  }
  console.log(
    `CSV rows: ${battedFirstByMatchId.size} (yes=${yes} no=${no} blank=${blank})`,
  );

  // 2. Dump: match_id -> source_key.
  const dump = readFileSync(dumpPath, "utf8");
  const insertRe =
    /INSERT INTO matches \(match_id,source_key,[^)]*\) VALUES \((\d+),'([^']*)'/g;
  const sourceKeyByMatchId = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = insertRe.exec(dump)) !== null) {
    sourceKeyByMatchId.set(m[1], m[2]);
  }
  console.log(`Dump matches (match_id -> source_key): ${sourceKeyByMatchId.size}`);

  // 3. Resolve to (source_key, value) pairs.
  const pairs: { sourceKey: string; value: boolean | null }[] = [];
  let unmapped = 0;
  for (const [id, value] of battedFirstByMatchId) {
    const sourceKey = sourceKeyByMatchId.get(id);
    if (!sourceKey) {
      unmapped++;
      continue;
    }
    pairs.push({ sourceKey, value });
  }
  console.log(
    `Resolved ${pairs.length} source_keys (${unmapped} CSV rows had no source_key in dump)`,
  );

  // How many of those source_keys actually exist in the app DB.
  const present = await db.execute<{ n: number }>(sql`
    SELECT COUNT(*)::int AS n FROM matches WHERE source_key IS NOT NULL
  `);
  console.log("App matches with a source_key:", present.rows[0]?.n);

  if (!commit) {
    console.log("\nPREVIEW only. Re-run with -- --commit to apply.");
    await db.$client.end?.();
    return;
  }

  // 4. Single bulk UPDATE keyed by source_key. source_keys are safe identifiers
  // (alphanumeric + underscore) but we still bind them as parameters.
  const trueKeys = pairs.filter((p) => p.value === true).map((p) => p.sourceKey);
  const falseKeys = pairs.filter((p) => p.value === false).map((p) => p.sourceKey);
  const nullKeys = pairs.filter((p) => p.value === null).map((p) => p.sourceKey);

  let updated = 0;
  await db.transaction(async (tx) => {
    if (trueKeys.length) {
      const res = await tx
        .update(matchesTable)
        .set({ hhccBattedFirst: true })
        .where(inArray(matchesTable.sourceKey, trueKeys));
      updated += res.rowCount ?? 0;
    }
    if (falseKeys.length) {
      const res = await tx
        .update(matchesTable)
        .set({ hhccBattedFirst: false })
        .where(inArray(matchesTable.sourceKey, falseKeys));
      updated += res.rowCount ?? 0;
    }
    if (nullKeys.length) {
      const res = await tx
        .update(matchesTable)
        .set({ hhccBattedFirst: null })
        .where(inArray(matchesTable.sourceKey, nullKeys));
      updated += res.rowCount ?? 0;
    }
  });
  console.log(`Rows updated: ${updated}`);

  // Verify distribution in the app DB.
  const dist = await db.execute<{ bf: boolean | null; n: number }>(sql`
    SELECT hhcc_batted_first AS bf, COUNT(*)::int AS n
    FROM matches WHERE source_key IS NOT NULL
    GROUP BY hhcc_batted_first ORDER BY 1
  `);
  console.log("App distribution (source_key matches):", dist.rows);

  await db.$client.end?.();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
