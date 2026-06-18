import type { Request, RequestHandler, Response, NextFunction } from "express";
import { getRequestEntitlements } from "../lib/tenant";
import type { Feature } from "../lib/entitlements";

/**
 * Gate a route on a plan feature. While billing is dormant (BILLING_ENABLED unset)
 * entitlements resolve to all-on, so this is a pass-through during the pilot; once
 * enforcement is enabled it 402s tenants whose plan lacks the feature. Mount after
 * requireAdmin on paid admin routes.
 */
export function requireEntitlement(feature: Feature): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    getRequestEntitlements(req)
      .then(({ plan, entitlements }) => {
        if (entitlements[feature]) {
          next();
          return;
        }
        res.status(402).json({
          error: "Upgrade required",
          feature,
          plan,
        });
      })
      .catch((err) => {
        req.log?.error?.({ err }, "requireEntitlement failed");
        res.status(500).json({ error: "Entitlement check failed" });
      });
  };
}
