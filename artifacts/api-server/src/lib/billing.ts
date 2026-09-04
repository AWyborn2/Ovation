import { eq } from "drizzle-orm";
import { db, tenantsTable } from "@workspace/db";
import { billingEnabled, type Plan } from "./entitlements";
import { env } from "../config";

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
 * Thrown when billing enforcement is switched on but nothing real sits behind
 * the adapter. Carries `status: 503` so the central error handler answers
 * "service unavailable" rather than a generic 500 if a route lets it escape.
 */
export class BillingNotConfiguredError extends Error {
  readonly status = 503;
  constructor(detail: string) {
    super(
      `BILLING_ENABLED=true but no billing provider is configured (${detail}). ` +
        "Wire a real provider behind getBillingProvider() in lib/billing.ts, or unset BILLING_ENABLED.",
    );
    this.name = "BillingNotConfiguredError";
  }
}

/**
 * The active billing provider. The stub while billing is dormant. Once
 * BILLING_ENABLED=true this must be a real provider; until one is wired it
 * THROWS rather than silently serving the stub — an "enabled" deployment that
 * acknowledged every webhook as ignored and never moved a plan would look
 * healthy while doing nothing.
 */
export function getBillingProvider(): BillingProvider {
  if (billingEnabled()) {
    // When a Stripe adapter lands, construct and return it here from
    // env.STRIPE_SECRET_KEY(); nothing else in the routes or webhook changes.
    throw new BillingNotConfiguredError(
      env.STRIPE_SECRET_KEY()
        ? "STRIPE_SECRET_KEY is set but no Stripe adapter is wired"
        : "STRIPE_SECRET_KEY is unset and no adapter is wired",
    );
  }
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
