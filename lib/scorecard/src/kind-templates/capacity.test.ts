import { describe, expect, it } from "vitest";
import { pageRowsCapacities, pageRowsCapacity } from "./capacity";
import type { TemplateDocumentV2, TemplateLayerV2 } from "./format";

const rows = (id: string, over: Partial<TemplateLayerV2> = {}): TemplateLayerV2 =>
  ({
    id,
    kind: "rows",
    // 40% of a square's 1080 px is 432 px; rows are 10% of the width (108 px), gap 0.
    geometry: { square: { x: 0, y: 0, w: 100, h: 40 }, story: { x: 0, y: 0, w: 100, h: 60 } },
    rows: { repeat: "dayRows", rowHeight: 10, cells: [{ field: "opposition", x: 0, w: 100 }] },
    ...over,
  }) as TemplateLayerV2;

const page = (layers: TemplateLayerV2[]): TemplateDocumentV2 => ({
  formatVersion: 2,
  pages: { day: { layers } },
});

describe("pageRowsCapacity (T1.10)", () => {
  it("reads the rows layer's geometry on each size", () => {
    const doc = page([rows("r")]);
    expect(pageRowsCapacity(doc, "day", "square", "dayRows")).toBe(4);
    // Story: 60% of 1920 px is 1152 px, so 10 rows of 108 px.
    expect(pageRowsCapacity(doc, "day", "story", "dayRows")).toBe(10);
    expect(pageRowsCapacities(doc, "day", "dayRows")).toEqual({
      square: 4,
      story: 10,
      portrait: 0,
      landscape: 0,
    });
  });

  it("finds a rows layer inside a stack group, on the sizes its group is on", () => {
    const group = {
      id: "g",
      kind: "group",
      sizes: ["square"],
      geometry: { square: { x: 0, y: 0, w: 100, h: 100 } },
      stack: { direction: "column" },
      children: [rows("r")],
    } as TemplateLayerV2;
    const doc = page([group]);
    expect(pageRowsCapacity(doc, "day", "square", "dayRows")).toBe(4);
    expect(pageRowsCapacity(doc, "day", "story", "dayRows")).toBeNull();
  });

  it("is null without a rows layer for the repeat, and skips hidden layers", () => {
    expect(pageRowsCapacity(page([rows("r")]), "day", "square", "sponsors")).toBeNull();
    expect(
      pageRowsCapacity(page([rows("r", { hidden: true })]), "day", "square", "dayRows"),
    ).toBeNull();
    expect(pageRowsCapacity(page([rows("r")]), "title", "square", "dayRows")).toBeNull();
  });
});
