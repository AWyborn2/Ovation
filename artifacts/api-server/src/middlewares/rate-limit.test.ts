import { describe, it, expect } from "vitest";
import type { Request } from "express";
import { adminWriteRateLimitKey } from "./rate-limit";

/**
 * Pure unit test — deliberately imports only the middleware module, which has
 * no runtime dependency on the database (its `RequestWithAdmin` import is
 * type-only). So unlike the route suites, this runs without DATABASE_URL.
 *
 * What it guards: the admin-write limiter is keyed on the admin id so one
 * compromised session is throttled without punishing a whole club behind a
 * single office NAT. If the limiter were ever mounted before `requireAdmin`,
 * `req.admin` would be undefined and every request would silently fall back to
 * the IP key — no error, no failing route test, just spurious 429s for real
 * admins sharing an address.
 */

const asReq = (over: Partial<Request> & Record<string, unknown>): Request =>
  over as unknown as Request;

describe("adminWriteRateLimitKey", () => {
  it("keys on the admin id when requireAdmin has attached one", () => {
    const key = adminWriteRateLimitKey(
      asReq({ admin: { id: 42, tenantId: 1 }, ip: "203.0.113.7" }),
    );
    expect(key).toBe("admin:42");
  });

  it("gives two admins on the same IP separate buckets", () => {
    const ip = "203.0.113.7";
    const a = adminWriteRateLimitKey(asReq({ admin: { id: 1 }, ip }));
    const b = adminWriteRateLimitKey(asReq({ admin: { id: 2 }, ip }));
    expect(a).not.toBe(b);
  });

  it("gives one admin the same bucket across changing IPs", () => {
    const a = adminWriteRateLimitKey(asReq({ admin: { id: 7 }, ip: "203.0.113.7" }));
    const b = adminWriteRateLimitKey(asReq({ admin: { id: 7 }, ip: "198.51.100.4" }));
    expect(a).toBe(b);
  });

  it("falls back to an IP-derived key when no admin is attached", () => {
    const key = adminWriteRateLimitKey(asReq({ ip: "203.0.113.7" }));
    expect(key).not.toBe("");
    expect(key).not.toMatch(/^admin:/);
  });

  it("does not throw when the IP is missing entirely", () => {
    expect(() => adminWriteRateLimitKey(asReq({}))).not.toThrow();
  });

  it("collapses IPv6 addresses in the same /56 to one key", () => {
    // ipKeyGenerator normalises IPv6 to its subnet so an attacker cannot mint
    // unlimited buckets by walking addresses inside their own allocation.
    const a = adminWriteRateLimitKey(asReq({ ip: "2001:db8:1234:5600::1" }));
    const b = adminWriteRateLimitKey(asReq({ ip: "2001:db8:1234:5600::2" }));
    expect(a).toBe(b);
  });
});
