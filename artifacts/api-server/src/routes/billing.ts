import { Router, type IRouter, type RequestHandler } from "express";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { CreateBillingCheckoutBody } from "@workspace/api-zod";
import {
  getBillingProvider,
  applyBillingEvent,
  billingEnabled,
  BillingNotConfiguredError,
  type BillingProvider,
} from "../lib/billing";

/**
 * Billing routes — INERT during the pilot. Checkout returns "disabled" until a
 * real provider is wired behind BILLING_ENABLED; the webhook is not exposed at
 * all (404) while disabled. These live outside the OpenAPI client surface for
 * now (like the health/go-redirect routes); checkout graduates into the spec
 * when the upgrade UI is built.
 *
 * Fail-safe: if BILLING_ENABLED=true but no real provider is configured,
 * `getBillingProvider()` throws and both routes answer 503 — never a silent
 * stub that looks like a working billing system.
 */

const router: IRouter = Router();

/** The configured provider, or null (after a 503 has been written). */
function providerOr503(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
): BillingProvider | null {
  try {
    return getBillingProvider();
  } catch (err) {
    if (err instanceof BillingNotConfiguredError) {
      req.log?.error?.({ err }, "billing enabled without a configured provider");
      res.status(503).json({ error: "Billing is not configured" });
      return null;
    }
    throw err;
  }
}

// Start an upgrade checkout for the current tenant. Disabled (no-op) until billing
// is enabled and a provider is configured.
router.post("/billing/checkout", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateBillingCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "plan must be 'club' or 'pro'" });
    return;
  }
  const body = parsed.data;
  const provider = providerOr503(req, res);
  if (!provider) return;
  const result = await provider.createCheckoutSession({
    tenantId: getTenantId(req),
    plan: body.plan,
    successUrl: body.successUrl ?? "/admin",
    cancelUrl: body.cancelUrl ?? "/admin",
  });
  res.json(result);
});

/**
 * Stripe (or other provider) webhook. Mounted in app.ts with a RAW body parser
 * BEFORE express.json so signatures can be verified. While billing is disabled
 * it does not exist (404) — an unauthenticated POST must not be acknowledged
 * with a 200 by a dormant endpoint. Once enabled it verifies and applies plan
 * changes.
 */
export const billingWebhookHandler: RequestHandler = (req, res): void => {
  if (!billingEnabled()) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const provider = providerOr503(req, res);
  if (!provider) return;
  const rawBody = req.body as Buffer;
  const event = provider.parseWebhook(rawBody, req.header("stripe-signature"));
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
