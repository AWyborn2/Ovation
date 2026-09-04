import type { Request, RequestHandler, Response, NextFunction } from "express";
import type { AdminRow } from "@workspace/db";
import {
  SESSION_COOKIE,
  decodeSession,
  getAdminById,
  sessionIsCurrent,
} from "../lib/auth";
import { getTenantId } from "./tenant-context";
import { touchTenantActivity } from "../lib/tenant-activity";
import { isTenantSuspended } from "../lib/tenant";

export type RequestWithAdmin = Request & { admin?: AdminRow };

/**
 * Resolve the signed-in admin for THIS request — and only if they belong to the
 * request's tenant AND that tenant isn't archived/suspended. A session minted on
 * one tenant's host can't authorise actions on another's (defence-in-depth atop
 * host-only session cookies); a suspended tenant's admin resolves to null here
 * without the session itself being touched — access resumes on restore with no
 * re-login required. Returns null on a missing/invalid session, a cross-tenant
 * mismatch, or a suspended tenant.
 */
export async function resolveAdmin(req: Request): Promise<AdminRow | null> {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const token = cookies?.[SESSION_COOKIE];
  const payload = decodeSession(token);
  if (!payload) return null;
  const admin = await getAdminById(payload.adminId);
  if (!admin || admin.tenantId !== getTenantId(req)) return null;
  if (!sessionIsCurrent(payload, admin)) return null;
  if (await isTenantSuspended(admin.tenantId)) return null;
  return admin;
}

export const requireAdmin: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  resolveAdmin(req)
    .then((admin) => {
      if (!admin) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      (req as RequestWithAdmin).admin = admin;
      // Best-effort, throttled tenant-health signal. Placed here (the
      // requireAdmin success path) rather than in the shared resolveAdmin helper
      // so it never fires on optional-admin read paths that also call resolveAdmin.
      touchTenantActivity(admin.tenantId);
      next();
    })
    .catch((err) => {
      req.log?.error({ err }, "requireAdmin failed");
      res.status(500).json({ error: "Auth check failed" });
    });
};
