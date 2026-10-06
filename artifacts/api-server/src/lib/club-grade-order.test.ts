// Round results list in the club's grade order, then seniority (real database).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, matchDisplaySettingsTable, tenantsTable } from "@workspace/db";
import { inClubGradeOrder } from "./club-grade-order";

const STAMP = Date.now();
let plain: number;
let custom: number;
const wrap = ["4th Grade", "Female A Grade", "2nd Grade", "1st Grade", "3rd Grade"].map(
  (gradeLabel) => ({ gradeLabel }),
);
const labels = (rows: { gradeLabel: string }[]) => rows.map((r) => r.gradeLabel);

beforeAll(async () => {
  const [a, b] = await db
    .insert(tenantsTable)
    .values([
      { slug: `grade-order-a-${STAMP}`, centralClubId: 9931, name: "Order A", plan: "pro" },
      { slug: `grade-order-b-${STAMP}`, centralClubId: 9932, name: "Order B", plan: "pro" },
    ])
    .returning();
  plain = a.id;
  custom = b.id;
  await db
    .insert(matchDisplaySettingsTable)
    .values({ tenantId: custom, gradeOrder: ["Female A Grade", "1st Grade"] });
});

afterAll(async () => {
  await db.delete(matchDisplaySettingsTable).where(eq(matchDisplaySettingsTable.tenantId, custom));
  for (const id of [plain, custom]) await db.delete(tenantsTable).where(eq(tenantsTable.id, id));
});

describe("inClubGradeOrder", () => {
  it("lists a round in seniority order when the club has saved no order", async () => {
    expect(labels(await inClubGradeOrder(plain, wrap))).toEqual([
      "1st Grade",
      "2nd Grade",
      "3rd Grade",
      "4th Grade",
      "Female A Grade",
    ]);
  });

  it("follows the club's saved grade order first", async () => {
    expect(labels(await inClubGradeOrder(custom, wrap))).toEqual([
      "Female A Grade",
      "1st Grade",
      "2nd Grade",
      "3rd Grade",
      "4th Grade",
    ]);
  });
});
