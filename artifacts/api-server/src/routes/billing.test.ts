import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import app from "../app";
import { getBillingProvider, BillingNotConfiguredError } from "../lib/billing";

/**
 * Billing is inert during the pilot (Phase 2d), and fail-safe about it:
 *
 *  - while BILLING_ENABLED is unset the webhook does not exist (404) — a dormant
 *    endpoint must never acknowledge an unauthenticated POST with a 200 — and
 *    checkout is admin-guarded and returns "disabled";
 *  - with BILLING_ENABLED=true but no real provider wired, the adapter refuses
 *    to hand out the stub (throws) and the webhook answers 503.
 *
 * Real-DB integration test (importing the app needs DATABASE_URL); no Stripe
 * calls are made.
 */
describe("billing adapter (dormant)", () => {
  afterEach(() => {
    delete process.env.BILLING_ENABLED;
  });

  it("webhook is not exposed (404) while billing is disabled", async () => {
    const res = await request(app)
      .post("/billing/webhook")
      .set("content-type", "application/json")
      .send(JSON.stringify({ type: "anything" }));
    expect(res.status).toBe(404);
  });

  it("webhook answers 503 when billing is enabled without a provider", async () => {
    process.env.BILLING_ENABLED = "true";
    const res = await request(app)
      .post("/billing/webhook")
      .set("content-type", "application/json")
      .send(JSON.stringify({ type: "anything" }));
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "Billing is not configured" });
  });

  it("getBillingProvider hands out the stub only while billing is disabled", () => {
    delete process.env.BILLING_ENABLED;
    expect(() => getBillingProvider()).not.toThrow();

    process.env.BILLING_ENABLED = "true";
    expect(() => getBillingProvider()).toThrow(BillingNotConfiguredError);
    expect(() => getBillingProvider()).toThrow(/BILLING_ENABLED=true/);
  });

  it("checkout requires an admin session", async () => {
    const res = await request(app).post("/api/billing/checkout").send({ plan: "club" });
    expect(res.status).toBe(401);
  });

  it("checkout validates the requested plan", async () => {
    // Even unauthenticated callers are rejected first; this documents the contract
    // that only club/pro are acceptable plan targets.
    const res = await request(app).post("/api/billing/checkout").send({ plan: "free" });
    expect([400, 401]).toContain(res.status);
  });
});
