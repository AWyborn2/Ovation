import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { billingEnabled, type Plan } from "./entitlements";

/**
 * Billing adapter boundary — built but INERT. No money moves during the pilot:
 * the only provider is a stub (checkout is disabled, webhooks are ignored) until
 * BILLING_ENABLED=true AND a real provider (Stripe SDK / Replit stripe-replit-sync)
 * is wired behind this same interface. Per governance, monetisation stays off until
 * data licensing lands. The webhook → setTenantPlan path is the one real effect,
 * and it only runs once enforcement is enabled.
 */

export interface CheckoutRequest {
  tenantId: number;
  plan: Exclude<Plan, "free">;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResult {
  /** A hosted checkout URL to redirect to, or null when billing is disabled. */
  url: string | null;
  disabled: boolean;
}

/** A normalised, provider-agnostic billing event the webhook applies. */
export type BillingEvent =
  | { type: "plan.changed"; tenantId: number; plan: Plan }
  | { type: "ignored" };

export interface BillingProvider {
  createCheckoutSession(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Verify + normalise a raw webhook payload, or null if invalid. */
  parseWebhook(rawBody: Buffer, signature: string | undefined): BillingEvent | null;
}

/** The inert provider used until a real one is wired behind BILLING_ENABLED. */
const stubProvider: BillingProvider = {
  async createCheckoutSession(): Promise<CheckoutResult> {
    return { url: null, disabled: true };
  },
  parseWebhook(): BillingEvent | null {
    return { type: "ignored" };
  },
};

/**
 * The active billing provider. Always the stub for now; when BILLING_ENABLED=true
 * and Stripe is configured, return a real provider here (the only change needed —
 * routes and the webhook already speak this interface).
 */
export function getBillingProvider(): BillingProvider {
  // if (billingEnabled() && process.env.STRIPE_SECRET_KEY) return stripeProvider;
  return stubProvider;
}

/** Persist a plan change from a (verified) billing event. */
export async function setTenantPlan(tenantId: number, plan: Plan): Promise<void> {
  await db.update(tenantsTable).set({ plan }).where(eq(tenantsTable.id, tenantId));
}

/** Apply a normalised billing event. No-op unless it's a real plan change. */
export async function applyBillingEvent(event: BillingEvent): Promise<void> {
  if (event.type === "plan.changed") {
    await setTenantPlan(event.tenantId, event.plan);
  }
}

/** Whether real billing is live (re-exported for route guards/readability). */
export { billingEnabled };
