import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";

/**
 * Input checks shared by the two tenant-provisioning surfaces — self-serve
 * signup (routes/platform.ts) and the super-admin console
 * (routes/platform-admin.ts) — so the two can never drift apart on what counts
 * as a usable admin email or a free slug.
 */

/** Basic email shape check (no verification in the pilot). */
export function isEmail(s: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
}

/** Whether a slug is already claimed in the tenants register. */
export async function slugTaken(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.slug, slug));
  return !!row;
}
