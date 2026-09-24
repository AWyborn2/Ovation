/**
 * Social Studio U11 — the landscape (1200×630) format: format selection,
 * the letterbox fallback for designs without a landscape layout, exact
 * native size, and square output unchanged.
 */
import { describe, it, expect } from "vitest";
import { renderPackCard, PACK_DEFAULT_TOKENS, packNativeSize } from "../pack-render";
import { selectFormatHtml, hasLandscapeFormat } from "../pack-render/templates";
import { listPackManifests } from "../pack-templates/registry";
import { sampleCardInput } from "../sample-card-inputs";
import { SIZES } from "./types";

describe("selectFormatHtml", () => {
  it("returns landscape markup when a design has it", () => {
    const formats = { story: "S", shared: "SH", landscape: "L" };
    expect(hasLandscapeFormat(formats)).toBe(true);
    expect(selectFormatHtml(formats, "landscape")).toBe("L");
    expect(selectFormatHtml(formats, "square")).toBe("SH");
  });

  it("falls back to the square (or shared) layout otherwise", () => {
    expect(selectFormatHtml({ story: "S", shared: "SH" }, "landscape")).toBe("SH");
    expect(selectFormatHtml({ story: "S", portrait: "P", square: "SQ" }, "landscape")).toBe("SQ");
  });
});

describe("landscape renders", () => {
  it("is exactly 1200×630", () => {
    expect(SIZES.landscape).toMatchObject({ w: 1200, h: 630 });
    expect(packNativeSize("landscape")).toEqual({ w: 1200, h: 630 });
  });

  it("letterboxes every pack's square design at the frame's height", () => {
    const input = sampleCardInput("century");
    for (const { packId } of listPackManifests()) {
      const html = renderPackCard(
        input,
        "landscape",
        true,
        PACK_DEFAULT_TOKENS,
        false,
        null,
        packId,
      );
      expect(html, packId).toContain("width:1200px");
      expect(html, packId).toContain("height:630px");
      expect(html, packId).toContain("pack-landscape-fallback");
      // The square card inside, scaled to 630/1080.
      expect(html, packId).toContain("width:1080px");
      expect(html, packId).toMatch(/transform:scale\(0\.583/);
    }
  });

  it("leaves square output unchanged by the new format", () => {
    const input = sampleCardInput("century");
    const square = renderPackCard(input, "square", true, PACK_DEFAULT_TOKENS, false);
    expect(square).not.toContain("pack-landscape-fallback");
    expect(square).toContain("width:1080px;height:1080px");
  });
});
