import { describe, it, expect } from "vitest";
import {
  formatLastActive,
  passesHealthFilter,
  matchesSearch,
  sortTenants,
  nextSort,
  DEFAULT_SORT,
  type TenantHealthRow,
} from "./tenant-health";

function row(overrides: Partial<TenantHealthRow> = {}): TenantHealthRow {
  return {
    name: "Club",
    slug: "club",
    centralClubName: null,
    adminCount: 0,
    lastActiveAt: null,
    suspendedAt: null,
    brandingComplete: true,
    ...overrides,
  };
}

describe("tenant-health: formatLastActive", () => {
  const now = new Date("2026-07-15T12:00:00.000Z").getTime();

  it("returns 'never' for null / undefined / unparseable", () => {
    expect(formatLastActive(null, now)).toBe("never");
    expect(formatLastActive(undefined, now)).toBe("never");
    expect(formatLastActive("not-a-date", now)).toBe("never");
  });

  it("returns a sane relative string for recent and old timestamps", () => {
    expect(formatLastActive("2026-07-15T11:59:30.000Z", now)).toBe("just now");
    expect(formatLastActive("2026-07-15T11:30:00.000Z", now)).toBe("30 minutes ago");
    expect(formatLastActive("2026-07-15T11:00:00.000Z", now)).toBe("1 hour ago");
    expect(formatLastActive("2026-07-13T12:00:00.000Z", now)).toBe("2 days ago");
  });
});

describe("tenant-health: passesHealthFilter", () => {
  it("'all' passes everything", () => {
    expect(passesHealthFilter(row({ suspendedAt: "x" }), "all")).toBe(true);
  });
  it("'never-active' keeps only null lastActiveAt", () => {
    expect(passesHealthFilter(row({ lastActiveAt: null }), "never-active")).toBe(true);
    expect(passesHealthFilter(row({ lastActiveAt: "2026-01-01" }), "never-active")).toBe(false);
  });
  it("'branding-incomplete' keeps only brandingComplete === false", () => {
    expect(passesHealthFilter(row({ brandingComplete: false }), "branding-incomplete")).toBe(true);
    expect(passesHealthFilter(row({ brandingComplete: true }), "branding-incomplete")).toBe(false);
  });
  it("'suspended' keeps only non-null suspendedAt", () => {
    expect(passesHealthFilter(row({ suspendedAt: "2026-07-10" }), "suspended")).toBe(true);
    expect(passesHealthFilter(row({ suspendedAt: null }), "suspended")).toBe(false);
  });
});

describe("tenant-health: matchesSearch", () => {
  it("matches name, slug, and central club name; empty query passes all", () => {
    const t = row({ name: "Mandurah", slug: "mandurah", centralClubName: "Mandurah CC" });
    expect(matchesSearch(t, "")).toBe(true);
    expect(matchesSearch(t, "mand")).toBe(true);
    expect(matchesSearch(t, "CC")).toBe(true);
    expect(matchesSearch(t, "halls")).toBe(false);
  });
});

describe("tenant-health: sortTenants", () => {
  const active = row({ name: "Active", lastActiveAt: "2026-07-15T00:00:00.000Z", adminCount: 5 });
  const older = row({ name: "Older", lastActiveAt: "2026-07-01T00:00:00.000Z", adminCount: 1 });
  const never = row({ name: "Never", lastActiveAt: null, adminCount: 3 });

  it("last-active ascending puts never-active first, then oldest->newest", () => {
    const sorted = sortTenants([active, older, never], { column: "lastActive", direction: "asc" });
    expect(sorted.map((t) => t.name)).toEqual(["Never", "Older", "Active"]);
  });

  it("DEFAULT_SORT is last-active ascending (stalest first)", () => {
    const sorted = sortTenants([active, never], DEFAULT_SORT);
    expect(sorted[0].name).toBe("Never");
  });

  it("admins descending orders by adminCount", () => {
    const sorted = sortTenants([older, active, never], { column: "admins", direction: "desc" });
    expect(sorted.map((t) => t.adminCount)).toEqual([5, 3, 1]);
  });

  it("name ascending preserves alphabetical order", () => {
    const sorted = sortTenants([never, active, older], { column: "name", direction: "asc" });
    expect(sorted.map((t) => t.name)).toEqual(["Active", "Never", "Older"]);
  });

  it("does not mutate the input array", () => {
    const input = [active, older];
    sortTenants(input, DEFAULT_SORT);
    expect(input).toEqual([active, older]);
  });
});

describe("tenant-health: nextSort", () => {
  it("flips direction on the same column, resets to asc on a new column", () => {
    expect(nextSort({ column: "name", direction: "asc" }, "name")).toEqual({
      column: "name",
      direction: "desc",
    });
    expect(nextSort({ column: "name", direction: "desc" }, "admins")).toEqual({
      column: "admins",
      direction: "asc",
    });
  });
});
