/**
 * playhq-project-fixtures.ts — project each linked tenant's PlayHQ matches into
 * `public.fixtures` (source = "playhq") so Social Studio's fixture-driven cards
 * (Match Day, Team List, Countdown) and the admin fixtures page see the real
 * season schedule without anyone typing it in.
 *
 * Usage (DATABASE_URL = tenant DB, CENTRAL_DATABASE_URL = the Postgres holding playhq.*):
 *   pnpm --filter @workspace/scripts run playhq-project-fixtures -- --dry-run
 *   pnpm --filter @workspace/scripts run playhq-project-fixtures -- --yes
 *   pnpm --filter @workspace/scripts run playhq-project-fixtures -- --tenant=1 --yes
 *   # Link a tenant to its PlayHQ organisation first (GUID = last path segment of
 *   # the club's play.cricket.com.au URL), then project:
 *   pnpm --filter @workspace/scripts run playhq-project-fixtures -- --tenant=1 --set-org=<guid> --yes
 *   # Or let it find the organisation itself: an unlinked tenant whose central club name
 *   # matches exactly one PlayHQ organisation gets linked (the post-merge hook does this):
 *   pnpm --filter @workspace/scripts run playhq-project-fixtures -- --auto-link --yes
 *   # `playhq-load --project` runs this after a load.
 *
 * The projection itself lives in `@workspace/db/playhq-ingest` (shared with the API's
 * scheduled-ingest endpoint); this file is the CLI around it plus the HTTP draft-sweep nudge.
 *
 * What it writes: one `fixtures` row per senior PlayHQ match involving the
 * tenant's organisation with a known start time inside the window (default: from
 * 14 days ago onwards, so this week's results stay visible), keyed on
 * `(tenant_id, playhq_match_id)`. Re-runs refresh grade, round, opponent, venue
 * (with its coordinates, for the match-day forecast),
 * start time and home/away; `notes` and the team list are the admin's and are
 * never touched. Rows are never deleted here — a fixture PlayHQ drops or
 * abandons stays until an admin removes it.
 */
import { eq } from "drizzle-orm";
import {
  PLAYHQ_ORG_GUID_RE,
  projectFixtures,
  type ProjectionSummary,
} from "@workspace/db/playhq-ingest";
import { confirmDatabaseTarget, isDryRun } from "./lib/cli";
import { confirmTarget } from "./playhq-load";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function argValue(flag: string): string | undefined {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && !process.argv[idx + 1]?.startsWith("--") ? process.argv[idx + 1] : undefined;
}

/**
 * Ask the API to draft match-day and team-list cards for every tenant whose
 * fixtures just changed (Social Studio, KTD10). Needs SOCIAL_SWEEP_URL (the
 * deployed `/api/internal/draft-sweep` endpoint) and SOCIAL_SWEEP_SECRET;
 * without them it only logs — the scheduled sweep picks the changes up anyway.
 * A failed request is logged, never fatal: the fixtures are already committed.
 */
export async function requestDraftSweeps(
  summaries: ProjectionSummary[],
  opts: {
    url?: string;
    secret?: string;
    fetchImpl?: typeof fetch;
    log?: (line: string) => void;
  } = {},
): Promise<number[]> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const url = opts.url ?? process.env.SOCIAL_SWEEP_URL;
  const secret = opts.secret ?? process.env.SOCIAL_SWEEP_SECRET;
  const touched = summaries.filter((s) => s.inserted + s.updated > 0).map((s) => s.tenantId);
  if (touched.length === 0) return [];
  if (!url || !secret) {
    log("draft sweep not requested (SOCIAL_SWEEP_URL / SOCIAL_SWEEP_SECRET unset)");
    return [];
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const swept: number[] = [];
  for (const tenantId of touched) {
    try {
      const res = await doFetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-sweep-secret": secret },
        body: JSON.stringify({ tenantId, scope: "fixtures" }),
      });
      if (res.ok) swept.push(tenantId);
      else log(`draft sweep for tenant ${tenantId} failed: HTTP ${res.status}`);
    } catch (err) {
      log(`draft sweep for tenant ${tenantId} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  return swept;
}

async function main(): Promise<void> {
  const tenantRaw = argValue("--tenant");
  const tenantId = tenantRaw ? Number(tenantRaw) : undefined;
  if (tenantRaw && (!Number.isInteger(tenantId) || (tenantId ?? 0) <= 0))
    throw new Error("--tenant must be a positive integer");
  const setOrg = argValue("--set-org");
  const windowDays = Number(argValue("--window-days") ?? 14);
  const autoLink = process.argv.includes("--auto-link");
  const dryRun = isDryRun();

  confirmDatabaseTarget();
  const centralUrl = process.env.CENTRAL_DATABASE_URL;
  if (!centralUrl)
    throw new Error("CENTRAL_DATABASE_URL must be set (the Postgres that holds playhq.*).");
  confirmTarget(centralUrl);

  if (setOrg) {
    if (!tenantId) throw new Error("--set-org requires --tenant=<id>");
    if (!PLAYHQ_ORG_GUID_RE.test(setOrg))
      throw new Error("--set-org must be the PlayHQ organisation GUID (8-4-4-4-12 hex)");
    if (dryRun)
      console.log(`[dry-run] would set tenants.playhq_org_id = ${setOrg} for tenant ${tenantId}`);
    else {
      const { db, tenantsTable } = await import("@workspace/db");
      const updated = await db
        .update(tenantsTable)
        .set({ playhqOrgId: setOrg.toLowerCase() })
        .where(eq(tenantsTable.id, tenantId))
        .returning({ id: tenantsTable.id, slug: tenantsTable.slug });
      if (!updated.length) throw new Error(`tenant ${tenantId} not found`);
      console.log(
        `tenant ${tenantId} (${updated[0].slug}) linked to PlayHQ organisation ${setOrg}`,
      );
    }
  }

  const summaries = await projectFixtures({ tenantId, windowDays, autoLink, dryRun });
  if (!dryRun) await requestDraftSweeps(summaries);
  const { closeDb } = await import("@workspace/db");
  await closeDb();
}

const invokedDirectly =
  process.argv[1] &&
  (await import("node:path")).resolve(process.argv[1]) ===
    (await import("node:url")).fileURLToPath(import.meta.url);
if (invokedDirectly)
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
