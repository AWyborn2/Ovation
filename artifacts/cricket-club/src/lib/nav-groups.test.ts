import { describe, it, expect } from "vitest";
import type { ResolvedNavItem } from "@/lib/use-nav";
import {
  groupNavItems,
  isGroupActive,
  isNavItemActive,
  sectionOf,
  describe as describeItem,
} from "./nav-groups";

const item = (target: string, label = target, isExternal = false): ResolvedNavItem => ({
  label,
  target,
  isExternal,
  iconKey: "",
  description: "",
});

describe("groupNavItems (Broadcast AE3)", () => {
  const senior = [
    item("/"),
    item("/players"),
    item("/matches"),
    item("/grades"),
    item("/records"),
    item("/compare"),
    item("/honour-boards"),
    item("/premierships"),
    item("/fixtures"),
    item("https://shop.example.com", "Shop", true),
    item("/sponsors", "Sponsors"),
  ];

  it("maps senior targets to Stats / History / Club with Home top-level", () => {
    const g = groupNavItems(senior, "seniors");
    expect(g.top.map((i) => i.target)).toEqual(["/"]);
    const by = Object.fromEntries(g.groups.map((x) => [x.key, x.items.map((i) => i.target)]));
    expect(by.stats).toEqual(["/players", "/matches", "/grades", "/records", "/compare"]);
    expect(by.history).toEqual(["/honour-boards", "/premierships"]);
    // Fixtures, an external link and an unknown internal page land in Club.
    expect(by.club).toEqual(["/fixtures", "https://shop.example.com", "/sponsors"]);
  });

  it("maps junior targets and keeps Overview top-level", () => {
    const g = groupNavItems(
      [
        item("/juniors"),
        item("/juniors/matches"),
        item("/juniors/players"),
        item("/juniors/premierships"),
        item("/juniors/office-bearers"),
      ],
      "juniors",
    );
    expect(g.top.map((i) => i.target)).toEqual(["/juniors"]);
    expect(g.groups.map((x) => x.key)).toEqual(["stats", "history"]);
    expect(g.groups[0].items.map((i) => i.target)).toEqual([
      "/juniors/matches",
      "/juniors/players",
    ]);
  });

  it("omits groups with no visible children", () => {
    const g = groupNavItems([item("/players")], "seniors");
    expect(g.groups.map((x) => x.key)).toEqual(["stats"]);
  });

  it("a hidden item (absent from the resolved list) disappears from its group", () => {
    const g = groupNavItems(
      senior.filter((i) => i.target !== "/records"),
      "seniors",
    );
    expect(g.groups.find((x) => x.key === "stats")?.items.map((i) => i.target)).not.toContain(
      "/records",
    );
  });
});

describe("active state", () => {
  const g = groupNavItems([item("/players"), item("/records"), item("/fixtures")], "seniors");
  it("marks the Stats group active on /records and on a nested player page", () => {
    const stats = g.groups.find((x) => x.key === "stats")!;
    expect(isGroupActive("/records", stats)).toBe(true);
    expect(isGroupActive("/players/42", stats)).toBe(true);
    expect(isGroupActive("/fixtures", stats)).toBe(false);
  });

  it("index pages match exactly", () => {
    expect(isNavItemActive("/", item("/"))).toBe(true);
    expect(isNavItemActive("/players", item("/"))).toBe(false);
    expect(isNavItemActive("/juniors/players", item("/juniors"))).toBe(false);
  });

  it("does not treat /playersX as /players", () => {
    expect(isNavItemActive("/playersX", item("/players"))).toBe(false);
  });
});

describe("helpers", () => {
  it("sectionOf derives the section from the route", () => {
    expect(sectionOf("/juniors/players")).toBe("juniors");
    expect(sectionOf("/juniors")).toBe("juniors");
    expect(sectionOf("/players")).toBe("seniors");
  });

  it("describe falls back to a built-in description for known pages", () => {
    expect(describeItem(item("/players"))).toMatch(/career/i);
    expect(describeItem({ ...item("/players"), description: "Custom" })).toBe("Custom");
    expect(describeItem(item("/sponsors"))).toBe("");
  });
});
