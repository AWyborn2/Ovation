/**
 * The AI's format guide can't drift from the rules it's checked against
 * (T1.11): every closed list value and every v2 range appears in it.
 */
import { describe, expect, it } from "vitest";
import {
  BLEND_MODES,
  BORDER_STYLES,
  COLOUR_TOKENS,
  DERIVED_PALETTES,
  FILTER_PRESETS,
  LAYER_KINDS_V2,
  MOTION_EASINGS,
  MOTION_IN_PRESETS,
  MOTION_LOOP_PRESETS,
  OVERLAY_KINDS,
  STACK_ALIGNS,
  STACK_DIRECTIONS,
  STACK_JUSTIFIES,
} from "./format";
import { pageCatalogueGuide, templateFormatGuide } from "./format-guide";
import { kindPages } from "./pages";
import { pageTokens } from "./page-tokens";
import { TEMPLATE_CARD_KINDS } from "./fields";
import { SVG_ELEMENTS } from "./svg";
import { MAX_PAGE_LAYERS, MAX_V2_DOCUMENT_LAYERS, V2_RANGES } from "./validate";

const guide = templateFormatGuide();

describe("templateFormatGuide", () => {
  it.each(
    Object.entries({
      BLEND_MODES,
      BORDER_STYLES,
      COLOUR_TOKENS,
      DERIVED_PALETTES,
      FILTER_PRESETS,
      LAYER_KINDS_V2,
      MOTION_EASINGS,
      MOTION_IN_PRESETS,
      MOTION_LOOP_PRESETS,
      OVERLAY_KINDS,
      STACK_ALIGNS,
      STACK_DIRECTIONS,
      STACK_JUSTIFIES,
      SVG_ELEMENTS,
    }),
  )("lists every value of %s", (_name, values) => {
    for (const value of values) expect(guide).toContain(String(value));
  });

  it("quotes every v2 range and the layer limits", () => {
    for (const [lo, hi] of Object.values(V2_RANGES)) expect(guide).toContain(`${lo}–${hi}`);
    expect(guide).toContain(
      `At most ${MAX_PAGE_LAYERS} layers on a page and ${MAX_V2_DOCUMENT_LAYERS}`,
    );
  });
});

describe("pageCatalogueGuide", () => {
  it.each(TEMPLATE_CARD_KINDS)("lists every page, field and list of %s", (kind) => {
    const text = pageCatalogueGuide(kind);
    for (const page of kindPages(kind)) {
      expect(text).toContain(`## Page ${page}`);
      const cat = pageTokens(kind, page)!;
      for (const f of cat.fields) expect(text).toContain(f.key);
      for (const i of cat.images) expect(text).toContain(i.key);
      for (const r of cat.repeats) expect(text).toContain(`List ${r.key}`);
    }
  });
});
