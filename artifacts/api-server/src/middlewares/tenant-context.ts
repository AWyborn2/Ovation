import type { Request, RequestHandler, NextFunction, Response } from "express";
import { db, tenantsTable } from "@workspace/db";

/**
 * Per-request tenant resolution for the white-label platform.
 *
 * Resolution order (first hit wins):
 *   1. Subdomain / custom domain → tenants.slug / tenants.custom_domain
 *      (the production-canonical signal, e.g. `mandurah.ovation.app` → Mandurah,
 *      or a tenant's own custom domain). Wins over the header so a client on a
 *      real tenant host cannot impersonate another tenant via a header.
 *   2. `x-tenant-id` request header (dev/testing override; only effective when no
 *      tenant host matches — i.e. localhost/preview).
 *   3. `DEFAULT_TENANT_ID` env var (per-deployment default).
 *   4. {@link DEFAULT_TENANT_ID} (1 — Halls Head, the demo tenant).
 */

/** The platform's default tenant when nothing else resolves: Halls Head (#1). */
export const DEFAULT_TENANT_ID = 1;

export type RequestWithTenant = Request & {
  tenantId?: number;
  /** True when the request hit the marketing/platform surface (apex/www), not a tenant. */
  platform?: boolean;
};

/**
 * The apex/marketing hosts that serve the platform landing page rather than any
 * tenant's club app. Configured via `PLATFORM_HOSTS` (comma-separated, e.g.
 * `ovation.app,www.ovation.app`). When a request host matches one of these AND no
 * tenant host matches, the request is "platform mode" — distinct from the
 * Halls-Head fallback used for localhost/previews.
 */
