import { describe, it, expect } from "vitest";
import { buildPackData } from "./pack-card-data";

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
    const data = buildPackData({ photoUrl: "https://cdn.example/p.png", photoTransform: transform });
    expect(data.photoUrl).toBe("https://cdn.example/p.png");
    expect(data.photoTransform).toEqual(transform);
  });

  it("is deterministic — the same options yield an equal payload", () => {
    const opts = { brand: BRAND, hashtag: "#MANDURAH", sponsors: [] };
    expect(buildPackData(opts)).toEqual(buildPackData(opts));
  });
});
