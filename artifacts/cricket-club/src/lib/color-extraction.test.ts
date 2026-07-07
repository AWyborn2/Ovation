import { describe, it, expect, vi, afterEach } from "vitest";

// Mock node-vibrant/browser so this test exercises the swatch-selection logic
// (dedup, priority order, fallback trigger) without needing real image
// decoding or a canvas implementation in jsdom.
const getPaletteMock = vi.fn();
vi.mock("node-vibrant/browser", () => ({
  Vibrant: { from: () => ({ getPalette: getPaletteMock }) },
}));

import { extractBrandPalette } from "./color-extraction";

function swatch(hex: string) {
  return { hex };
}

describe("extractBrandPalette", () => {
  afterEach(() => {
    getPaletteMock.mockReset();
  });

  it("maps Vibrant/Muted/DarkVibrant to primary/secondary/tertiary", async () => {
    getPaletteMock.mockResolvedValue({
      Vibrant: swatch("#ff0000"),
      Muted: swatch("#888888"),
      DarkVibrant: swatch("#800000"),
      DarkMuted: null,
      LightVibrant: null,
      LightMuted: null,
    });
    const result = await extractBrandPalette("blob:fake");
    expect(result).toEqual({
      primaryColour: "#ff0000",
      secondaryColour: "#800000",
      tertiaryColour: "#888888",
    });
  });

  it("returns all-null when the logo yields no usable swatches (monochrome/transparent)", async () => {
    getPaletteMock.mockResolvedValue({
      Vibrant: null,
      Muted: null,
      DarkVibrant: null,
      DarkMuted: null,
      LightVibrant: null,
      LightMuted: null,
    });
    const result = await extractBrandPalette("blob:fake");
    expect(result).toEqual({
      primaryColour: null,
      secondaryColour: null,
      tertiaryColour: null,
    });
  });

  it("returns all-null (not a throw) when extraction fails outright", async () => {
    getPaletteMock.mockRejectedValue(new Error("decode failed"));
    const result = await extractBrandPalette("blob:fake");
    expect(result).toEqual({
      primaryColour: null,
      secondaryColour: null,
      tertiaryColour: null,
    });
  });

  it("deduplicates identical swatch hexes rather than repeating one colour 3x", async () => {
    getPaletteMock.mockResolvedValue({
      Vibrant: swatch("#123456"),
      Muted: swatch("#123456"), // same colour won by both categories
      DarkVibrant: swatch("#654321"),
      DarkMuted: null,
      LightVibrant: null,
      LightMuted: swatch("#abcdef"),
    });
    const result = await extractBrandPalette("blob:fake");
    expect(result).toEqual({
      primaryColour: "#123456",
      secondaryColour: "#654321",
      tertiaryColour: "#abcdef",
    });
  });

  it("returns a partial result when fewer than 3 distinct swatches are found", async () => {
    getPaletteMock.mockResolvedValue({
      Vibrant: swatch("#111111"),
      Muted: null,
      DarkVibrant: null,
      DarkMuted: null,
      LightVibrant: null,
      LightMuted: null,
    });
    const result = await extractBrandPalette("blob:fake");
    expect(result).toEqual({
      primaryColour: "#111111",
      secondaryColour: null,
      tertiaryColour: null,
    });
  });
});
