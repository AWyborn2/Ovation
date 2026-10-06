import type { Request, RequestHandler, Response, NextFunction } from "express";
import { resolveAdmin } from "./require-admin";
import { getCaptainGrades, resolveCaptain } from "./require-captain";

/**
 * Who is acting in the Selection Hub (plan 2026-10-06-002 KTD9): a club admin,
 * or a captain with the grades they captain. Both resolve only on their own
 * tenant's host (`resolveAdmin` / `resolveCaptain`), so a session minted for
 * another club is rejected here.
 */
export type SelectionActor =
  | { kind: "admin"; id: number; name: string }
  | { kind: "captain"; id: number; name: string; grades: string[] };

export type RequestWithSelectionActor = Request & { selectionActor?: SelectionActor };

/** The request's Selection Hub actor; only valid after `requireAdminOrCaptain`. */
export function selectionActorOf(req: Request): SelectionActor {
  const actor = (req as RequestWithSelectionActor).selectionActor;
  if (!actor) throw new Error("selectionActorOf called without requireAdminOrCaptain");
  return actor;
}

/**
 * Admin first (an admin who also holds a captain session acts as admin), then
 * captain; 401 when neither resolves for this tenant.
 */
export const requireAdminOrCaptain: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  (async () => {
    const admin = await resolveAdmin(req);
    if (admin) {
      (req as RequestWithSelectionActor).selectionActor = {
        kind: "admin",
        id: admin.id,
        name: admin.displayName,
      };
      next();
      return;
    }
    const captain = await resolveCaptain(req);
    if (captain) {
      (req as RequestWithSelectionActor).selectionActor = {
        kind: "captain",
        id: captain.id,
        name: captain.displayName,
        grades: await getCaptainGrades(captain.id),
      };
      next();
      return;
    }
    res.status(401).json({ error: "Not authenticated" });
  })().catch((err) => {
    req.log?.error({ err }, "requireAdminOrCaptain failed");
    res.status(500).json({ error: "Auth check failed" });
  });
};