function platformHosts(): Set<string> {
  return new Set(
    (process.env.PLATFORM_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

export type HostMode =
  | { mode: "tenant"; tenantId: number }
  | { mode: "platform" }
  | { mode: "fallback" };

/** Parse a positive-integer tenant id, or undefined if absent/invalid. */
function parseTenantId(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** Resolve the tenant id from the header → env → default (the non-host signals). */
export function resolveTenantId(req: Request): number {
  const headerValue = req.header("x-tenant-id");
  return (
    parseTenantId(headerValue) ??
    parseTenantId(process.env.DEFAULT_TENANT_ID) ??
    DEFAULT_TENANT_ID
  );
}

// --- Subdomain / custom-domain → tenant -------------------------------------

const DIRECTORY_TTL_MS = 5 * 60 * 1000;
let directoryCache:
  | { at: number; bySlug: Map<string, number>; byDomain: Map<string, number> }
  | null = null;

/** Tenant host directory (slug + custom domain → id), cached briefly. */
async function tenantDirectory() {
  if (directoryCache && Date.now() - directoryCache.at < DIRECTORY_TTL_MS) {
    return directoryCache;
  }
  const rows = await db
    .select({
      id: tenantsTable.id,
      slug: tenantsTable.slug,
      customDomain: tenantsTable.customDomain,
    })
    .from(tenantsTable);
  const bySlug = new Map<string, number>();
  const byDomain = new Map<string, number>();
  for (const r of rows) {
    bySlug.set(r.slug.toLowerCase(), r.id);
    if (r.customDomain) byDomain.set(r.customDomain.toLowerCase(), r.id);
  }
  directoryCache = { at: Date.now(), bySlug, byDomain };
  return directoryCache;
}

/**
 * The request host without port, lowercased. Prefers the left-most
 * `X-Forwarded-Host` (the original public host) over `Host`: behind a reverse
 * proxy like Replit Autoscale / Cloud Run the inbound `Host` is an internal
 * value and the real apex/tenant host arrives in `X-Forwarded-Host`. `trust
 * proxy` is enabled and Replit's edge sets this header, so it's safe to trust.
 */
export function hostOf(req: Request): string {
  const xfh = req.headers["x-forwarded-host"];
  const forwarded = (Array.isArray(xfh) ? xfh[0] : xfh ?? "").split(",")[0]?.trim();
  const raw = forwarded || req.headers.host || "";
  return raw.split(":")[0]?.toLowerCase().trim() ?? "";
}

/**
 * Resolve a tenant from the request host: an exact custom-domain match, else the
 * first subdomain label matched against `tenants.slug`. Returns null when no
 * tenant host matches (apex domain, www, localhost, previews, …).
 */
export async function resolveTenantBySubdomain(req: Request): Promise<number | null> {
  const host = hostOf(req);
  if (!host) return null;
  const dir = await tenantDirectory();
  const domainHit = dir.byDomain.get(host);
  if (domainHit !== undefined) return domainHit;
  const label = host.split(".")[0] ?? "";
  const slugHit = dir.bySlug.get(label);
  return slugHit !== undefined ? slugHit : null;
}

/**
 * True for Replit preview hosts (`*.replit.dev`). On the single shared preview
 * URL there are no real subdomains, so the only way a tester can choose which
 * tenant to view is the `x-tenant-id` header. The preview host is also a
 * platform host, so without this carve-out the platform branch would win and the
 * header would be ignored. This matches ONLY `.replit.dev`, never a real tenant
 * subdomain or the production apex, so it cannot be used to impersonate a tenant
 * in production.
 */
function isPreviewHost(host: string): boolean {
  return host.endsWith(".replit.dev");
}

/**
 * Classify a request host: a matching tenant host (subdomain / custom domain)
 * wins; then a dev `x-tenant-id` override on a Replit preview host; otherwise an
 * apex/marketing host in `PLATFORM_HOSTS` is `platform`; anything else
 * (localhost, previews without an override, unknown) is `fallback` — handled by
 * the header → env → default chain so dev still lands on the demo tenant.
 */
export async function resolveHostMode(req: Request): Promise<HostMode> {
  const bySubdomain = await resolveTenantBySubdomain(req);
  if (bySubdomain !== null) return { mode: "tenant", tenantId: bySubdomain };

  // Dev-only: on the shared Replit preview URL, an explicit tenant header pins
  // which tenant to render (the dev tenant switcher). Preview hosts are also
  // platform hosts, so this must come before the platform check. Inert in
  // production: real hosts never end with `.replit.dev`.
  const headerTenant = parseTenantId(req.header("x-tenant-id"));
  if (headerTenant !== undefined && isPreviewHost(hostOf(req))) {
    return { mode: "tenant", tenantId: headerTenant };
  }

  if (platformHosts().has(hostOf(req))) return { mode: "platform" };
  return { mode: "fallback" };
}

/**
 * Express middleware: attach the resolved tenant id (and platform flag) to the
 * request. A matching tenant host wins; an apex/marketing host is flagged
 * `platform` (and still gets the default tenant id so tenant-scoped reads never
 * see undefined); otherwise header → env → default. A DB lookup failure degrades
 * gracefully to the non-host resolution rather than failing the request.
 */
export const tenantContext: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  resolveHostMode(req)
    .then((hm) => {
      const r = req as RequestWithTenant;
      if (hm.mode === "tenant") {
        r.tenantId = hm.tenantId;
      } else {
        r.platform = hm.mode === "platform";
        r.tenantId = resolveTenantId(req);
      }
      next();
    })
    .catch((err) => {
      req.log?.warn?.({ err }, "tenant host resolution failed; using fallback");
      (req as RequestWithTenant).tenantId = resolveTenantId(req);
      next();
    });
};

/** Whether the current request hit the platform/marketing surface (apex/www). */
export function isPlatformRequest(req: Request): boolean {
  return (req as RequestWithTenant).platform === true;
}

/**
 * Read the tenant id for the current request. Returns the value attached by
 * {@link tenantContext}; if the middleware hasn't run (e.g. a unit test), it
 * falls back to the non-host resolution so callers always get a valid id.
 */
export function getTenantId(req: Request): number {
  return (req as RequestWithTenant).tenantId ?? resolveTenantId(req);
}
