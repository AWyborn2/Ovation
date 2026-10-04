/**
 * playhq-project-central.ts — copy finished PlayHQ matches into the central stats tables, by
 * hand: backfills and reruns of what the scheduled ingest does after every sync.
 *
 * Plan: docs/plans/2026-10-04-001-feat-playhq-central-projection-plan.md (P4).
 *
 * Usage (CENTRAL_PROJECTOR_DATABASE_URL = the central_projector role; see
 * scripts/sql/central-projector.sql):
 *   pnpm --filter @workspace/scripts run playhq-project-central -- --season="Summer 2026/27" --dry-run
 *   pnpm --filter @workspace/scripts run playhq-project-central -- --season="Summer 2026/27" --yes
 *   pnpm --filter @workspace/scripts run playhq-project-central -- --org=<playhq org guid> --yes
 *   pnpm --filter @workspace/scripts run playhq-project-central -- --match=<playhq match guid> --yes
 *
 * At least one of --season, --org or --match is required. --dry-run computes everything and
 * writes nothing. A non-local target needs --yes. Idempotent: re-running re-projects the same
 * matches and replaces their rows exactly. The API's central read caches expire within five
 * minutes, so a backfill shows up on the site without a restart.
 */
import {
  assertProjectorScope,
  closeCentralProjectorPool,
  getCentralProjectorPool,
  projectToCentral,
} from "@workspace/db/playhq-ingest";
import { isDryRun } from "./lib/cli";
import { confirmTarget } from "./playhq-load";

function argValues(flag: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a.startsWith(`${flag}=`)) out.push(a.slice(flag.length + 1));
    else if (a === flag && process.argv[i + 1] && !process.argv[i + 1]!.startsWith("--"))
      out.push(process.argv[i + 1]!);
  });
  return out;
}

async function main(): Promise<void> {
  const season = argValues("--season")[0];
  const orgId = argValues("--org")[0];
  const matchIds = argValues("--match");
  const dryRun = isDryRun();
  if (!season && !orgId && !matchIds.length)
    throw new Error("Pass --season=<PlayHQ season name>, --org=<guid> and/or --match=<guid>.");

  const url = process.env.CENTRAL_PROJECTOR_DATABASE_URL;
  if (!url)
    throw new Error("CENTRAL_PROJECTOR_DATABASE_URL must be set (the central_projector role).");
  if (!dryRun) confirmTarget(url);

  const pool = getCentralProjectorPool();
  try {
    await assertProjectorScope(pool);
    const s = await projectToCentral(pool, {
      season,
      orgId,
      matchIds: matchIds.length ? matchIds : undefined,
      dryRun,
      log: (line) => console.log(line),
    });
    for (const k of s.skipped) console.log(`skipped ${k.playhqMatchId}: ${k.reason}`);
    console.log(
      `${dryRun ? "[dry run] " : ""}${s.considered} considered, ${s.created} created, ${s.updated} updated, ` +
        `${s.skipped.length} skipped, ${s.playersInserted} new players`,
    );
    if (s.skipped.some((k) => k.reason.startsWith("error:"))) process.exitCode = 1;
  } finally {
    await closeCentralProjectorPool();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
