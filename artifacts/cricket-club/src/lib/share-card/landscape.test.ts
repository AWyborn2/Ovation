/**
 * Social Studio U11 — the landscape (1200×630) format: format selection,
 * the letterbox fallback for designs without a landscape layout, exact
 * native size, and square output unchanged.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type * as Templates from "../pack-render/templates";

// Since U13 every registered pack ships a landscape layout, so no real design
// exercises the letterbox fallback any more. The fallback stays (a future pack
// or design may omit landscape); this switch lets a test make the renderer
// treat designs as landscape-less to keep it covered.
const flags = vi.hoisted(() => ({ noLandscape: false }));
vi.mock("../pack-render/templates", async (importOriginal) => {
  const mod = await importOriginal<typeof Templates>();
  return {
    ...mod,
    hasLandscapeFormat: (formats: Parameters<typeof mod.hasLandscapeFormat>[0]) =>
      flags.noLandscape ? false : mod.hasLandscapeFormat(formats),
  };
});

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

  afterEach(() => {
    flags.noLandscape = false;
  });

  it("letterboxes the square design when a design has no landscape layout", () => {
    const input = sampleCardInput("century");
    flags.noLandscape = true;
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

  it("every registered pack ships a landscape layout for every design (U12/U13)", () => {
    for (const pack of listPackManifests()) {
      for (const d of pack.designs) {
        expect(hasLandscapeFormat(d.template.formats), `${pack.packId}/${d.designKey}`).toBe(true);
      }
    }
  });

  it("renders a pack's own landscape layout natively at 1200×630 (no letterbox)", () => {
    const html = renderPackCard(
      sampleCardInput("century"),
      "landscape",
      true,
      PACK_DEFAULT_TOKENS,
      false,
      null,
      "broadcast-dark-v1",
    );
    expect(html).not.toContain("pack-landscape-fallback");
    expect(html).toContain("width:1200px;height:630px");
    expect(html).not.toMatch(/transform:scale\(/);
  });

  it("leaves square output unchanged by the new format", () => {
    const input = sampleCardInput("century");
    const square = renderPackCard(input, "square", true, PACK_DEFAULT_TOKENS, false);
    expect(square).not.toContain("pack-landscape-fallback");
    expect(square).toContain("width:1080px;height:1080px");
  });
});
