import { describe, it, expect } from "vitest";
import {
  buildPackData,
  tenantHashtag,
  kindSponsors,
  presentingSponsorName,
} from "./pack-card-data";
import type { CardKind } from "./share-card";

/**
 * U1 — the shared builder is the single source of `PackCardData`. These tests
 * lock the field contract so a future call site cannot silently receive a
 * narrowed payload (the D3 carousel regression this module exists to prevent).
 */

const BRAND = {
  name: "Mandurah Cricket Club",
  tagline: "CRICKET CLUB · EST 1948",
  logoUrl: "https://cdn.example/mandurah.png",
  primaryColour: "#22AA22",
  backgroundColour: "#111111",
  juniorsColour: "#0055FF",
};

describe("buildPackData", () => {
  it("populates every brand field from the supplied brand", () => {
    const data = buildPackData({ brand: BRAND });
    expect(data.brand).toEqual({
      name: BRAND.name,
      tagline: BRAND.tagline,
      logoUrl: BRAND.logoUrl,
      primaryColour: BRAND.primaryColour,
      backgroundColour: BRAND.backgroundColour,
      juniorsColour: BRAND.juniorsColour,
    });
  });

  it("(D3 regression) carries the colour fields, not just name + logoUrl", () => {
    // The carousel used to hand-roll `{ name, logoUrl }`, which dropped the
    // tenant accent and made every slide render in Halls Head gold.
    const data = buildPackData({ brand: BRAND });
    expect(data.brand?.primaryColour).toBe("#22AA22");
    expect(data.brand?.juniorsColour).toBe("#0055FF");
    expect(data.brand?.backgroundColour).toBe("#111111");
    expect(data.brand?.tagline).toBe("CRICKET CLUB · EST 1948");
  });

  it("returns brand: null when no brand is supplied", () => {
    expect(buildPackData({}).brand).toBeNull();
    expect(buildPackData({ brand: null }).brand).toBeNull();
    expect(buildPackData().brand).toBeNull();
  });

  it("(R5) leaves hashtag absent rather than substituting a literal", () => {
    expect(buildPackData({ brand: BRAND }).hashtag).toBeUndefined();
    expect(buildPackData({ brand: BRAND, hashtag: "" }).hashtag).toBe("");
    expect(buildPackData({ brand: BRAND, hashtag: null }).hashtag).toBeNull();
  });

  it("(R5) leaves presentingSponsorName absent rather than substituting a literal", () => {
    expect(buildPackData({ brand: BRAND }).presentingSponsorName).toBeUndefined();
  });

  it("passes sponsors through unchanged", () => {
    const sponsors = [
      { name: "Acme", logoUrl: "https://cdn.example/acme.png" },
      { name: "Beta", logoUrl: "https://cdn.example/beta.png" },
    ];
    expect(buildPackData({ sponsors }).sponsors).toEqual(sponsors);
  });

  it("omits imagesOverride entirely when the override map is empty", () => {
    // Byte-identical-render guarantee: an empty map must not become `{}`.
    expect(buildPackData({ imageOverrides: {} }).imagesOverride).toBeUndefined();
    expect(buildPackData({ imageOverrides: null }).imagesOverride).toBeUndefined();
    expect(buildPackData({}).imagesOverride).toBeUndefined();
  });

  it("passes a non-empty imagesOverride map through unchanged", () => {
    const overrides = { "potm.photo": "https://cdn.example/potm.png" };
    expect(buildPackData({ imageOverrides: overrides }).imagesOverride).toEqual(overrides);
  });

  it("maps the canvas photo placement onto the pack vocabulary", () => {
    expect(buildPackData({ photoPlacement: "feature" }).photoPlacement).toBe("fullBleed");
    expect(buildPackData({ photoPlacement: "headshot" }).photoPlacement).toBe("contained");
    // Absent placement must be "contained" — behaviourally identical to omitting
    // the field, so callers that never had a placement toggle are unaffected.
    expect(buildPackData({}).photoPlacement).toBe("contained");
  });

  it("passes the photo url and transform through unchanged", () => {
    const transform = { focalX: 0.25, focalY: 0.75, zoom: 1.5 };
    const data = buildPackData({
      photoUrl: "https://cdn.example/p.png",
      photoTransform: transform,
    });
    expect(data.photoUrl).toBe("https://cdn.example/p.png");
    expect(data.photoTransform).toEqual(transform);
  });

  it("is deterministic — the same options yield an equal payload", () => {
    const opts = { brand: BRAND, hashtag: "#MANDURAH", sponsors: [] };
    expect(buildPackData(opts)).toEqual(buildPackData(opts));
  });
});

