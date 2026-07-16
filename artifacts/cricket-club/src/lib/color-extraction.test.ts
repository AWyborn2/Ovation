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

  it("maps Vibrant/Muted/DarkVibrant to backgroundColour/primaryColour/juniorsColour", async () => {
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
      backgroundColour: "#ff0000",
      primaryColour: "#800000",
      juniorsColour: "#888888",
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
      backgroundColour: null,
      primaryColour: null,
      juniorsColour: null,
    });
  });

  it("returns all-null (not a throw) when extraction fails outright", async () => {
    getPaletteMock.mockRejectedValue(new Error("decode failed"));
    const result = await extractBrandPalette("blob:fake");
    expect(result).toEqual({
      backgroundColour: null,
      primaryColour: null,
      juniorsColour: null,
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
      backgroundColour: "#123456",
      primaryColour: "#654321",
      juniorsColour: "#abcdef",
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
      backgroundColour: "#111111",
      primaryColour: null,
      juniorsColour: null,
    });
  });

  it("returns all-null instead of hanging when the underlying load never settles", async () => {
    vi.useFakeTimers();
    try {
      getPaletteMock.mockReturnValue(new Promise(() => {})); // never resolves/rejects
      const pending = extractBrandPalette("blob:fake");
      await vi.advanceTimersByTimeAsync(8000);
      const result = await pending;
      expect(result).toEqual({
        backgroundColour: null,
        primaryColour: null,
        juniorsColour: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
