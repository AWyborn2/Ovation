import { describe, it, expect, afterEach } from "vitest";
import {
  resolveThrottleMs,
  claimActivityWindow,
  DEFAULT_THROTTLE_MS,
  MIN_THROTTLE_MS,
} from "./tenant-activity";

describe("tenant-activity: resolveThrottleMs (defensive env parse)", () => {
  const original = process.env.TENANT_ACTIVITY_THROTTLE_MS;
  afterEach(() => {
    if (original === undefined) delete process.env.TENANT_ACTIVITY_THROTTLE_MS;
    else process.env.TENANT_ACTIVITY_THROTTLE_MS = original;
  });

  it("returns the default when the env var is unset", () => {
    expect(resolveThrottleMs(undefined)).toBe(DEFAULT_THROTTLE_MS);
  });

  it("uses a valid numeric value at or above the floor", () => {
    expect(resolveThrottleMs(String(MIN_THROTTLE_MS))).toBe(MIN_THROTTLE_MS);
    expect(resolveThrottleMs("600000")).toBe(600000);
  });

  it("falls back to the default for a below-floor value (would nearly disable throttling)", () => {
    expect(resolveThrottleMs("1000")).toBe(DEFAULT_THROTTLE_MS);
  });

  it("falls back to the default for zero, negative, and NaN/bogus values", () => {
    expect(resolveThrottleMs("0")).toBe(DEFAULT_THROTTLE_MS);
    expect(resolveThrottleMs("-5000")).toBe(DEFAULT_THROTTLE_MS);
    expect(resolveThrottleMs("not-a-number")).toBe(DEFAULT_THROTTLE_MS);
    expect(resolveThrottleMs("")).toBe(DEFAULT_THROTTLE_MS);
  });
});

describe("tenant-activity: claimActivityWindow (in-process throttle guard)", () => {
  // Each test uses a distinct tenant id so the module-level guard map does not
  // leak state between tests (mirrors per-process isolation; no reset needed).
  const THROTTLE = 15 * 60 * 1000;

  it("claims on the first call for a tenant (never active / after restart)", () => {
    expect(claimActivityWindow(1001, 0, THROTTLE)).toBe(true);
  });

  it("does not re-claim within the throttle window", () => {
    expect(claimActivityWindow(1002, 0, THROTTLE)).toBe(true);
    expect(claimActivityWindow(1002, THROTTLE - 1, THROTTLE)).toBe(false);
  });

  it("re-claims once the window has elapsed", () => {
    expect(claimActivityWindow(1003, 0, THROTTLE)).toBe(true);
    expect(claimActivityWindow(1003, THROTTLE, THROTTLE)).toBe(true);
  });

  it("claims once given several rapid calls in the same tick (concurrency guard)", () => {
    const results = [0, 0, 0, 0].map(() => claimActivityWindow(1004, 5, THROTTLE));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("tracks tenants independently", () => {
    expect(claimActivityWindow(1005, 0, THROTTLE)).toBe(true);
    expect(claimActivityWindow(1006, 0, THROTTLE)).toBe(true);
    expect(claimActivityWindow(1005, 1, THROTTLE)).toBe(false);
  });
});
