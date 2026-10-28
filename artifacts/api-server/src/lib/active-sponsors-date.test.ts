/**
 * The sponsor active window is the club's date (Australia/Perth), not UTC: at
 * 4 am in Perth on 28 Oct the UTC date is still 27 Oct, and a sponsorship that
 * starts on the 28th must already be live (and one that ended on the 27th
 * gone). Real-DB integration test (needs DATABASE_URL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { db, sponsorsTable, tenantsTable } from "@workspace/db";
import { logger } from "./logger";
import { loadActiveSponsors } from "./active-sponsors";

const STAMP = Date.now();
let tenantId = 0;
// 04:00 on 28 Oct 2026 in Perth (UTC+8) = 20:00 on 27 Oct UTC.
const PERTH_EARLY_MORNING = new Date("2026-10-27T20:00:00Z");

beforeAll(async () => {
  const [t] = await db
    .insert(tenantsTable)
    .values({
      slug: `sponsor-date-${STAMP}`,
      centralClubId: 9990,
      name: "Sponsor Date Club",
      plan: "pro",
    })
    .returning();
  tenantId = t.id;
  const logo = `/api/storage/objects/${STAMP}.png`;
  await db.insert(sponsorsTable).values([
    { tenantId, name: `Starts today ${STAMP}`, logoUrl: logo, activeFrom: "2026-10-28" },
    { tenantId, name: `Ended yesterday ${STAMP}`, logoUrl: logo, activeTo: "2026-10-27" },
    { tenantId, name: `Ends today ${STAMP}`, logoUrl: logo, activeTo: "2026-10-28" },
    { tenantId, name: `Starts tomorrow ${STAMP}`, logoUrl: logo, activeFrom: "2026-10-29" },
  ]);
});

afterAll(async () => {
  await db.delete(sponsorsTable).where(inArray(sponsorsTable.tenantId, [tenantId]));
  await db.delete(tenantsTable).where(inArray(tenantsTable.id, [tenantId]));
});

describe("loadActiveSponsors: the club's date", () => {
  it("uses the Perth date, not the UTC date", async () => {
    const live = await loadActiveSponsors(tenantId, logger, PERTH_EARLY_MORNING);
    expect(live.map((s) => s.name).sort()).toEqual(
      [`Ends today ${STAMP}`, `Starts today ${STAMP}`].sort(),
    );
  });
});
