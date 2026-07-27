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

// The wire brand carries no accentToken (client-side only), always has
// badgeStyle: null and useNavyBase: false from buildTenantBrand's return shape.
const { accentToken: _hhAccent, ...hhBrandBase } = HALLS_HEAD_BRAND;
const HALLS_HEAD_WIRE_BRAND = {
  ...hhBrandBase,
  badgeStyle: null,
  useNavyBase: false,
  themeOverrides: null,
};
const { accentToken: _defaultAccent, ...defaultBrandBase } = DEFAULT_BRAND;
const DEFAULT_WIRE_BRAND = {
  ...defaultBrandBase,
  badgeStyle: null,
  useNavyBase: false,
  themeOverrides: null,
};

describe("tenant-brand: buildTenantBrand fallback chain (tenant #1 snapshot)", () => {
  // The Halls Head clubs-register row (id 2) mirrors HALLS_HEAD_BRAND — this is
  // the shape getHallsHeadBrand() returned before the tenancy refactor.
  const hhClubRow = {
    name: HALLS_HEAD_BRAND.name,
    shortName: HALLS_HEAD_BRAND.shortName ?? null,
    logoUrl: HALLS_HEAD_BRAND.logoUrl ?? null,
    logoUrl128: HALLS_HEAD_BRAND.logoUrl128 ?? null,
    backgroundColour: HALLS_HEAD_BRAND.backgroundColour ?? null,
    primaryColour: HALLS_HEAD_BRAND.primaryColour ?? null,
    juniorsColour: HALLS_HEAD_BRAND.juniorsColour ?? null,
  };
  const hhTenantRow = {
    name: HALLS_HEAD_BRAND.name,
    shortName: HALLS_HEAD_BRAND.shortName ?? null,
    tagline: HALLS_HEAD_BRAND.tagline ?? null,
    logoUrl: HALLS_HEAD_BRAND.logoUrl ?? null,
    backgroundUrl: HALLS_HEAD_BRAND.backgroundUrl ?? null,
    faviconUrl: HALLS_HEAD_BRAND.faviconUrl ?? null,
    backgroundColour: HALLS_HEAD_BRAND.backgroundColour ?? null,
    primaryColour: HALLS_HEAD_BRAND.primaryColour ?? null,
    juniorsColour: HALLS_HEAD_BRAND.juniorsColour ?? null,
    useNavyBase: false,
    badgeStyle: null,
  };

  it("returns the Halls Head brand from the clubs-register row", () => {
    expect(buildTenantBrand(hhTenantRow, hhClubRow)).toEqual(HALLS_HEAD_WIRE_BRAND);
  });

  it("falls back to the tenant row's own brand columns when no clubs row", () => {
    expect(buildTenantBrand(hhTenantRow, null)).toEqual({
      ...HALLS_HEAD_WIRE_BRAND,
      logoUrl128: hhTenantRow.logoUrl,
    });
  });

  it("falls back to the NEUTRAL default, never Halls Head, when nothing is set", () => {
    const brand = buildTenantBrand(null, null);
    expect(brand).toEqual(DEFAULT_WIRE_BRAND);
    expect(brand.logoUrl).not.toBe(HALLS_HEAD_BRAND.logoUrl);
    expect(brand.backgroundColour).not.toBe(HALLS_HEAD_BRAND.backgroundColour);
    expect(brand.name).not.toBe(HALLS_HEAD_BRAND.name);
    expect(brand.backgroundUrl).toBeNull();
    expect(brand.faviconUrl).toBeNull();
    expect(brand.useNavyBase).toBe(false);
  });

  it("passes tenant themeOverrides through, defaulting to null when unset", () => {
    const overrides = { "--card": "#123456", "--radius": "0.75rem" };
    const withOverrides = buildTenantBrand(
      {
        name: "Custom Design FC",
        shortName: null,
        logoUrl: null,
        backgroundUrl: null,
        faviconUrl: null,
        backgroundColour: null,
        primaryColour: null,
        juniorsColour: null,
        useNavyBase: false,
        badgeStyle: null,
        themeOverrides: overrides,
      },
      null,
    );
    expect(withOverrides.themeOverrides).toEqual(overrides);
    // No override column → null (clubs register has no override concept).
    expect(buildTenantBrand(null, null).themeOverrides).toBeNull();
  });

  it("resolves logoUrl to the Ovation placeholder asset for a tenant with no brand data (U5, AE4)", () => {
    const brand = buildTenantBrand(
      {
        name: "Freshly Provisioned Club",
        shortName: null,
        logoUrl: null,
        backgroundUrl: null,
        faviconUrl: null,
        backgroundColour: null,
        primaryColour: null,
        juniorsColour: null,
        useNavyBase: false,
        badgeStyle: null,
      },
      null,
    );
    expect(brand.logoUrl).toBe("/ovation-logo.svg");
    expect(brand.logoUrl128).toBe("/ovation-logo.svg");
    expect(brand.logoUrl).not.toBe("/placeholder-club-logo.svg");
  });

  it("still resolves Halls Head's own seeded brand, unaffected by the default swap (U5 regression guard)", () => {
    expect(buildTenantBrand(hhTenantRow, hhClubRow)).toEqual(HALLS_HEAD_WIRE_BRAND);
    expect(buildTenantBrand(hhTenantRow, hhClubRow).logoUrl).toBe(
      HALLS_HEAD_BRAND.logoUrl,
    );
  });

  it("the admin-uploaded tenant logo wins over the clubs-register seed (blank-crest bug)", () => {
    // Repro: a club whose register row still points at the seeded (often
    // hotlink-blocked / stale) URL, but whose admin uploaded a real logo via
    // Branding — which the PATCH writes to the tenants row. The upload must win,
    // otherwise the card renders the blank register logo.
    const UPLOADED = "https://cdn.example.com/tenant/uploaded-logo.png";
    const brand = buildTenantBrand(
      { ...hhTenantRow, logoUrl: UPLOADED },
      hhClubRow, // register still carries the seeded Cloudinary URL
    );
    expect(brand.logoUrl).toBe(UPLOADED);
    expect(brand.logoUrl).not.toBe(HALLS_HEAD_BRAND.logoUrl);
    // A genuine override also flows to the 128px slot so the upload shows everywhere.
    expect(brand.logoUrl128).toBe(UPLOADED);
  });

  it("an empty-string tenant logo falls back to the register seed, never blank", () => {
    const brand = buildTenantBrand(
      { ...hhTenantRow, logoUrl: "" },
      hhClubRow,
    );
    expect(brand.logoUrl).toBe(HALLS_HEAD_BRAND.logoUrl);
    expect(brand.logoUrl128).toBe(HALLS_HEAD_BRAND.logoUrl128);
  });

  it("uses the tenant's own faviconUrl (Phase 2 R8: per-tenant, no cross-tenant leak)", () => {
    const withFavicon = buildTenantBrand(
      {
        name: "Some Club",
        shortName: null,
        logoUrl: null,
        backgroundUrl: null,
        faviconUrl: "https://example.com/some-club-favicon.png",
        backgroundColour: null,
        primaryColour: null,
        juniorsColour: null,
        useNavyBase: false,
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
        backgroundColour: null,
        primaryColour: null,
        juniorsColour: null,
        useNavyBase: false,
        badgeStyle: null,
      },
      null,
    );
    expect(withoutFavicon.faviconUrl).toBe(DEFAULT_BRAND.faviconUrl);
    expect(withoutFavicon.faviconUrl).toBeNull();
  });

  it("carries the tenant's tagline through, and null when unset (no cross-tenant leak) (A9)", () => {
    // Halls Head's seeded tagline survives the merge.
    expect(buildTenantBrand(hhTenantRow, hhClubRow).tagline).toBe(
      "CRICKET CLUB · EST 1991",
    );
    // A tenant that has set no tagline resolves to null — never another club's.
    const noTagline = buildTenantBrand(
      {
        name: "Tagline-less Club",
        shortName: null,
        logoUrl: null,
        backgroundUrl: null,
        faviconUrl: null,
        backgroundColour: null,
        primaryColour: null,
        juniorsColour: null,
        useNavyBase: false,
        badgeStyle: null,
      },
      null,
    );
    expect(noTagline.tagline).toBeNull();
    expect(noTagline.tagline).not.toBe(HALLS_HEAD_BRAND.tagline);
  });

  it("derives missing accents from the tenant's OWN backgroundColour, not the default", () => {
    const brand = buildTenantBrand(
      {
        name: "Some Club",
        shortName: null,
        logoUrl: "https://example.com/some-club.png",
        backgroundUrl: null,
        faviconUrl: null,
        backgroundColour: "#123456",
        primaryColour: null,
        juniorsColour: null,
        useNavyBase: false,
        badgeStyle: null,
      },
      null,
    );
    expect(brand.primaryColour).toBe("#123456");
    expect(brand.juniorsColour).toBe("#123456");
    expect(brand.primaryColour).not.toBe(HALLS_HEAD_BRAND.primaryColour);
    expect(brand.primaryColour).not.toBe(DEFAULT_BRAND.primaryColour);
  });

  it("tenant colour wins over clubs-register colour (Bug 1 fix: tenant PATCH is not silently overridden)", () => {
    const brand = buildTenantBrand(
      {
        name: "Custom Tenant",
        shortName: null,
        logoUrl: null,
        backgroundUrl: null,
        faviconUrl: null,
        backgroundColour: "#AABBCC",
        primaryColour: "#FFFFFF",
        juniorsColour: "#112233",
        useNavyBase: false,
        badgeStyle: null,
      },
      {
        name: "Club Register Name",
        shortName: null,
        logoUrl: null,
        logoUrl128: null,
        backgroundColour: "#001122",
        primaryColour: "#FBAC27",
        juniorsColour: "#42342B",
      },
    );
    expect(brand.backgroundColour).toBe("#AABBCC");
    expect(brand.primaryColour).toBe("#FFFFFF");
    expect(brand.juniorsColour).toBe("#112233");
  });

  it("clubs-register colour is used as fallback when tenant has no colours set", () => {
    const brand = buildTenantBrand(
      {
        name: "Some Club",
        shortName: null,
        logoUrl: null,
        backgroundUrl: null,
        faviconUrl: null,
        backgroundColour: null,
        primaryColour: null,
        juniorsColour: null,
        useNavyBase: false,
        badgeStyle: null,
      },
      {
        name: "Club Register Name",
        shortName: null,
        logoUrl: null,
        logoUrl128: null,
        backgroundColour: "#001122",
        primaryColour: "#FBAC27",
        juniorsColour: "#42342B",
      },
    );
    expect(brand.backgroundColour).toBe("#001122");
    expect(brand.primaryColour).toBe("#FBAC27");
    expect(brand.juniorsColour).toBe("#42342B");
  });

  it("tenant partial colours override clubs-register and leave the rest to fall back", () => {
    const brand = buildTenantBrand(
      {
        name: "Partial Tenant",
        shortName: null,
        logoUrl: null,
        backgroundUrl: null,
        faviconUrl: null,
        backgroundColour: null,
        primaryColour: "#FF0000",
        juniorsColour: null,
        useNavyBase: false,
        badgeStyle: null,
      },
      {
        name: "Club Register Name",
        shortName: null,
        logoUrl: null,
        logoUrl128: null,
        backgroundColour: "#001122",
        primaryColour: "#FBAC27",
        juniorsColour: "#42342B",
      },
    );
    expect(brand.backgroundColour).toBe("#001122");
    expect(brand.primaryColour).toBe("#FF0000");
    expect(brand.juniorsColour).toBe("#42342B");
  });

  it("useNavyBase is passed through from the tenant row (true and false)", () => {
    const navyBrand = buildTenantBrand(
      {
        name: "Navy Club",
        shortName: null,
        logoUrl: null,
        backgroundUrl: null,
        faviconUrl: null,
        backgroundColour: null,
        primaryColour: null,
        juniorsColour: null,
        useNavyBase: true,
        badgeStyle: null,
      },
      null,
    );
    expect(navyBrand.useNavyBase).toBe(true);

    const standardBrand = buildTenantBrand(
      {
        name: "Standard Club",
        shortName: null,
        logoUrl: null,
        backgroundUrl: null,
        faviconUrl: null,
        backgroundColour: null,
        primaryColour: null,
        juniorsColour: null,
        useNavyBase: false,
        badgeStyle: null,
      },
      null,
    );
    expect(standardBrand.useNavyBase).toBe(false);
  });

  it("useNavyBase defaults false when tenant row is null", () => {
    expect(buildTenantBrand(null, null).useNavyBase).toBe(false);
  });

  it("uses the tenant's own backgroundUrl (Phase 2 R6: per-tenant, no cross-tenant leak)", () => {
    const withBackground = buildTenantBrand(
      {
        name: "Some Club",
        shortName: null,
        logoUrl: null,
        backgroundUrl: "https://example.com/some-club-bg.png",
        faviconUrl: null,
        backgroundColour: null,
        primaryColour: null,
        juniorsColour: null,
        useNavyBase: false,
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
        backgroundColour: null,
        primaryColour: null,
        juniorsColour: null,
        useNavyBase: false,
        badgeStyle: null,
      },
      null,
    );
    expect(withoutBackground.backgroundUrl).toBe(DEFAULT_BRAND.backgroundUrl);
    expect(withoutBackground.backgroundUrl).toBeNull();
  });
});
