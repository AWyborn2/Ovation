/**
 * seed-tenants.ts — seed the single Halls Head tenant row (tenant #1).
 *
 *   pnpm --filter @workspace/scripts run seed-tenants
 *
 * Sources the brand from the existing clubs-register record (id 2), falling back
 * to HALLS_HEAD_BRAND. Idempotent (upsert by slug). Run AFTER
 * `pnpm --filter @workspace/db run push` has created the `tenants` table.
 *
 * Halls Head must be tenant id 1 — getHallsHeadBrand()/getTenantBrand(1) and the
 * default tenant context assume it. A fresh `tenants` table gives the first
 * insert id 1; the script warns if it lands on a different id.
 */
import { eq } from "drizzle-orm";
import { db, tenantsTable, clubsTable } from "@workspace/db";
import { HALLS_HEAD_BRAND } from "@workspace/scorecard/brand";

const HALLS_HEAD_SLUG = "hallshead";
const HALLS_HEAD_CENTRAL_CLUB_ID = 1; // central.clubs id
const HALLS_HEAD_APP_CLUB_ID = 2; // tenant app clubs-register id (brand source)

async function main(): Promise<void> {
  const [club] = await db
    .select({
      name: clubsTable.name,
      shortName: clubsTable.shortName,
      logoUrl: clubsTable.logoUrl,
      primaryColour: clubsTable.primaryColour,
      secondaryColour: clubsTable.secondaryColour,
      tertiaryColour: clubsTable.tertiaryColour,
    })
    .from(clubsTable)
    .where(eq(clubsTable.id, HALLS_HEAD_APP_CLUB_ID));

  const values = {
    slug: HALLS_HEAD_SLUG,
    centralClubId: HALLS_HEAD_CENTRAL_CLUB_ID,
    appClubId: HALLS_HEAD_APP_CLUB_ID,
    name: club?.name ?? HALLS_HEAD_BRAND.name,
    shortName: club?.shortName ?? HALLS_HEAD_BRAND.shortName ?? null,
    logoUrl: club?.logoUrl ?? HALLS_HEAD_BRAND.logoUrl ?? null,
    faviconUrl: null,
    primaryColour: club?.primaryColour ?? HALLS_HEAD_BRAND.primaryColour ?? null,
    secondaryColour:
      club?.secondaryColour ?? HALLS_HEAD_BRAND.secondaryColour ?? null,
    tertiaryColour:
      club?.tertiaryColour ?? HALLS_HEAD_BRAND.tertiaryColour ?? null,
    customDomain: null,
    plan: "pilot",
  };

  const [row] = await db
    .insert(tenantsTable)
    .values(values)
    .onConflictDoUpdate({ target: tenantsTable.slug, set: values })
    .returning();

  console.log(
    `seed-tenants: upserted tenant #${row.id} (${row.slug}) — ${row.name}`,
  );
  if (row.id !== 1) {
    console.warn(
      `⚠️  Halls Head landed on id ${row.id}, expected 1. ` +
        "getHallsHeadBrand()/getTenantBrand(1) and the default tenant context " +
        "assume Halls Head = id 1 — seed into a fresh tenants table.",
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
