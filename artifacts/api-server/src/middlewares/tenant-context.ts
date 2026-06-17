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

export type RequestWithTenant = Request & { tenantId?: number };

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

/** The request host without port, lowercased. */
function hostOf(req: Request): string {
  const raw = req.headers.host ?? "";
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
 * Express middleware: attach the resolved tenant id to the request. Subdomain /
 * custom-domain wins; otherwise header → env → default. A DB lookup failure
 * degrades gracefully to the non-host resolution rather than failing the request.
 */
export const tenantContext: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  resolveTenantBySubdomain(req)
    .then((bySubdomain) => {
      (req as RequestWithTenant).tenantId = bySubdomain ?? resolveTenantId(req);
      next();
    })
    .catch((err) => {
      req.log?.warn?.({ err }, "tenant subdomain resolution failed; using fallback");
      (req as RequestWithTenant).tenantId = resolveTenantId(req);
      next();
    });
};

/**
 * Read the tenant id for the current request. Returns the value attached by
 * {@link tenantContext}; if the middleware hasn't run (e.g. a unit test), it
 * falls back to the non-host resolution so callers always get a valid id.
 */
export function getTenantId(req: Request): number {
  return (req as RequestWithTenant).tenantId ?? resolveTenantId(req);
}
