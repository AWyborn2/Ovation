import type { Request, RequestHandler, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, captainGradePermissionsTable, type CaptainRow } from "@workspace/db";
import {
  CAPTAIN_SESSION_COOKIE,
  decodeCaptainSession,
  getCaptainById,
} from "../lib/auth";

export type RequestWithCaptain = Request & {
  captain?: CaptainRow;
  captainGrades?: string[];
};

export async function resolveCaptain(req: Request): Promise<CaptainRow | null> {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  const token = cookies?.[CAPTAIN_SESSION_COOKIE];
  const payload = decodeCaptainSession(token);
  if (!payload) return null;
  return getCaptainById(payload.captainId);
}

export async function getCaptainGrades(captainId: number): Promise<string[]> {
  const rows = await db
    .select({ grade: captainGradePermissionsTable.grade })
    .from(captainGradePermissionsTable)
    .where(eq(captainGradePermissionsTable.captainId, captainId));
  return rows.map((r) => r.grade);
}

export const requireCaptain: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  resolveCaptain(req)
    .then(async (captain) => {
      if (!captain) {
        res.status(401).json({ error: "Not authenticated" });
        return;
      }
      const r = req as RequestWithCaptain;
      r.captain = captain;
      r.captainGrades = await getCaptainGrades(captain.id);
      next();
    })
    .catch((err) => {
      req.log?.error({ err }, "requireCaptain failed");
      res.status(500).json({ error: "Auth check failed" });
    });
};
