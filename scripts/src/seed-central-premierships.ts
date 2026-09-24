/**
 * seed-central-premierships.ts — seed (or re-seed) a central-backed tenant's
 * premiership honour board from central.premiers: result line with scores, the
 * Grand Final scorecard link and the club's team list.
 *
 *   pnpm --filter @workspace/scripts run seed-central-premierships -- --slug=mandurah
 *   ... -- --all                 # every central-backed tenant
 *   ... -- --slug=x --club-id=5  # override the central club
 *   ... -- --slug=x --replace    # drop central-seeded rows first — DISCARDS any
 *                                # edits made to them; hand-added rows stay
 *
 * Provisioning runs the same seed automatically for new clubs; this is for
 * existing tenants and re-seeds after central data changes. Safe to re-run: it
 * only backfills, never overwrites a club's own edits (see
 * lib/db/src/premierships-seed.ts). Requires DATABASE_URL + CENTRAL_DATABASE_URL.
 */
import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { seedTenantPremierships } from "@workspace/db/premierships-seed";

const argv = process.argv.slice(2);
const arg = (n: string): string | undefined =>
  argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const flag = (n: string): boolean => argv.includes(`--${n}`);

async function main(): Promise<void> {
  const all = flag("all");
  const slug = arg("slug") ?? (all ? undefined : "mandurah");
  const replace = flag("replace");

  const tenants = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      centralClubId: tenantsTable.centralClubId,
      readsFromCentral: tenantsTable.readsFromCentral,
    })
    .from(tenantsTable)
    .where(slug ? eq(tenantsTable.slug, slug) : eq(tenantsTable.readsFromCentral, true));
  if (tenants.length === 0) {
    console.error(slug ? `No tenant with slug "${slug}".` : "No central-backed tenants.");
    process.exit(1);
  }

  for (const t of tenants) {
    if (!t.readsFromCentral) {
      // The native tenant (Halls Head) keeps its hand-curated board.
      console.log(`skip ${t.slug}: not central-backed.`);
      continue;
    }
    const clubId = arg("club-id") && slug ? Number(arg("club-id")) : t.centralClubId;
    const r = await seedTenantPremierships(t.id, clubId, { replace });
    console.log(
      `${t.slug} (tenant #${t.id}, central club ${clubId}): ${r.centralPremiers} central ` +
        `premier(s) → ${r.inserted} inserted, ${r.updated} backfilled, ` +
        `${r.playersAdded} player(s) added, ${r.skipped} skipped` +
        (replace ? `, ${r.replaced} replaced` : "") +
        ".",
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
