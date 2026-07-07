import { describe, it, expect } from "vitest";
import { DEFAULT_BRAND } from "@workspace/scorecard";
import { isUnbranded } from "./admin";

/**
 * Finish-setup banner visibility (U7 / KTD9). Computed from the RESOLVED
 * brand, not raw tenant-row nulls, so a tenant whose branding actually comes
 * from a linked clubs-register row is never treated as unbranded.
 */
describe("isUnbranded", () => {
  it("is true when the resolved brand exactly matches the neutral default", () => {
    expect(isUnbranded({ ...DEFAULT_BRAND, name: "Some Club" })).toBe(true);
  });

  it("is false once any brand field diverges from the neutral default", () => {
    expect(
      isUnbranded({ ...DEFAULT_BRAND, name: "Some Club", primaryColour: "#ff0000" }),
    ).toBe(false);
    expect(
      isUnbranded({ ...DEFAULT_BRAND, name: "Some Club", logoUrl: "/objects/logo.png" }),
    ).toBe(false);
  });

  it("is false on the platform marker response (no tenant)", () => {
    expect(isUnbranded({ platform: true })).toBe(false);
  });

  it("is false when the brand hasn't loaded yet", () => {
    expect(isUnbranded(undefined)).toBe(false);
  });
});
