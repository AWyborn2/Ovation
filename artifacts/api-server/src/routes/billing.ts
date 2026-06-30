import { Router, type IRouter, type RequestHandler } from "express";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import {
  getBillingProvider,
  applyBillingEvent,
  billingEnabled,
} from "../lib/billing";

/**
 * Billing routes — INERT during the pilot. Checkout returns "disabled" until a
 * real provider is wired behind BILLING_ENABLED; the webhook acknowledges and does
 * nothing while disabled. These live outside the OpenAPI client surface for now
 * (like the health/go-redirect routes); checkout graduates into the spec when the
 * upgrade UI is built.
 */

const router: IRouter = Router();

// Start an upgrade checkout for the current tenant. Disabled (no-op) until billing
// is enabled and a provider is configured.
router.post("/billing/checkout", requireAdmin, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as {
    plan?: string;
    successUrl?: string;
    cancelUrl?: string;
  };
  if (body.plan !== "club" && body.plan !== "pro") {
    res.status(400).json({ error: "plan must be 'club' or 'pro'" });
    return;
  }
  const result = await getBillingProvider().createCheckoutSession({
    tenantId: getTenantId(req),
    plan: body.plan,
    successUrl: body.successUrl ?? "/admin",
    cancelUrl: body.cancelUrl ?? "/admin",
  });
  res.json(result);
});

/**
 * Stripe (or other provider) webhook. Mounted in app.ts with a RAW body parser
 * BEFORE express.json so signatures can be verified. While billing is disabled it
 * just acknowledges; once enabled it verifies and applies plan changes.
 */
export const billingWebhookHandler: RequestHandler = (req, res): void => {
  if (!billingEnabled()) {
    res.status(200).json({ received: true, disabled: true });
    return;
  }
  const rawBody = req.body as Buffer;
  const event = getBillingProvider().parseWebhook(
    rawBody,
    req.header("stripe-signature"),
  );
  if (!event) {
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }
  applyBillingEvent(event)
    .then(() => res.json({ received: true }))
    .catch((err) => {
      req.log?.error?.({ err }, "billing webhook apply failed");
      res.status(500).json({ error: "Webhook handling failed" });
    });
};

export default router;
