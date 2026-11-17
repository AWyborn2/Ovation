import { and, eq } from "drizzle-orm";
import { db, adminsTable, type AdminRow, type PlatformAdminRow } from "@workspace/db";
import { env } from "../config";

/**
 * A dedicated development-only actor keeps existing admin FK/audit references
 * valid without silently impersonating a club's owner. It has no usable
 * password; resolveAdmin requires the real platform session on every request.
 */
export async function devPlatformClubActor(
  platformAdmin: PlatformAdminRow,
  tenantId: number,
): Promise<AdminRow> {
  if (!env.devPlatformAdminOnly()) throw new Error("Development admin access is disabled");
  const username = `__dev_platform_${platformAdmin.id}`;
  const [existing] = await db
    .select()
    .from(adminsTable)
    .where(and(eq(adminsTable.tenantId, tenantId), eq(adminsTable.username, username)));
  if (existing) return existing;
  await db
    .insert(adminsTable)
    .values({
      tenantId,
      username,
      displayName: `Platform Admin (development)`,
      passwordHash: "!platform-session-only",
    })
    .onConflictDoNothing();
  const [actor] = await db
    .select()
    .from(adminsTable)
    .where(and(eq(adminsTable.tenantId, tenantId), eq(adminsTable.username, username)));
  if (!actor) throw new Error("Could not resolve development platform admin actor");
  return actor;
}
