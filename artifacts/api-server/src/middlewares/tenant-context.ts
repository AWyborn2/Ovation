import type { Request, RequestHandler, NextFunction, Response } from "express";

/**
 * Per-request tenant resolution for the white-label platform.
 *
 * Resolution order (first hit wins):
 *   1. `x-tenant-id` request header (explicit override / API clients)
 *   2. `DEFAULT_TENANT_ID` env var (per-deployment default)
 *   3. {@link DEFAULT_TENANT_ID} (1 — Halls Head, the demo tenant)
 *
 * Subdomain → tenant resolution (e.g. `hallshead.ovation.app` → slug lookup) is
 * a later step; the TODO seam below marks where it slots in, ahead of the header.
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

/** Resolve the tenant id for a request from header → env → default. */
export function resolveTenantId(req: Request): number {
  // TODO(subdomain): resolve tenant from the request host/subdomain (slug →
  // tenants.id) here, taking precedence over the header, once custom domains
  // and subdomain routing land.
  const headerValue = req.header("x-tenant-id");
  return (
    parseTenantId(headerValue) ??
    parseTenantId(process.env.DEFAULT_TENANT_ID) ??
    DEFAULT_TENANT_ID
  );
}

/** Express middleware: attach the resolved tenant id to the request. */
export const tenantContext: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  (req as RequestWithTenant).tenantId = resolveTenantId(req);
  next();
};

/**
 * Read the tenant id for the current request. Returns the value attached by
 * {@link tenantContext}; if the middleware hasn't run (e.g. a unit test), it
 * resolves on demand so callers always get a valid tenant id.
 */
export function getTenantId(req: Request): number {
  return (req as RequestWithTenant).tenantId ?? resolveTenantId(req);
}
