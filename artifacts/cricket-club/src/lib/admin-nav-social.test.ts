/** Social Media Studio tabs (plan 2026-10-23 studio home): Home first, Settings last. */
import { describe, expect, it } from "vitest";
import { ADMIN_NAV, activeTab, adminBreadcrumb } from "./admin-nav";

const social = ADMIN_NAV.find((g) => g.key === "social")!;

describe("Social Media Studio tabs", () => {
  it("run Home, Templates, Create a card … Cards, Settings", () => {
    expect(social.tabs.map((t) => t.label)).toEqual([
      "Home",
      "Templates",
      "Create a card",
      "Carousel sets",
      "Posting Plan",
      "Queue",
      "Fixtures",
      "Junior cards",
      "Email lists",
      "Photo library",
      "Junior photo library",
      "Cards",
      "Settings",
    ]);
  });

  it("land on Home, and keep Home lit on Your designs", () => {
    expect(activeTab("/admin/social", social)?.label).toBe("Home");
    expect(activeTab("/admin/social/designs", social)?.label).toBe("Home");
    expect(activeTab("/admin/social/settings", social)?.label).toBe("Settings");
    expect(adminBreadcrumb("/admin/social/settings")).toEqual([
      "Admin",
      "Social Media Studio",
      "Settings",
    ]);
  });
});
