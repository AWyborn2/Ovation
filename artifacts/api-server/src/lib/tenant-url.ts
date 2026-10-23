import type { Request } from "express";
import type { TenantRow } from "@workspace/db";
import { env } from "../config";

/**
 * The apex domain from configuration alone (`PLATFORM_BASE_DOMAIN`, else the
 * first `PLATFORM_HOSTS` entry minus `www.`), or null when neither is set. For
 * links built with no request to read a host from (background emails).
 */
export function configuredBaseDomain(): string | null {
  const explicit = env.PLATFORM_BASE_DOMAIN()?.trim().toLowerCase();
  if (explicit) return explicit;
  const fromHosts = (env.PLATFORM_HOSTS() ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .map((h) => h.replace(/^www\./, ""))[0];
  return fromHosts || null;
}

/**
 * The platform's registrable apex domain, used to build tenant subdomain URLs
 * (e.g. `mandurah.ovation.app`). Prefers the explicit `PLATFORM_BASE_DOMAIN`, then
 * the first `PLATFORM_HOSTS` entry (minus a leading `www.`), then falls back to
 * dropping the left-most label of the request host.
 */
export function platformBaseDomain(req: Request): string {
  const configured = configuredBaseDomain();
  if (configured) return configured;
  const host = (req.headers.host ?? "").split(":")[0]?.toLowerCase() ?? "";
  const parts = host.split(".");
  return parts.length > 2 ? parts.slice(1).join(".") : host;
}

/** The canonical public host for a tenant: its custom domain, else `slug.<apex>`. */
export function tenantHost(req: Request, tenant: Pick<TenantRow, "slug" | "customDomain">): string {
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
