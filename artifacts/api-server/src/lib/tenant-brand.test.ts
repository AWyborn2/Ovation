import { describe, it, expect, afterEach } from "vitest";
import type { Request } from "express";
import { HALLS_HEAD_BRAND, DEFAULT_BRAND } from "@workspace/scorecard/brand";
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

// The wire brand carries no accentToken — the field is client-side only
// (renderers snap the accent-slot hex to the nearest design-system token via
// resolveAccentToken), so the server-built brand is the shared constant minus
// that key.
const { accentToken: _hhAccent, ...HALLS_HEAD_WIRE_BRAND } = HALLS_HEAD_BRAND;
const { accentToken: _defaultAccent, ...DEFAULT_WIRE_BRAND } = DEFAULT_BRAND;

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
    backgroundUrl: HALLS_HEAD_BRAND.backgroundUrl ?? null,
    faviconUrl: HALLS_HEAD_BRAND.faviconUrl ?? null,
    primaryColour: HALLS_HEAD_BRAND.primaryColour ?? null,
    secondaryColour: HALLS_HEAD_BRAND.secondaryColour ?? null,
    tertiaryColour: HALLS_HEAD_BRAND.tertiaryColour ?? null,
    badgeStyle: null,
  };

  it("returns the Halls Head brand from the clubs-register row", () => {
    // getTenantBrand(1) resolves club row 2 then merges via buildTenantBrand —
    // this is the exact object getHallsHeadBrand() returned before.
    expect(buildTenantBrand(hhTenantRow, hhClubRow)).toEqual(HALLS_HEAD_WIRE_BRAND);
  });

  it("falls back to the tenant row's own brand columns when no clubs row", () => {
    // With no clubs-register row, the 128px logo falls back to the tenant's own
    // logoUrl (better than the default club's 128px) — the tenants table has no
    // 128px column. Everything else comes from the tenant row.
    expect(buildTenantBrand(hhTenantRow, null)).toEqual({
      ...HALLS_HEAD_WIRE_BRAND,
      logoUrl128: hhTenantRow.logoUrl,
    });
  });

  it("falls back to the NEUTRAL default, never Halls Head, when nothing is set", () => {
    const brand = buildTenantBrand(null, null);
    expect(brand).toEqual(DEFAULT_WIRE_BRAND);
    // The Phase 2 R5 regression guard: no Halls Head asset leaks through.
    // (backgroundUrl needs no not-Halls-Head check any more — the design
    // system dropped the texture, so Halls Head's own value is null too.)
    expect(brand.logoUrl).not.toBe(HALLS_HEAD_BRAND.logoUrl);
    expect(brand.primaryColour).not.toBe(HALLS_HEAD_BRAND.primaryColour);
    expect(brand.name).not.toBe(HALLS_HEAD_BRAND.name);
    expect(brand.backgroundUrl).toBeNull();
    expect(brand.faviconUrl).toBeNull();
  });

  it("resolves logoUrl to the Ovation placeholder asset for a tenant with no brand data (U5, AE4)", () => {
    // A freshly provisioned tenant: no clubs-register row, no tenant brand
    // columns set. The resolved logo must be the Ovation placeholder, not the
    // old neutral SVG and not Halls Head's.
    const brand = buildTenantBrand(
      {
        name: "Freshly Provisioned Club",
        shortName: null,
        logoUrl: null,
        backgroundUrl: null,
        faviconUrl: null,
        primaryColour: null,
        secondaryColour: null,
        tertiaryColour: null,
        badgeStyle: null,
      },
      null,
    );
    expect(brand.logoUrl).toBe("/ovation-logo.svg");
    expect(brand.logoUrl128).toBe("/ovation-logo.svg");
    expect(brand.logoUrl).not.toBe("/placeholder-club-logo.svg");
  });

  it("still resolves Halls Head's own seeded brand, unaffected by the default swap (U5 regression guard)", () => {
    // Tenant #1 always resolves through its clubs-register row (appClubId set),
    // so swapping DEFAULT_BRAND's logo must never change what Halls Head shows.
    expect(buildTenantBrand(hhTenantRow, hhClubRow)).toEqual(HALLS_HEAD_WIRE_BRAND);
    expect(buildTenantBrand(hhTenantRow, hhClubRow).logoUrl).toBe(
      HALLS_HEAD_BRAND.logoUrl,
    );
  });

  it("uses the tenant's own faviconUrl (Phase 2 R8: per-tenant, no cross-tenant leak)", () => {
    const withFavicon = buildTenantBrand(
      {
        name: "Some Club",
        shortName: null,
        logoUrl: null,
        backgroundUrl: null,
        faviconUrl: "https://example.com/some-club-favicon.png",
        primaryColour: null,
        secondaryColour: null,
        tertiaryColour: null,
        badgeStyle: null,
      },
      null,
    );
    expect(withFavicon.faviconUrl).toBe("https://example.com/some-club-favicon.png");

    const withoutFavicon = buildTenantBrand(
      {
        name: "Some Club",
        shortName: null,
        logoUrl: null,
        backgroundUrl: null,
        faviconUrl: null,
        primaryColour: null,
        secondaryColour: null,
        tertiaryColour: null,
        badgeStyle: null,
      },
      null,
    );
    // No favicon set -> neutral default, never Halls Head's.
    expect(withoutFavicon.faviconUrl).toBe(DEFAULT_BRAND.faviconUrl);
    expect(withoutFavicon.faviconUrl).toBeNull();
  });

  it("derives missing accents from the tenant's OWN primary, not the default", () => {
    const brand = buildTenantBrand(
      {
        name: "Some Club",
        shortName: null,
        logoUrl: "https://example.com/some-club.png",
        backgroundUrl: null,
        faviconUrl: null,
        primaryColour: "#123456",
        secondaryColour: null,
        tertiaryColour: null,
        badgeStyle: null,
      },
      null,
    );
    expect(brand.secondaryColour).toBe("#123456");
    expect(brand.tertiaryColour).toBe("#123456");
    expect(brand.secondaryColour).not.toBe(HALLS_HEAD_BRAND.secondaryColour);
    expect(brand.secondaryColour).not.toBe(DEFAULT_BRAND.secondaryColour);
  });

  it("uses the tenant's own backgroundUrl (Phase 2 R6: per-tenant, no cross-tenant leak)", () => {
    const withBackground = buildTenantBrand(
      {
        name: "Some Club",
        shortName: null,
        logoUrl: null,
        backgroundUrl: "https://example.com/some-club-bg.png",
        faviconUrl: null,
        primaryColour: null,
        secondaryColour: null,
        tertiaryColour: null,
        badgeStyle: null,
      },
      null,
    );
    expect(withBackground.backgroundUrl).toBe("https://example.com/some-club-bg.png");

    const withoutBackground = buildTenantBrand(
      {
        name: "Some Club",
        shortName: null,
        logoUrl: null,
        backgroundUrl: null,
        faviconUrl: null,
        primaryColour: null,
        secondaryColour: null,
        tertiaryColour: null,
        badgeStyle: null,
      },
      null,
    );
    // No background set -> neutral default (no image), never Halls Head's texture.
    expect(withoutBackground.backgroundUrl).toBe(DEFAULT_BRAND.backgroundUrl);
    expect(withoutBackground.backgroundUrl).toBeNull();
  });
});