/**
 * The derived inputs were re-computed at every call site before these helpers
 * existed — the same drift risk that made the carousel lose its brand colours.
 */
describe("tenantHashtag", () => {
  it("prefers the configured club hashtag", () => {
    expect(tenantHashtag({ settings: { clubHashtag: "#MCC" }, brand: { shortName: "MAND" } })).toBe(
      "#MCC",
    );
  });

  it("derives one from the short name when none is configured", () => {
    expect(tenantHashtag({ settings: {}, brand: { shortName: "MAND" } })).toBe("#MAND");
  });

  it("strips whitespace out of a multi-word short name", () => {
    expect(tenantHashtag({ brand: { shortName: "Halls Head" } })).toBe("#HallsHead");
  });

  it("(R5) returns empty for a brand-less tenant rather than another club's", () => {
    expect(tenantHashtag(undefined)).toBe("");
    expect(tenantHashtag(null)).toBe("");
    expect(tenantHashtag({})).toBe("");
    expect(tenantHashtag({ settings: {}, brand: {} })).toBe("");
  });
});

describe("kindSponsors", () => {
  const bundle = {
    activeSponsors: [
      { name: "All", logoUrl: "a.png", cardKinds: null },
      { name: "MatchOnly", logoUrl: "m.png", cardKinds: ["matchSummary"] },
      { name: "PlayerOnly", logoUrl: "p.png", cardKinds: ["player"] },
    ],
  };

  it("keeps sponsors scoped to the kind, plus unscoped ones", () => {
    const names = kindSponsors(bundle, "matchSummary" as CardKind, true).map((s) => s.name);
    expect(names).toEqual(["All", "MatchOnly"]);
  });

  it("excludes sponsors scoped to other kinds", () => {
    const names = kindSponsors(bundle, "player" as CardKind, true).map((s) => s.name);
    expect(names).toEqual(["All", "PlayerOnly"]);
  });

  it("returns nothing when the sponsor strip is off", () => {
    expect(kindSponsors(bundle, "matchSummary" as CardKind, false)).toEqual([]);
  });

  it("returns nothing for a tenant with no sponsors", () => {
    expect(kindSponsors(undefined, "matchSummary" as CardKind, true)).toEqual([]);
    expect(kindSponsors({}, "matchSummary" as CardKind, true)).toEqual([]);
  });
});

describe("presentingSponsorName", () => {
  const bundle = {
    activeSponsors: [
      { name: "Minor", logoUrl: "a.png", isPresenting: false },
      { name: "Headline", logoUrl: "b.png", isPresenting: true },
    ],
  };

  it("returns the designated presenting sponsor", () => {
    expect(presentingSponsorName(bundle, true)).toBe("Headline");
  });

  it("is not kind-filtered — it is the club's headline sponsor", () => {
    // No kind argument exists; this documents that by contract.
    expect(presentingSponsorName(bundle, true)).toBe("Headline");
  });

  it("returns null when the sponsor strip is off, so the line drops entirely", () => {
    expect(presentingSponsorName(bundle, false)).toBeNull();
  });

  it("(R5) returns null when none is designated", () => {
    expect(presentingSponsorName({ activeSponsors: [] }, true)).toBeNull();
    expect(presentingSponsorName(undefined, true)).toBeNull();
  });
});
