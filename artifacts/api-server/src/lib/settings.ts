import { db } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

/**
 * Get a tenant's singleton settings row (one row per tenant, unique on
 * `tenantId`), creating one seeded with the table's own schema defaults on
 * first access — never copied from another tenant's saved values. Used by
 * every settings table that used to be a single `id=1` global row (Phase 3
 * isolation: honour-display, match-display, records-display, trading-card,
 * junior-match-display, social, milestone-board settings).
 */
export async function getOrCreateSettings<
  Table extends PgTable & { tenantId: PgColumn },
>(table: Table, tenantId: number): Promise<Table["$inferSelect"]> {
  const [existing] = await db
    .select()
    .from(table as PgTable)
    .where(eq(table.tenantId, tenantId));
  if (existing) return existing as Table["$inferSelect"];
  const [created] = await db
    .insert(table as PgTable)
    .values({ tenantId } as Table["$inferInsert"])
    .returning();
  return created as Table["$inferSelect"];
}
