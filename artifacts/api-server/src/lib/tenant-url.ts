import type { Request } from "express";
import type { TenantRow } from "@workspace/db";

/**
 * The platform's registrable apex domain, used to build tenant subdomain URLs
 * (e.g. `mandurah.ovation.app`). Prefers the explicit `PLATFORM_BASE_DOMAIN`, then
 * the first `PLATFORM_HOSTS` entry (minus a leading `www.`), then falls back to
 * dropping the left-most label of the request host.
 */
export function platformBaseDomain(req: Request): string {
  const explicit = process.env.PLATFORM_BASE_DOMAIN?.trim().toLowerCase();
  if (explicit) return explicit;
  const fromHosts = (process.env.PLATFORM_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .map((h) => h.replace(/^www\./, ""))[0];
  if (fromHosts) return fromHosts;
  const host = (req.headers.host ?? "").split(":")[0]?.toLowerCase() ?? "";
  const parts = host.split(".");
  return parts.length > 2 ? parts.slice(1).join(".") : host;
}

/** The canonical public host for a tenant: its custom domain, else `slug.<apex>`. */
export function tenantHost(
  req: Request,
  tenant: Pick<TenantRow, "slug" | "customDomain">,
): string {
  const custom = tenant.customDomain?.trim().toLowerCase();
  if (custom) return custom;
  return `${tenant.slug}.${platformBaseDomain(req)}`;
}

/**
 * Build an absolute `https://` URL on a tenant's own host for the given path. Used
 * to construct links (e.g. password-reset) that must land on the club's app, not
 * the apex/console host the platform admin is calling from.
 */
export function tenantUrl(
  req: Request,
  tenant: Pick<TenantRow, "slug" | "customDomain">,
  path: string,
): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `https://${tenantHost(req, tenant)}${p}`;
}
