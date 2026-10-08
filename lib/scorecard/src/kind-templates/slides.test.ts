import { describe, expect, it } from "vitest";
import type { TemplateLayerBase } from "./document";
import {
  evenParts,
  layoutBlocksAutomation,
  MAX_CAROUSEL_SLIDES,
  planTemplateSlides,
} from "./slides";

/** A square rows layer holding `capacity` 10%-high rows. */
const doc = (capacity: number, repeat = "matches") => ({
  layers: [
    {
      id: "results",
      kind: "rows",
      geometry: { square: { x: 0, y: 0, w: 100, h: capacity * 10 } },
      rows: { repeat, rowHeight: 10, cells: [] },
    } satisfies TemplateLayerBase,
  ],
});

const rows = (n: number, junior = false) =>
  Array.from({ length: n }, (_, i) => ({
    grade: `G${i + 1}`,
    ...(junior ? { junior: true } : {}),
  }));

describe("evenParts", () => {
  it("splits into sizes that differ by at most one", () => {
    expect(evenParts(9, 2)).toEqual([5, 4]);
    expect(evenParts(10, 3)).toEqual([4, 3, 3]);
  });
});

describe("planTemplateSlides (KTD13)", () => {
  it("keeps a card whose list fits on one slide, unchanged", () => {
    const input = { kind: "weekendWrap", matches: rows(4) };
    const plan = planTemplateSlides(input, doc(5), "square");
    expect(plan.slides).toEqual([{ key: "single", input, page: 1, of: 1 }]);
    expect(plan.warning).toBeUndefined();
  });

  it("spills nine rows at capacity five onto two even slides (AE3)", () => {
    const plan = planTemplateSlides({ kind: "weekendWrap", matches: rows(9) }, doc(5), "square");
    expect(plan.slides.map((s) => (s.input.matches as unknown[]).length)).toEqual([5, 4]);
    expect(plan.slides.map((s) => [s.page, s.of])).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("never puts junior and senior rows on one slide", () => {
    const input = { kind: "weekendWrap", matches: [...rows(3), ...rows(3, true)] };
    const plan = planTemplateSlides(input, doc(5), "square");
    expect(plan.slides).toHaveLength(2);
    expect(plan.slides[0].input.junior).toBeUndefined();
    expect(plan.slides[1].input.junior).toBe(true);
    expect(
      (plan.slides[1].input.matches as Array<{ junior?: boolean }>).every((r) => r.junior),
    ).toBe(true);
  });

  it("caps at ten slides and warns when more were needed", () => {
    const plan = planTemplateSlides({ kind: "ladder", rows: rows(56) }, doc(5, "rows"), "square");
    expect(plan.slides).toHaveLength(MAX_CAROUSEL_SLIDES);
    expect(plan.warning).toMatchObject({ reason: "slides", size: "square", layerId: "results" });
  });

  it("splits junior rows by their grade label, even when the list fits", () => {
    const input = {
      kind: "roundFixtures",
      matches: [{ grade: "A Grade" }, { grade: "Colts" }, { gradeLabel: "Under 13" }],
    };
    const plan = planTemplateSlides(input, doc(5), "square");
    expect(plan.slides).toHaveLength(2);
    expect((plan.slides[0].input.matches as unknown[]).length).toBe(2);
    expect(plan.slides[0].input.junior).toBeUndefined();
    expect(plan.slides[1].input.junior).toBe(true);
  });

  it("marks an all-junior list that fits as a junior card", () => {
    const plan = planTemplateSlides(
      { kind: "roundFixtures", matches: [{ grade: "U15s" }] },
      doc(5),
      "square",
    );
    expect(plan.slides).toHaveLength(1);
    expect(plan.slides[0].input.junior).toBe(true);
  });

  it("warns when not even one row fits the list's box", () => {
    const plan = planTemplateSlides({ kind: "weekendWrap", matches: rows(3) }, doc(0), "square");
    expect(plan.warning).toMatchObject({ reason: "overflow", layerId: "results" });
  });

  it("is one slide when the template has no rows layer on that size", () => {
    const plan = planTemplateSlides({ kind: "weekendWrap", matches: rows(9) }, doc(5), "story");
    expect(plan.slides).toHaveLength(1);
  });
});

describe("layoutBlocksAutomation (KTD10)", () => {
  it("never blocks a pack draft", () => {
    expect(
      layoutBlocksAutomation({
        templateVersion: null,
        layoutCheckPending: true,
        layoutWarnings: null,
      }),
    ).toBe(false);
  });

  it("blocks a templated draft until it has been checked", () => {
    expect(
      layoutBlocksAutomation({
        templateVersion: 2,
        layoutCheckPending: true,
        layoutWarnings: null,
      }),
    ).toBe(true);
  });

  it("blocks a templated draft with a warning on any size, and not one without", () => {
    expect(
      layoutBlocksAutomation({
        templateVersion: 2,
        layoutCheckPending: false,
        layoutWarnings: { square: [], story: [{}] },
      }),
    ).toBe(true);
    expect(
      layoutBlocksAutomation({
        templateVersion: 2,
        layoutCheckPending: false,
        layoutWarnings: { square: [] },
      }),
    ).toBe(false);
  });
});
