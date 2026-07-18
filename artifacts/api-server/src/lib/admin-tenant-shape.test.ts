import { describe, it, expect } from "vitest";
import type { TenantRow } from "@workspace/db";
import { toAdminTenant } from "./admin-tenant-shape";

/** A fully-populated tenant row; individual tests override the fields they probe. */
function tenantRow(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    id: 1,
    slug: "demo",
    centralClubId: 1,
    appClubId: null,
    readsFromCentral: false,
    name: "Demo Club",
    shortName: "DC",
    logoUrl: "https://example.com/logo.png",
    faviconUrl: null,
    backgroundUrl: null,
    backgroundColour: "#123456",
    primaryColour: null,
    juniorsColour: null,
    customDomain: null,
    plan: "free",
    lastActiveAt: null,
    suspendedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as TenantRow;
}

describe("admin-tenant-shape: brandingComplete derivation", () => {
  it("is true when both logo and primary colour are set", () => {
    const out = toAdminTenant(
      tenantRow({ logoUrl: "https://x/y.png", primaryColour: "#abcdef" }),
      null,
      0,
    );
    expect(out.brandingComplete).toBe(true);
  });

  it("is false when the logo is missing", () => {
    const out = toAdminTenant(
      tenantRow({ logoUrl: null, primaryColour: "#abcdef" }),
      null,
      0,
    );
    expect(out.brandingComplete).toBe(false);
  });

  it("is false when the background colour is missing", () => {
    // brandingComplete gates on logo + background colour (admin-tenant-shape.ts).
    const out = toAdminTenant(
      tenantRow({ logoUrl: "https://x/y.png", backgroundColour: null }),
      null,
      0,
    );
    expect(out.brandingComplete).toBe(false);
  });

  it("is false when both are missing", () => {
    const out = toAdminTenant(
      tenantRow({ logoUrl: null, backgroundColour: null }),
      null,
      0,
    );
    expect(out.brandingComplete).toBe(false);
  });
});

describe("admin-tenant-shape: health timestamp serialization", () => {
  it("serializes a Date lastActiveAt to ISO and passes null through", () => {
    const active = toAdminTenant(
      tenantRow({ lastActiveAt: new Date("2026-07-15T09:00:00.000Z") }),
      null,
      0,
    );
    expect(active.lastActiveAt).toBe("2026-07-15T09:00:00.000Z");

    const never = toAdminTenant(tenantRow({ lastActiveAt: null }), null, 0);
    expect(never.lastActiveAt).toBeNull();
  });

  it("serializes a Date suspendedAt to ISO and passes null through", () => {
    const suspended = toAdminTenant(
      tenantRow({ suspendedAt: new Date("2026-07-10T12:00:00.000Z") }),
      null,
      0,
    );
    expect(suspended.suspendedAt).toBe("2026-07-10T12:00:00.000Z");

    const active = toAdminTenant(tenantRow({ suspendedAt: null }), null, 0);
    expect(active.suspendedAt).toBeNull();
  });

  it("carries through identity fields and admin count unchanged", () => {
    const out = toAdminTenant(tenantRow({ id: 42, name: "Mandurah" }), "Mandurah CC", 3);
    expect(out.id).toBe(42);
    expect(out.name).toBe("Mandurah");
    expect(out.centralClubName).toBe("Mandurah CC");
    expect(out.adminCount).toBe(3);
  });
});
