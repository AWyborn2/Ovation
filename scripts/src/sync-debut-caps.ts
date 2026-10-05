/**
 * sync-debut-caps.ts — catch up a club's A Grade / Female A Grade cap register
 * with debutants it never capped (rules: artifacts/api-server/src/lib/debut-caps.ts).
 *
 * The hourly sweep caps new debutants from the last few weeks by itself; this
 * script covers older ones — e.g. Halls Head's 2025/26 debutants, loaded by the
 * bulk match load, which never issued caps. It only numbers debuts on or after
 * the register's newest capped debut, in debut order; older uncapped players
 * are listed for the club to cap by hand.
 *
 *   # preview (default — writes nothing)
 *   pnpm --filter @workspace/scripts run sync-debut-caps -- --tenant=1
 *   # write, after the club has checked the preview
 *   pnpm --filter @workspace/scripts run sync-debut-caps -- --tenant=1 --commit
 *
 * Needs DATABASE_URL (and CENTRAL_DATABASE_URL for a club on PlayHQ data).
 */
import { closeDb } from "@workspace/db";
import { closeCentralDb } from "@workspace/db/central";
import { syncDebutCaps, type DebutCapPlan } from "../../artifacts/api-server/src/lib/debut-caps";

const USAGE = `sync-debut-caps — catch up a club's A Grade cap register with uncapped debutants.

  pnpm --filter @workspace/scripts run sync-debut-caps -- --tenant=<id> [--commit]`;

function parseArgs(argv: string[]): { tenant: number; commit: boolean } | null {
  let tenant: number | null = null;
  let commit = false;
  for (const a of argv) {
    const [flag, value] = a.split("=", 2) as [string, string | undefined];
    if (flag === "--tenant" && value && /^\d+$/.test(value)) tenant = Number(value);
    else if (flag === "--commit") commit = true;
    else return null;
  }
  return tenant == null ? null : { tenant, commit };
}

function printPlan(p: DebutCapPlan, commit: boolean): void {
  console.log(`\n${p.grade} (${p.category})`);
  if (p.held) console.log(`  held: ${p.held}`);
  if (p.frontier) console.log(`  newest capped debut: ${p.frontier}`);
  for (const c of p.toMint) {
    console.log(
      `  ${commit ? "issued" : "would issue"} cap #${c.capNumber}: ${c.name} ` +
        `(player #${c.playerId}, debut ${c.debutDate ?? "?"}, ${c.games} game(s))`,
    );
  }
  if (p.toMint.length === 0 && !p.held) console.log("  no uncapped debutants");
  for (const d of p.awaitingCatchUp) {
    console.log(`  not issued (held): ${d.name} (player #${d.playerId}, debut ${d.debutDate})`);
  }
  if (p.olderUncapped.length) {
    console.log(
      "  older uncapped players (debut before the newest cap — cap by hand if they earned one):",
    );
    for (const d of p.olderUncapped) {
      console.log(
        `    ${d.name} (player #${d.playerId}, debut ${d.debutDate ?? "?"}, ${d.games} game(s))`,
      );
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2).filter((a) => a !== "--"));
  if (!args) {
    console.error(USAGE);
    process.exit(2);
  }
  console.log(args.commit ? "MODE: COMMIT" : "MODE: PREVIEW (nothing is written)");
  const { plans, minted } = await syncDebutCaps(args.tenant, { since: null, commit: args.commit });
  for (const p of plans) printPlan(p, args.commit);
  console.log(
    args.commit
      ? `\n${minted} cap(s) issued.`
      : "\nPreview only. Re-run with --commit to issue these caps.",
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
