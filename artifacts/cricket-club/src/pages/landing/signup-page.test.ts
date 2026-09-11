import { describe, it, expect } from "vitest";
import { brandingNowUrl, signupErrorCopy } from "./signup-page";

describe("brandingNowUrl", () => {
  it("appends /admin/settings/branding in place of the trailing /admin", () => {
    expect(brandingNowUrl("https://mandurah.ovation.app/admin")).toBe(
      "https://mandurah.ovation.app/admin/settings/branding",
    );
  });

  it("handles a trailing slash after /admin", () => {
    expect(brandingNowUrl("https://mandurah.ovation.app/admin/")).toBe(
      "https://mandurah.ovation.app/admin/settings/branding",
    );
  });
});

describe("signupErrorCopy", () => {
  it("409 is the only status that says taken", () => {
    expect(signupErrorCopy({ status: 409 })).toMatch(/already taken/);
  });
  it("other 4xx surfaces the server reason", () => {
    expect(signupErrorCopy({ status: 400, data: { error: "That address is reserved." } })).toBe(
      "That address is reserved.",
    );
  });
  it("5xx and unknown errors say nothing was created, never taken", () => {
    for (const err of [{ status: 500 }, new Error("network"), undefined]) {
      const copy = signupErrorCopy(err);
      expect(copy).toMatch(/nothing was created/);
      expect(copy).not.toMatch(/taken/);
    }
  });
});
