import type { Request, RequestHandler, Response, NextFunction } from "express";
import type { AdminRow } from "@workspace/db";
import {
  SESSION_COOKIE,
  decodeSession,
  getAdminById,
} from "../lib/auth";

export type RequestWithAdmin = Request & { admin?: AdminRow };

export async function resolveAdmin(req: Request): Promise<AdminRow | null> {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const token = cookies?.[SESSION_COOKIE];
  const payload = decodeSession(token);
  if (!payload) return null;
  return getAdminById(payload.adminId);
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
