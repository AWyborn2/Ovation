/**
 * Central scorecards take the opposition crest from PlayHQ (the logo the
 * fixtures page shows): the side of the match that isn't the tenant's own
 * PlayHQ organisation. Real-DB integration test (needs DATABASE_URL).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray, sql } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { clearCentralQueriesCache } from "@workspace/db/central-queries";
import { playhqOpponentLogo } from "./match-detail";
import { invalidateTenantConfigCache } from "./tenant";

const STAMP = Date.now();
const CLUB_ORG = randomUUID();
const OPP_ORG = randomUUID();
const BARE_ORG = randomUUID();
const MATCH = randomUUID();
const BARE_MATCH = randomUUID();
const OPP_LOGO = "https://cdn.example/claremont.png";
let tenantId: number;
let noOrgTenantId: number;

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `phq-logo-${STAMP}`,
      centralClubId: 9961,
      name: "Logo Club",
      plan: "pro",
      playhqOrgId: CLUB_ORG,
    })
    .returning();
  tenantId = t.id;
  const [n] = await db
    .insert(tenantsTable)
    .values({ slug: `phq-none-${STAMP}`, centralClubId: 9962, name: "No Org", plan: "pro" })
    .returning();
  noOrgTenantId = n.id;
  await db.execute(sql`
    insert into playhq.organisations (id, name, logo_url) values
      (${CLUB_ORG}::uuid, 'Rockingham-Mandurah', 'https://cdn.example/rm.png'),
      (${OPP_ORG}::uuid, 'Claremont-Nedlands', ${OPP_LOGO}),
      (${BARE_ORG}::uuid, 'No Crest CC', null)`);
  await db.execute(sql`
    insert into playhq.matches (id, home_org_id, home_team_name, away_org_id, away_team_name) values
      (${MATCH}::uuid, ${OPP_ORG}::uuid, 'Claremont-Nedlands - 3s', ${CLUB_ORG}::uuid, 'Rockingham-Mandurah - 3s'),
      (${BARE_MATCH}::uuid, ${CLUB_ORG}::uuid, 'Rockingham-Mandurah - 1s', ${BARE_ORG}::uuid, 'No Crest - 1s')`);
  clearCentralQueriesCache();
  invalidateTenantConfigCache();
});

afterAll(async () => {
  await db.execute(
    sql`delete from playhq.matches where id in (${MATCH}::uuid, ${BARE_MATCH}::uuid)`,
  );
  await db.execute(
    sql`delete from playhq.organisations where id in (${CLUB_ORG}::uuid, ${OPP_ORG}::uuid, ${BARE_ORG}::uuid)`,
  );
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantId, noOrgTenantId]));
});

describe("PlayHQ opposition logo", () => {
  it("is the other side's organisation logo, home or away", async () => {
    expect(await playhqOpponentLogo(tenantId, MATCH)).toBe(OPP_LOGO);
  });

  it("is null when the opposition has no logo, the match isn't loaded, or the club has no PlayHQ organisation", async () => {
    expect(await playhqOpponentLogo(tenantId, BARE_MATCH)).toBeNull();
    expect(await playhqOpponentLogo(tenantId, randomUUID())).toBeNull();
    expect(await playhqOpponentLogo(noOrgTenantId, MATCH)).toBeNull();
  });
});
