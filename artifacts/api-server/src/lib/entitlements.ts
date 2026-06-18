/**
 * Plan entitlements — the single map from a tenant's plan to the features it may
 * use. Built now but DORMANT: until BILLING_ENABLED=true (the pilot default is
 * off), every plan resolves to the full feature set, so all pilot tenants are
 * fully featured for free. Flipping the flag enforces the tiers with no code
 * change. Per governance, monetisation stays off until data licensing lands.
 */

export type Plan = "free" | "club" | "pro";

export type Feature =
  | "customDomain" // serve the club on its own domain
  | "mobileApp" // the Expo mobile app
  | "socialStudio" // social-card / video studio
  | "clubroomTv" // rotating clubroom-TV kiosk
  | "curation"; // honour boards, premierships, awards, ToD, committee, life members, caps

export type Entitlements = Record<Feature, boolean>;

const ALL_ON: Entitlements = {
  customDomain: true,
  mobileApp: true,
  socialStudio: true,
  clubroomTv: true,
  curation: true,
};

const ALL_OFF: Entitlements = {
  customDomain: false,
  mobileApp: false,
  socialStudio: false,
  clubroomTv: false,
  curation: false,
};

/**
 * Recommended tier split:
 *  - free: the hook — full branded stats site (handled elsewhere, not gated here).
 *  - club: the curation moat + social/video studio.
 *  - pro:  everything (custom domain, mobile app, clubroom TV).
 */
const PLAN_FEATURES: Record<Plan, Entitlements> = {
  free: { ...ALL_OFF },
  club: { ...ALL_OFF, curation: true, socialStudio: true },
  pro: { ...ALL_ON },
};

/** Whether tier enforcement is live. Off (the pilot default) ⇒ everything unlocked. */
export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === "true";
}

/** Normalise a stored plan string (incl. legacy "pilot") to a known plan. */
export function planFromString(s: string | null | undefined): Plan {
  if (s === "club" || s === "pro") return s;
  return "free"; // free | pilot | unknown
}

/** The feature set for a plan. Dormant pilot ⇒ all features on regardless of plan. */
export function entitlementsFor(plan: Plan): Entitlements {
  if (!billingEnabled()) return { ...ALL_ON };
  return { ...PLAN_FEATURES[plan] };
}

/** Does this plan include `feature` (honouring the dormant kill-switch)? */
export function hasEntitlement(plan: Plan, feature: Feature): boolean {
  return entitlementsFor(plan)[feature];
}
