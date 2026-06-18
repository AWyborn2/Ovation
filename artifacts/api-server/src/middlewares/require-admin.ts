import type { Request, RequestHandler, Response, NextFunction } from "express";
import type { AdminRow } from "@workspace/db";
import {
  SESSION_COOKIE,
  decodeSession,
  getAdminById,
} from "../lib/auth";
import { getTenantId } from "./tenant-context";

export type RequestWithAdmin = Request & { admin?: AdminRow };

/**
 * Resolve the signed-in admin for THIS request — and only if they belong to the
 * request's tenant. A session minted on one tenant's host can't authorise actions
 * on another's (defence-in-depth atop host-only session cookies). Returns null on
 * a missing/invalid session or a cross-tenant mismatch.
 */
export async function resolveAdmin(req: Request): Promise<AdminRow | null> {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const token = cookies?.[SESSION_COOKIE];
  const payload = decodeSession(token);
  if (!payload) return null;
  const admin = await getAdminById(payload.adminId);
  if (!admin || admin.tenantId !== getTenantId(req)) return null;
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
      next();
    })
    .catch((err) => {
      req.log?.error({ err }, "requireAdmin failed");
      res.status(500).json({ error: "Auth check failed" });
    });
};
