/**
 * seed-cap-register.ts — seed a club's A Grade (male) and Female A Grade cap
 * register from the club's own list, from a terminal. The same import is in the
 * platform-admin console (club history import page → Cap register), which is
 * the day-to-day route; this script is the preview-first tool for a one-off
 * with reports on disk. Rules and writes: artifacts/api-server/src/lib/cap-import*.ts.
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
 * players). A list that already has caps is refused, so a re-run after a
 * commit writes nothing. A batch can be undone from the console (or by its id
 * in reversal.json) while no later cap exists in the same list.
 * Output: plan.csv, unlinked.csv and, after a commit, reversal.json in a
 * timestamped folder under --out (default: the OS temp dir).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDb } from "@workspace/db";
import { closeCentralDb } from "@workspace/db/central";
import {
  commitCapImport,
  previewCapImport,
  type CapImportPreviewResult,
} from "../../artifacts/api-server/src/lib/cap-import";
import {
  CAP_CATEGORY_LABEL,
  parseSeedArgs,
} from "../../artifacts/api-server/src/lib/cap-import-core";
import { toCsv } from "./hh-central-crosswalk-core";

const USAGE = `seed-cap-register — seed a club's A Grade / Female A Grade cap register.

  pnpm --filter @workspace/scripts run seed-cap-register -- --tenant=<id> --file=<caps.csv> [--commit] [--label=<text>] [--out=<dir>]

  --tenant=<id>   the club's tenant
  --file=<csv>    category,cap_number,name,games_a_grade  (category: male | female)
  --commit        write in one transaction (default: preview, writes nothing)
  --label=<text>  the batch's name in the console (default: "Seeded by script: <file name>")
  --out=<dir>     parent directory for the timestamped report folder (default: OS temp dir)`;

function reportDir(parent: string | null): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(parent ?? os.tmpdir(), `seed-cap-register-${stamp}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function report(preview: CapImportPreviewResult, dir: string, commit: boolean): void {
  writeFileSync(
    path.join(dir, "plan.csv"),
    toCsv(
      ["category", "cap_number", "name", "games", "player_id", "status", "note"],
      preview.caps.map((c) => [
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
  writeFileSync(
    path.join(dir, "unlinked.csv"),
    toCsv(
      ["category", "cap_number", "name", "status", "note"],
      preview.caps
        .filter((c) => c.playerId === null)
        .map((c) => [c.category, c.capNumber, c.name, c.status, c.note]),
    ),
  );
  if (preview.centralUnavailable) {
    console.warn(
      `Central couldn't be read (${preview.centralUnavailable}); only pre-digital players could be linked.`,
    );
  }
  for (const cat of ["male", "female"] as const) {
    const caps = preview.caps.filter((c) => c.category === cat);
    if (caps.length === 0) continue;
    const by = (s: string) => caps.filter((c) => c.status === s).length;
    console.log(
      `${CAP_CATEGORY_LABEL[cat]}: ${caps.length} cap(s) — ${by("linked")} linked, ` +
        `${by("unmatched")} unmatched, ${by("ambiguous")} ambiguous, ${by("private")} private`,
    );
  }
  for (const e of preview.errors) console.error(`  ${e}`);
  console.log(
    `${commit ? "Will write" : "Would write"} ${preview.rowCount} cap(s). Report: ${dir}`,
  );
}

async function main(): Promise<void> {
  const args = parseSeedArgs(process.argv.slice(2).filter((a) => a !== "--"));
  if (args.help) {
    console.log(USAGE);
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL must be set.");
    process.exit(2);
  }
  const csv = readFileSync(args.file, "utf8");

  console.log(args.commit ? "MODE: COMMIT" : "MODE: PREVIEW (nothing is written)");
  const dir = reportDir(args.out);
  const preview = await previewCapImport(args.tenant, csv);
  report(preview, dir, args.commit);

  if (preview.errors.length > 0) {
    console.error(`\n${preview.errors.length} problem(s); nothing written.`);
    process.exitCode = 1;
    return;
  }
  if (!args.commit) {
    console.log("\nPreview only. Re-run with --commit to write these caps.");
    return;
  }

  const label = args.label ?? `Seeded by script: ${path.basename(args.file)}`;
  const result = await commitCapImport({ tenantId: args.tenant, csv, label });
  console.log(
    `\nWrote ${result.written} cap(s) as batch ${result.batchId} (${result.linked} linked, ${result.unlinked} unlinked).`,
  );
  writeFileSync(
    path.join(dir, "reversal.json"),
    JSON.stringify(
      {
        committedAt: new Date().toISOString(),
        tenantId: args.tenant,
        batchId: result.batchId,
        undo: "Console: club history import page → Cap register → Undo, or DELETE /api/platform/admin/tenants/<tenantId>/cap-import/batches/<batchId>.",
      },
      null,
      2,
    ),
  );
  console.log(`reversal.json written to ${dir}`);
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
