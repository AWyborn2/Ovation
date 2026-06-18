import {
  useGetTenantPlan,
  getGetTenantPlanQueryKey,
  type Entitlements,
} from "@workspace/api-client-react";

/**
 * Plan entitlements for the web. Reads `GET /tenant-plan` (dormant ⇒ every feature
 * resolves to true, so adopting these gates now locks nothing during the pilot).
 * Use {@link useEntitlement} to hide/lock paid UI; the server enforces the same
 * gate via requireEntitlement, so the client check is presentational only.
 */

export type Feature = keyof Entitlements;

/** Default to all-on so UI never flashes "locked" before the plan resolves. */
const ALL_ON: Entitlements = {
  customDomain: true,
  mobileApp: true,
  socialStudio: true,
  clubroomTv: true,
  curation: true,
};

export function useEntitlements(): Entitlements {
  const q = useGetTenantPlan({ query: { queryKey: getGetTenantPlanQueryKey() } });
  return q.data?.entitlements ?? ALL_ON;
}

/** Whether the current tenant may use `feature`. */
export function useEntitlement(feature: Feature): boolean {
  return useEntitlements()[feature];
}
