/** Social Media Studio tabs (plan 2026-10-23 studio home): Home first, Settings last. */
import { describe, expect, it } from "vitest";
import { ADMIN_NAV, activeTab, adminBreadcrumb, groupTabs, visibleNav } from "./admin-nav";

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

describe("New Studio (preview) menu", () => {
  const all = { socialStudio: true, juniors: true };

  it("is today's menu while the switch is off", () => {
    const off = visibleNav(all).find((g) => g.key === "social")!;
    expect(off.tabs.map((t) => t.label)).toEqual(social.tabs.map((t) => t.label));
  });

  it("runs Home, Create, Queue, Your designs, Templates, Photos, Settings when on", () => {
    const on = visibleNav(all, { newStudio: true }).find((g) => g.key === "social")!;
    expect(on.tabs.map((t) => t.label)).toEqual([
      "Home",
      "Create",
      "Queue",
      "Your designs",
      "Templates",
      "Photos",
      "Settings",
    ]);
  });

  it("keeps the moved pages routable, and lights their own tab in the breadcrumb", () => {
    const tabs = groupTabs(social, { newStudio: true });
    for (const path of ["/admin/social/plan", "/admin/social/cards", "/admin/social/juniors"]) {
      expect(activeTab(path, { ...social, tabs })?.path).toBe(path);
    }
    expect(adminBreadcrumb("/admin/social/designs", { newStudio: true })).toEqual([
      "Admin",
      "Social Media Studio",
      "Your designs",
    ]);
  });

  it("redirects the old library and set-list URLs, but not an old set being opened", () => {
    const byValue = (v: string) =>
      groupTabs(social, { newStudio: true }).find((t) => t.value === v)!;
    expect(byValue("library").redirect).toBe("/admin/social/photos");
    expect(byValue("junior-library").redirect).toBe("/admin/social/photos?tab=junior");
    expect(byValue("sets")).toMatchObject({
      redirect: "/admin/social/designs?type=set",
      redirectUnless: "open",
    });
  });
});
