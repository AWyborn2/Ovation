import { describe, it, expect } from "vitest";
import {
  NAV_SURFACES,
  isExternalNavTarget,
  resolveNavItems,
  toResolvedNavItem,
  type NavItemLike,
  type ResolvedNavItem,
} from "./nav";

const fallback: ResolvedNavItem[] = [
  { label: "Home", target: "/", isExternal: false, iconKey: "home", description: "" },
];

const row = (over: Partial<NavItemLike> & { label: string }): NavItemLike => ({
  target: `/${over.label.toLowerCase()}`,
  isExternal: false,
  iconKey: "",
  description: "",
  ...over,
});

describe("resolveNavItems", () => {
  it("returns the fallback when the API has nothing", () => {
    expect(resolveNavItems("senior_menu", undefined, fallback)).toBe(fallback);
    expect(resolveNavItems("senior_menu", null, fallback)).toBe(fallback);
    expect(resolveNavItems("senior_menu", [], fallback)).toBe(fallback);
  });

  it("projects rows down to the rendered fields, keeping API order for ties", () => {
    const items = [row({ label: "Stats", sortOrder: 0 }), row({ label: "Honours", sortOrder: 0 })];
    expect(resolveNavItems("senior_menu", items, fallback)).toEqual([
      { label: "Stats", target: "/stats", isExternal: false, iconKey: "", description: "" },
      { label: "Honours", target: "/honours", isExternal: false, iconKey: "", description: "" },
    ]);
  });

  it("orders by sortOrder when present", () => {
    const items = [
      row({ label: "C", sortOrder: 2 }),
      row({ label: "A", sortOrder: 0 }),
      row({ label: "B", sortOrder: 1 }),
    ];
    expect(resolveNavItems("senior_menu", items, fallback).map((i) => i.label)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("drops hidden rows and rows for another surface", () => {
    const items = [
      row({ label: "Shown", surface: "senior_menu", visible: true }),
      row({ label: "Hidden", surface: "senior_menu", visible: false }),
      row({ label: "Juniors", surface: "junior_menu", visible: true }),
    ];
    expect(resolveNavItems("senior_menu", items, fallback).map((i) => i.label)).toEqual(["Shown"]);
  });

  it("falls back when filtering leaves nothing", () => {
    const items = [row({ label: "Hidden", visible: false })];
    expect(resolveNavItems("senior_menu", items, fallback)).toBe(fallback);
  });

  it("does not require surface / visible / sortOrder on rows", () => {
    expect(resolveNavItems("admin_tiles", [row({ label: "Only" })], fallback)).toHaveLength(1);
  });
});

describe("toResolvedNavItem", () => {
  it("strips API-only fields", () => {
    const out = toResolvedNavItem(
      row({ label: "X", surface: "senior_menu", sortOrder: 3, visible: true }),
    );
    expect(Object.keys(out).sort()).toEqual([
      "description",
      "iconKey",
      "isExternal",
      "label",
      "target",
    ]);
  });
});

describe("isExternalNavTarget", () => {
  it("honours the admin flag and detects absolute URLs", () => {
    expect(isExternalNavTarget({ target: "/stats", isExternal: false })).toBe(false);
    expect(isExternalNavTarget({ target: "/stats", isExternal: true })).toBe(true);
    expect(isExternalNavTarget({ target: "https://playhq.com/x", isExternal: false })).toBe(true);
  });
});

describe("NAV_SURFACES", () => {
  it("lists every admin-configurable surface once", () => {
    expect([...NAV_SURFACES].sort()).toEqual([
      "admin_tiles",
      "junior_menu",
      "junior_quick_links",
      "senior_menu",
    ]);
  });
});
