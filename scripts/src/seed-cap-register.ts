/**
 * seed-cap-register.ts — seed a club's A Grade (male) and Female A Grade cap
 * register from the club's own list (rules: seed-cap-register-core.ts).
 *
 * The club's caps are its official numbering, so they are written CONFIRMED and
 * linked to the club's players by exact name. Anything not linked is still
 * written (unlinked) and listed in unlinked.csv for the club to link by hand in
 * Admin → Caps. Once caps are linked, the hourly debut-cap sweep numbers new
 * debutants after the newest capped debut, as pending caps an admin confirms.
 *
 * Run the history import FIRST (pre-digital players are cap candidates too).
 *
 *   # preview (default — writes nothing)
 *   pnpm --filter @workspace/scripts run seed-cap-register -- --tenant=68 --file=<caps.csv>
 *   # write, after the club has checked the preview
 *   pnpm --filter @workspace/scripts run seed-cap-register -- --tenant=68 --file=<caps.csv> --commit
 *
 * Needs DATABASE_URL (and CENTRAL_DATABASE_URL, to see the club's central
 * players). A category that already has caps is refused whole, so a re-run
 * after a commit writes nothing.
 * Output: plan.csv, unlinked.csv and, after a commit, reversal.json in a
 * timestamped folder under --out (default: the OS temp dir).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, closeDb, capRegisterTable, tenantsTable } from "@workspace/db";
import { closeCentralDb } from "@workspace/db/central";
import {
  loadCentralCandidates,
  loadHistoryCandidates,
} from "../../artifacts/api-server/src/lib/history-import";
import { toCsv } from "./hh-central-crosswalk-core";
import {
  parseCapCsv,
  parseSeedArgs,
  planCapSeed,
  type CapCandidate,
  type CapCategory,
  type CapSeedPlan,
} from "./seed-cap-register-core";

const USAGE = `seed-cap-register — seed a club's A Grade / Female A Grade cap register.

  pnpm --filter @workspace/scripts run seed-cap-register -- --tenant=<id> --file=<caps.csv> [--commit] [--out=<dir>]

  --tenant=<id>   the club's tenant
  --file=<csv>    category,cap_number,name,games_a_grade  (category: male | female)
  --commit        write in one transaction (default: preview, writes nothing)
  --out=<dir>     parent directory for the timestamped report folder (default: OS temp dir)`;

const CAP_NOTE = "Seeded from the club's own cap list";

async function existingCounts(tenantId: number): Promise<Record<CapCategory, number>> {
  const rows = await db
    .select({ category: capRegisterTable.category, n: sql<number>`count(*)::int` })
    .from(capRegisterTable)
    .where(eq(capRegisterTable.tenantId, tenantId))
    .groupBy(capRegisterTable.category);
  const out: Record<CapCategory, number> = { male: 0, female: 0 };
  for (const r of rows) if (r.category === "male" || r.category === "female") out[r.category] = r.n;
  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const args = parseSeedArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL must be set.");
    process.exit(2);
  }

  const parsed = parseCapCsv(readFileSync(args.file, "utf8"));
  if (parsed.errors.length > 0) {
    for (const e of parsed.errors) console.error(e);
    process.exit(1);
  }

  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      centralClubId: tenantsTable.centralClubId,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, args.tenant));
  if (!tenant) throw new Error(`No tenant ${args.tenant}.`);

  console.log(args.commit ? "MODE: COMMIT" : "MODE: PREVIEW (nothing is written)");
  console.log(`Tenant ${tenant.id}: ${tenant.name}`);

  const candidates: CapCandidate[] = [];
  try {
    candidates.push(...(await loadCentralCandidates(tenant.id, tenant.centralClubId)));
  } catch (err) {
    console.warn(
      `Central couldn't be read (${err instanceof Error ? err.message : String(err)}); ` +
        "only pre-digital players can be linked.",
    );
  }
  candidates.push(...(await loadHistoryCandidates(tenant.id)));

  const plan = planCapSeed({
    rows: parsed.rows,
    candidates,
    existing: await existingCounts(tenant.id),
  });
  report(plan, args.commit, args.out);

  if (plan.errors.length > 0) {
    console.error(`\n${plan.errors.length} problem(s) in the file; nothing written.`);
    process.exitCode = 1;
    return;
  }
  if (!args.commit) {
    console.log("\nPreview only. Re-run with --commit to write these caps.");
    return;
  }
  if (plan.caps.length === 0) {
    console.log("\nNothing to write.");
    return;
  }

  const written = await db.transaction(async (tx) => {
    // Re-check inside the transaction: a category may have been filled meanwhile.
    const taken = await tx
      .select({ category: capRegisterTable.category })
      .from(capRegisterTable)
      .where(
        and(
          eq(capRegisterTable.tenantId, tenant.id),
          inArray(capRegisterTable.category, [...new Set(plan.caps.map((c) => c.category))]),
        ),
      )
      .limit(1);
    if (taken.length > 0)
      throw new Error("The register changed since the preview — nothing written; re-run.");
    const rows = await tx
      .insert(capRegisterTable)
      .values(
        plan.caps.map((c) => ({
          tenantId: tenant.id,
          capNumber: c.capNumber,
          category: c.category,
          name: c.name,
          deceased: false,
          inStats: c.playerId !== null,
          gamesAGrade: c.games,
          playerId: c.playerId,
          capNote: CAP_NOTE,
          autoCreated: false,
          status: "confirmed",
        })),
      )
      .returning({ id: capRegisterTable.id });
    return rows.map((r) => r.id);
  });
  console.log(`\nWrote ${written.length} cap(s).`);

  const outDir = reportDir(args.out);
  writeFileSync(
    path.join(outDir, "reversal.json"),
    JSON.stringify(
      {
        committedAt: new Date().toISOString(),
        tenantId: tenant.id,
        capRegisterIds: written,
        undo: "DELETE FROM cap_register WHERE tenant_id = <tenantId> AND id IN (<capRegisterIds>) AND auto_created = false;",
      },
      null,
      2,
    ),
  );
  console.log(`reversal.json written to ${outDir}`);
}

let cachedDir: string | null = null;
function reportDir(parent: string | null): string {
  if (cachedDir) return cachedDir;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  cachedDir = path.join(parent ?? os.tmpdir(), `seed-cap-register-${stamp}`);
  mkdirSync(cachedDir, { recursive: true });
  return cachedDir;
}

function report(plan: CapSeedPlan, commit: boolean, out: string | null): void {
  const dir = reportDir(out);
  writeFileSync(
    path.join(dir, "plan.csv"),
    toCsv(
      ["category", "cap_number", "name", "games", "player_id", "status", "note"],
      plan.caps.map((c) => [
        c.category,
        c.capNumber,
        c.name,
        c.games,
        c.playerId ?? "",
        c.status,
        c.note,
      ]),
    ),
  );
  const unlinked = plan.caps.filter((c) => c.playerId === null);
  writeFileSync(
    path.join(dir, "unlinked.csv"),
    toCsv(
      ["category", "cap_number", "name", "status", "note"],
      unlinked.map((c) => [c.category, c.capNumber, c.name, c.status, c.note]),
    ),
  );
  for (const r of plan.refusedCategories) {
    console.log(`REFUSED ${r.category}: the register already holds ${r.existing} cap(s).`);
  }
  for (const cat of ["male", "female"] as const) {
    const caps = plan.caps.filter((c) => c.category === cat);
    if (caps.length === 0) continue;
    const by = (s: string) => caps.filter((c) => c.status === s).length;
    console.log(
      `${cat === "male" ? "A Grade" : "Female A Grade"}: ${caps.length} cap(s) — ` +
        `${by("linked")} linked, ${by("unmatched")} unmatched, ${by("ambiguous")} ambiguous, ${by("private")} private`,
    );
  }
  for (const e of plan.errors) console.error(`  ${e}`);
  console.log(
    `${commit ? "Will write" : "Would write"} ${plan.caps.length} cap(s). Report: ${dir}`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeCentralDb();
    await closeDb();
  });
