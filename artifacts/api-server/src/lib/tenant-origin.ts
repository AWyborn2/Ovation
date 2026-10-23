import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { configuredBaseDomain } from "./tenant-url";

/**
 * The `https://` origin of a club's own app, for links in emails sent with no
 * request to read a host from (the hourly sweep, the outbox drain): its custom
 * domain, else `<slug>.<apex>` (PLATFORM_BASE_DOMAIN / PLATFORM_HOSTS). Null
 * when the club is unknown or no apex is configured, so callers fall back.
 */
export async function tenantOrigin(tenantId: number): Promise<string | null> {
  const [tenant] = await db
    .select({ slug: tenantsTable.slug, customDomain: tenantsTable.customDomain })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) return null;
  const custom = tenant.customDomain?.trim().toLowerCase();
  if (custom) return `https://${custom}`;
  const base = configuredBaseDomain();
  return base && tenant.slug ? `https://${tenant.slug}.${base}` : null;
}

/** A path made absolute on the club's own app, so it works as a link in an email. */
export async function clubLink(
  tenantId: number,
  path: string,
  fallbackOrigin: string | null = null,
): Promise<string> {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = (await tenantOrigin(tenantId)) ?? fallbackOrigin;
  return `${origin ?? ""}${path.startsWith("/") ? path : `/${path}`}`;
}
