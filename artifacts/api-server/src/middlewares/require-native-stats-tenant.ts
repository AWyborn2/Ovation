import type { Request, RequestHandler, Response, NextFunction } from "express";
import { getTenantId } from "./tenant-context";
import { assertNativeStatsWriteTenant } from "../lib/tenant";

/**
 * Fence for every route that writes the native stats tables (imports, the
 * native `players` register, player merges and the player photo gallery).
 *
 * Those tables carry no tenant_id and hold only tenant #1's (Halls Head's)
 * native history, so a signed-in admin of any other tenant must never write
 * them — and neither may tenant #1 once it reads central (its data changes go
 * through the club layer then). Refusals surface as the 409
 * `NativeStatsUnavailableError` via the app error handler.
 *
 * Mount AFTER `requireAdmin` (so an unauthenticated request is still a 401)
 * and BEFORE any upload/body parsing, so a refused request does no work.
 */
export const requireNativeStatsTenant: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  assertNativeStatsWriteTenant(getTenantId(req)).then(() => next(), next);
};
