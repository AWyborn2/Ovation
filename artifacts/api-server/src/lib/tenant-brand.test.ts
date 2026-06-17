import { describe, it, expect, afterEach } from "vitest";
import type { Request } from "express";
import { HALLS_HEAD_BRAND } from "@workspace/scorecard/brand";
import { buildTenantBrand } from "./tenant-brand";
import { resolveTenantId, DEFAULT_TENANT_ID } from "../middlewares/tenant-context";

function reqWithHeader(value?: string): Request {
  return {
    header: (name: string) =>
      name.toLowerCase() === "x-tenant-id" ? value : undefined,
  } as unknown as Request;
}

describe("tenant-context: resolveTenantId (header > env > default)", () => {
  const original = process.env.DEFAULT_TENANT_ID;
  afterEach(() => {
    if (original === undefined) delete process.env.DEFAULT_TENANT_ID;
    else process.env.DEFAULT_TENANT_ID = original;
  });

  it("prefers the x-tenant-id header over the env default", () => {
    process.env.DEFAULT_TENANT_ID = "7";
    expect(resolveTenantId(reqWithHeader("3"))).toBe(3);
  });

  it("falls back to DEFAULT_TENANT_ID env when there is no header", () => {
    process.env.DEFAULT_TENANT_ID = "7";
    expect(resolveTenantId(reqWithHeader(undefined))).toBe(7);
  });

  it("falls back to the platform default (1) when neither is set", () => {
    delete process.env.DEFAULT_TENANT_ID;
    expect(resolveTenantId(reqWithHeader(undefined))).toBe(DEFAULT_TENANT_ID);
    expect(DEFAULT_TENANT_ID).toBe(1);
  });

  it("ignores an invalid header value and falls through", () => {
    delete process.env.DEFAULT_TENANT_ID;
    expect(resolveTenantId(reqWithHeader("not-a-number"))).toBe(1);
  });
});

describe("tenant-brand: buildTenantBrand fallback chain (tenant #1 snapshot)", () => {
  // The Halls Head clubs-register row (id 2) mirrors HALLS_HEAD_BRAND — this is
  // the shape getHallsHeadBrand() returned before the tenancy refactor.
  const hhClubRow = {
    name: HALLS_HEAD_BRAND.name,
    shortName: HALLS_HEAD_BRAND.shortName ?? null,
    logoUrl: HALLS_HEAD_BRAND.logoUrl ?? null,
    logoUrl128: HALLS_HEAD_BRAND.logoUrl128 ?? null,
    primaryColour: HALLS_HEAD_BRAND.primaryColour ?? null,
    secondaryColour: HALLS_HEAD_BRAND.secondaryColour ?? null,
    tertiaryColour: HALLS_HEAD_BRAND.tertiaryColour ?? null,
  };
  const hhTenantRow = {
    name: HALLS_HEAD_BRAND.name,
    shortName: HALLS_HEAD_BRAND.shortName ?? null,
    logoUrl: HALLS_HEAD_BRAND.logoUrl ?? null,
    primaryColour: HALLS_HEAD_BRAND.primaryColour ?? null,
    secondaryColour: HALLS_HEAD_BRAND.secondaryColour ?? null,
    tertiaryColour: HALLS_HEAD_BRAND.tertiaryColour ?? null,
  };

  it("returns the Halls Head brand from the clubs-register row", () => {
    // getTenantBrand(1) resolves club row 2 then merges via buildTenantBrand —
    // this is the exact object getHallsHeadBrand() returned before.
    expect(buildTenantBrand(hhTenantRow, hhClubRow)).toEqual(HALLS_HEAD_BRAND);
  });

  it("falls back to the tenant row's own brand columns when no clubs row", () => {
    // With no clubs-register row, the 128px logo falls back to the tenant's own
    // logoUrl (better than the default club's 128px) — the tenants table has no
    // 128px column. Everything else comes from the tenant row.
    expect(buildTenantBrand(hhTenantRow, null)).toEqual({
      ...HALLS_HEAD_BRAND,
      logoUrl128: hhTenantRow.logoUrl,
    });
  });

  it("falls back to the built-in brand when nothing is set", () => {
    expect(buildTenantBrand(null, null)).toEqual(HALLS_HEAD_BRAND);
  });
});
