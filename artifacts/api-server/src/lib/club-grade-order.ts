import { eq } from "drizzle-orm";
import { db, matchDisplaySettingsTable } from "@workspace/db";
import { sortByGradeOrder } from "@workspace/scorecard";

/** The club's saved grade menu order (Admin → Matches display), or none. */
export async function loadClubGradeOrder(tenantId: number): Promise<string[]> {
  const [row] = await db
    .select({ gradeOrder: matchDisplaySettingsTable.gradeOrder })
    .from(matchDisplaySettingsTable)
    .where(eq(matchDisplaySettingsTable.tenantId, tenantId));
  return row?.gradeOrder ?? [];
}

/** A round's results in the club's grade order (then seniority): 1st Grade before 4th. */
export async function inClubGradeOrder<T extends { gradeLabel: string }>(
  tenantId: number,
  matches: readonly T[],
): Promise<T[]> {
  return sortByGradeOrder(matches, (m) => m.gradeLabel, await loadClubGradeOrder(tenantId));
}
