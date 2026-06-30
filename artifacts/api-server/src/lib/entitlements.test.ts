import { describe, it, expect, afterEach } from "vitest";
import {
  entitlementsFor,
  hasEntitlement,
  planFromString,
  billingEnabled,
} from "./entitlements";

/** Plan → entitlements mapping + the dormant kill-switch. Pure, runs anywhere. */
describe("plan entitlements", () => {
  afterEach(() => {
    delete process.env.BILLING_ENABLED;
  });

  it("is dormant by default: every plan gets every feature", () => {
    expect(billingEnabled()).toBe(false);
    for (const plan of ["free", "club", "pro"] as const) {
      const e = entitlementsFor(plan);
      expect(Object.values(e).every(Boolean)).toBe(true);
    }
  });

  it("enforces the tier split when BILLING_ENABLED=true", () => {
    process.env.BILLING_ENABLED = "true";

    const free = entitlementsFor("free");
    expect(free.curation).toBe(false);
    expect(free.socialStudio).toBe(false);
    expect(free.customDomain).toBe(false);

    const club = entitlementsFor("club");
    expect(club.curation).toBe(true);
    expect(club.socialStudio).toBe(true);
    expect(club.customDomain).toBe(false); // still a pro feature

    const pro = entitlementsFor("pro");
    expect(Object.values(pro).every(Boolean)).toBe(true);
  });

  it("maps legacy/unknown plan strings to free", () => {
    expect(planFromString("pilot")).toBe("free");
    expect(planFromString(null)).toBe("free");
    expect(planFromString("club")).toBe("club");
    expect(planFromString("pro")).toBe("pro");
  });

  it("hasEntitlement honours the kill-switch", () => {
    expect(hasEntitlement("free", "curation")).toBe(true); // dormant
    process.env.BILLING_ENABLED = "true";
    expect(hasEntitlement("free", "curation")).toBe(false);
    expect(hasEntitlement("pro", "curation")).toBe(true);
  });
});
