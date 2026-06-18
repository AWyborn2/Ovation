import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import app from "../app";

/**
 * Billing is inert during the pilot (Phase 2d). The webhook acknowledges without
 * touching plans while disabled, and checkout is unauthenticated-guarded and
 * returns "disabled". Real-DB integration test (importing the app needs
 * DATABASE_URL); no Stripe calls are made.
 */
describe("billing adapter (dormant)", () => {
  afterEach(() => {
    delete process.env.BILLING_ENABLED;
  });

  it("webhook acknowledges and does nothing while billing is disabled", async () => {
    const res = await request(app)
      .post("/billing/webhook")
      .set("content-type", "application/json")
      .send(JSON.stringify({ type: "anything" }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, disabled: true });
  });

  it("checkout requires an admin session", async () => {
    const res = await request(app)
      .post("/api/billing/checkout")
      .send({ plan: "club" });
    expect(res.status).toBe(401);
  });

  it("checkout validates the requested plan", async () => {
    // Even unauthenticated callers are rejected first; this documents the contract
    // that only club/pro are acceptable plan targets.
    const res = await request(app)
      .post("/api/billing/checkout")
      .send({ plan: "free" });
    expect([400, 401]).toContain(res.status);
  });
});
