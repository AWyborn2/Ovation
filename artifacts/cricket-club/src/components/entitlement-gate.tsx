import type { ReactNode } from "react";
import { useEntitlement, type Feature } from "@/lib/entitlements";

/**
 * Render `children` only when the tenant's plan includes `feature`; otherwise
 * render `fallback` (default: nothing). Presentational only — the server enforces
 * the same gate. While billing is dormant every feature is on, so this is a
 * pass-through during the pilot.
 */
export function EntitlementGate({
  feature,
  children,
  fallback = null,
}: {
  feature: Feature;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useEntitlement(feature) ? <>{children}</> : <>{fallback}</>;
}
