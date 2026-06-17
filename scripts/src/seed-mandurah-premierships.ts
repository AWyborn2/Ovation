/**
 * seed-mandurah-premierships.ts — seed a central-backed tenant's premiership
 * honour board from central.premiers (Phase 1 concierge curated content).
 *
 *   pnpm --filter @workspace/scripts run seed-mandurah-premierships
 *   ... -- --slug=mandurah --club-id=5      # overrides
 *
 * Reads central.premiers for the tenant's central club and full-replaces that
 * tenant's `premierships` rows (tenant-scoped). Curated overrides a club later
 * makes by hand are NOT preserved (this is a from-central reseed) — run it once
 * at onboarding. Requires DATABASE_URL + CENTRAL_DATABASE_URL.
 */
import { eq } from "drizzle-orm";
import { db, tenantsTable, premiershipsTable } from "@workspace/db";
import { centralDb, centralPremiersTable } from "@workspace/db/central";
import { appGradeFromCentral } from "@workspace/db/central-queries";

const arg = (n: string): string | undefined =>
  process.argv.slice(2).find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

const seasonStartYear = (s: string | null): number => {
  const m = s ? /(\d{4})/.exec(s) : null;
  return m ? Number(m[1]) : 0;
};

async function main(): Promise<void> {
  const slug = arg("slug") ?? "mandurah";
  const [tenant] = await db
    .select({ id: tenantsTable.id, centralClubId: tenantsTable.centralClubId })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug));
  if (!tenant) {
    console.error(`No tenant with slug "${slug}". Seed the tenant first.`);
    process.exit(1);
  }
  const clubId = arg("club-id") ? Number(arg("club-id")) : tenant.centralClubId;

  const prems = await centralDb
    .select()
    .from(centralPremiersTable)
    .where(eq(centralPremiersTable.clubId, clubId));

  const rows = prems.map((p) => ({
    tenantId: tenant.id,
    year: seasonStartYear(p.season),
    grade: appGradeFromCentral(p.grade) ?? p.grade ?? "",
    competition: p.grade ?? p.format ?? "",
    venue: p.venue ?? null,
    matchDate: p.matchDate ?? null,
    result: p.opponent ? `def ${p.opponent}` : p.note ?? "Premiers",
    mom: null as string | null,
    notes:
      [p.note, p.confidence ? `confidence: ${p.confidence}` : null]
        .filter(Boolean)
        .join(" · ") || null,
  }));

  // Full replace for this tenant (tenant-scoped delete keeps other tenants safe).
  await db.delete(premiershipsTable).where(eq(premiershipsTable.tenantId, tenant.id));
  if (rows.length > 0) await db.insert(premiershipsTable).values(rows);

  console.log(
    `seed-mandurah-premierships: seeded ${rows.length} premiership(s) for ` +
      `tenant #${tenant.id} (${slug}) from central club ${clubId}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
