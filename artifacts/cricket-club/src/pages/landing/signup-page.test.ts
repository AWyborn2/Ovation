import { describe, it, expect } from "vitest";
import { brandingNowUrl } from "./signup-page";

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
