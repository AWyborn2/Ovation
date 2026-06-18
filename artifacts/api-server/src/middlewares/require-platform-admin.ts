import type { Request, RequestHandler, Response, NextFunction } from "express";
import type { PlatformAdminRow } from "@workspace/db";
import {
  PLATFORM_SESSION_COOKIE,
  decodePlatformSession,
  getPlatformAdminById,
} from "../lib/auth";

export type RequestWithPlatformAdmin = Request & { platformAdmin?: PlatformAdminRow };

/**
 * Resolve the signed-in platform (super) admin for this request. The platform
 * session is a global, tenant-independent surface — a club-admin session can never
 * satisfy it — so this is the gate for the apex/concierge console. Returns null on
 * a missing/invalid platform session.
 */
export async function resolvePlatformAdmin(req: Request): Promise<PlatformAdminRow | null> {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const token = cookies?.[PLATFORM_SESSION_COOKIE];
  const payload = decodePlatformSession(token);
  if (!payload) return null;
  return (await getPlatformAdminById(payload.platformAdminId)) ?? null;
}

export const requirePlatformAdmin: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  resolvePlatformAdmin(req)
    .then((admin) => {
      if (!admin) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      (req as RequestWithPlatformAdmin).platformAdmin = admin;
      next();
    })
    .catch((err) => {
      req.log?.error({ err }, "requirePlatformAdmin failed");
      res.status(500).json({ error: "Auth check failed" });
    });
};
