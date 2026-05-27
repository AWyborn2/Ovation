import type { Request, RequestHandler, Response, NextFunction } from "express";

function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  return match ? match[1].trim() : null;
}

export const requireAdmin = ((req: Request, res: Response, next: NextFunction) => {
  const expected = process.env["ADMIN_PASSWORD"];
  if (!expected) {
    req.log?.error("ADMIN_PASSWORD is not configured; rejecting admin request");
    res.status(503).json({ error: "Admin password is not configured on the server." });
    return;
  }

  const headerToken =
    extractToken(req.header("authorization")) ?? req.header("x-admin-password") ?? null;

  if (!headerToken || headerToken !== expected) {
    res.status(401).json({ error: "Invalid admin password" });
    return;
  }

  next();
}) satisfies RequestHandler;
