/**
 * check-identity-drift.ts — STRICTLY READ-ONLY check that every central player
 * a club's layer names still exists for that club (hybrid stats plan U17; R9,
 * R10, R16). Run it after each central reload, and on demand.
 *
 * Per tenant with a central club it compares
 *   - the crosswalk's participant GUIDs (`player_id_map`; synthetic
 *     `club:<uuid>` keys are skipped — they were never in central), and
 *   - the curation GUIDs (`player_curation`: renames, and both sides of every
 *     suggested or confirmed merge)
 * against the participants who have a line for the tenant's central club right
 * now, and reports the GUIDs that no longer do — with the curated rows
 * (awards, caps, photos, team of the decade, life members, premierships, club
 * roles, honour-board overrides, records, club history) and the corrections
 * that depend on each one. The check is the API's own
 * (artifacts/api-server/src/lib/identity-drift.ts), so this report and the
 * "Broken links" section of the admin corrections screen cannot disagree.
 *
 * It never writes: no flag makes it write, and any flag implying a write is
 * refused. Tenant reads run in `BEGIN TRANSACTION READ ONLY` on a single
 * client that is ROLLED BACK (Postgres itself rejects a write inside it);
 * central reads go through the read-only `centralDb` proxy (write builders
 * throw) on the SELECT-only central role. Nothing is repaired here.
 *
 *   pnpm --filter @workspace/scripts run check-identity-drift
 *   pnpm --filter @workspace/scripts run check-identity-drift -- --tenant=1
 *   pnpm --filter @workspace/scripts run check-identity-drift -- --out=/tmp/drift
 *
 * Needs DATABASE_URL (app DB) and CENTRAL_DATABASE_URL (central).
 * Output: a timestamped folder under --out (default: the OS temp dir) with
 * identity-drift.csv and summary.json, plus counts on the console.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { asc, isNotNull } from "drizzle-orm";
import { closeDb, getPool, tenantsTable } from "@workspace/db";
import { closeCentralDb } from "@workspace/db/central";
import {
  loadIdentityDrift,
  type DriftReader,
} from "../../artifacts/api-server/src/lib/identity-drift";
import { toCsv } from "./hh-central-crosswalk-core";
import {
  DRIFT_CSV_HEADER,
  driftCsvRows,
  parseDriftArgs,
  summariseDrift,
  type TenantDriftResult,
} from "./check-identity-drift-core";

const USAGE = `check-identity-drift — READ-ONLY check for central player GUIDs a club's layer still names but central no longer has.

  pnpm --filter @workspace/scripts run check-identity-drift [-- --tenant=<id>] [--out=<dir>]

  --tenant=<id>  check one tenant only (default: every tenant with a central club)
  --out=<dir>    parent directory for the timestamped output folder (default: OS temp dir)
  --help         show this help

Requires DATABASE_URL (app DB) and CENTRAL_DATABASE_URL (central). Never writes to either.`;

/** Run `fn` inside one READ ONLY transaction that is always rolled back. */
async function readOnly<T>(fn: (ro: DriftReader) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '300s'");
    return await fn(drizzle(client));
  } finally {
    // Nothing was written (the transaction is READ ONLY) — roll back regardless.
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

async function main(): Promise<void> {
  const args = parseDriftArgs(process.argv.slice(2).filter((a) => a !== "--"));
  if ("error" in args) {
    console.error(args.error);
    console.error(USAGE);
    process.exit(2);
  }
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (!process.env.DATABASE_URL || !process.env.CENTRAL_DATABASE_URL) {
    console.error("Both DATABASE_URL (app DB) and CENTRAL_DATABASE_URL (central) must be set.");
    process.exit(2);
  }

  const results = await readOnly(async (ro) => {
    const tenants = (
      await ro
        .select({
          id: tenantsTable.id,
          slug: tenantsTable.slug,
          centralClubId: tenantsTable.centralClubId,
        })
        .from(tenantsTable)
        .where(isNotNull(tenantsTable.centralClubId))
        .orderBy(asc(tenantsTable.id))
    ).filter((t) => args.tenantId === null || t.id === args.tenantId);
    if (args.tenantId !== null && tenants.length === 0) {
      throw new Error(`Tenant ${args.tenantId} doesn't exist or has no central club.`);
    }

    const out: TenantDriftResult[] = [];
    for (const t of tenants) {
      const centralClubId = t.centralClubId!;
      console.log(`Checking tenant ${t.id} (${t.slug}) against central club ${centralClubId}…`);
      const drift = await loadIdentityDrift(t.id, centralClubId, ro);
      out.push({ tenantId: t.id, slug: t.slug, centralClubId, ...drift });
    }
    return out;
  });

  // ---- Write outputs (local files only) -----------------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(args.out ?? os.tmpdir(), `identity-drift-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    path.join(outDir, "identity-drift.csv"),
    toCsv(DRIFT_CSV_HEADER, results.flatMap(driftCsvRows)),
  );
  const summary = {
    generatedAt: new Date().toISOString(),
    readOnly: true,
    tenantFilter: args.tenantId,
    ...summariseDrift(results),
    outputDir: outDir,
  };
  writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  // ---- Console summary -----------------------------------------------------
  console.log("\n=== Identity drift check (READ-ONLY) ===");
  for (const t of summary.tenants) {
    const c = t.checked;
    const verdict = t.centralEmpty
      ? "SKIPPED — central has no participants for this club (empty or mid-reload?)"
      : t.missingGuids === 0
        ? "no drift"
        : `DRIFT: ${t.missingGuids} missing GUIDs (${t.missingKeepers} keepers, ${t.missingMergedAway} merged-away) → ${t.dependentCuratedRows} curated rows, ${t.dependentCorrections} corrections`;
    console.log(
      `Tenant ${t.tenantId} (${t.slug}, club ${t.centralClubId}): crosswalk GUIDs ${c.crosswalkGuids} (+${c.syntheticKeys} synthetic, skipped), curation rows ${c.curationRows}, central participants ${c.centralParticipants} — ${verdict}`,
    );
  }
  console.log("Totals:", summary.totals);
  console.log(`\nWrote ${outDir}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([closeDb(), closeCentralDb()]);
  });
