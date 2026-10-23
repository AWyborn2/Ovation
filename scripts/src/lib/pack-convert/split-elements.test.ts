import { describe, expect, it } from "vitest";
import type { TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import type { MappedLayer } from "./map";
import { nativeElement, splitDocument, type ElementLayer } from "./split-elements";

const element = (over: Partial<ElementLayer> = {}): ElementLayer =>
  ({
    id: "rule",
    kind: "element",
    element: { id: "ck.tricolour-rule" },
    geometry: {
      square: { x: 6, y: 87, w: 88, h: 0.8 },
      story: { x: 6, y: 90, w: 88, h: 0.8 },
    },
    ...over,
  }) as ElementLayer;

const shape = (sig: string, fill: string, box: MappedLayer["box"]): MappedLayer => ({
  sig,
  layer: { kind: "shape", style: { fill } } as MappedLayer["layer"],
  box,
  element: 1,
});

describe("nativeElement", () => {
  it("one native layer takes the element's id and name", () => {
    const [layer] = nativeElement(
      element({
        id: "crest",
        element: { id: "ck.crest" },
        geometry: { square: { x: 6, y: 6, w: 10, h: 10 } },
      }),
      [
        {
          size: "square",
          layers: [shape("image:clubLogo#0", "red", { x: 6, y: 6, w: 10, h: 10 })],
        },
      ],
    );
    expect(layer).toMatchObject({ id: "crest", name: "Crest", kind: "shape", sizes: ["square"] });
  });

  it("several become a group named for the element, its box their union, on each size", () => {
    const at = (x: number, w: number, y: number) => ({ x, y, w, h: 0.8 });
    const [group] = nativeElement(element({ animation: { kind: "fade" } }), [
      {
        size: "square",
        layers: [
          shape("shape:p#0", "var(--ck-p)", at(6, 52, 87)),
          shape("shape:s#0", "var(--ck-s)", at(64, 30, 87)),
        ],
      },
      {
        size: "story",
        layers: [
          shape("shape:p#0", "var(--ck-p)", at(6, 52, 90)),
          shape("shape:s#0", "var(--ck-s)", at(64, 30, 90)),
        ],
      },
    ]) as Array<TemplateLayerV2 & { children: TemplateLayerV2[] }>;
    expect(group).toMatchObject({
      id: "rule",
      name: "Tricolour rule",
      kind: "group",
      animation: { kind: "fade" },
      sizes: ["square", "story"],
      geometry: {
        square: { x: 6, y: 87, w: 88, h: 0.8 },
        story: { x: 6, y: 90, w: 88, h: 0.8 },
      },
    });
    expect(group!.children.map((c) => c.id)).toEqual(["rule-l1", "rule-l2"]);
    expect(Object.keys(group!.children[0]!.geometry)).toEqual(["square", "story"]);
  });
});

describe("splitDocument", () => {
  it("replaces element layers in place and makes a v1 document format v2", async () => {
    const doc = {
      layers: [
        { id: "title", kind: "text", content: "HI", geometry: {} } as TemplateLayerV2,
        element(),
        element({ id: "gone", element: { id: "ck.unknown" } }),
      ],
    };
    const { document, split } = await splitDocument(doc, "century", async (layer) =>
      layer.id === "rule"
        ? [{ id: "rule", kind: "shape", style: { fill: "var(--ck-p)" }, geometry: {} }]
        : [],
    );
    expect(split).toBe(1);
    expect(document.formatVersion).toBe(2);
    expect(document.palettes).toEqual(["club-kit"]);
    // An element nothing was captured for stays as it was.
    expect(document.pages.card!.layers.map((l) => `${l.id}:${l.kind}`)).toEqual([
      "title:text",
      "rule:shape",
      "gone:element",
    ]);
  });

  it("keeps a v2 document's other pages", async () => {
    const doc = {
      formatVersion: 2 as const,
      pages: {
        fixture: { layers: [element()] },
        title: {
          layers: [{ id: "t", kind: "text", content: "T", geometry: {} } as TemplateLayerV2],
        },
      },
    };
    const { document } = await splitDocument(doc, "matchDay", async () => [
      { id: "rule", kind: "shape", style: { fill: "red" }, geometry: {} },
    ]);
    expect(Object.keys(document.pages)).toEqual(["fixture", "title"]);
    expect(document.pages.fixture!.layers[0]!.kind).toBe("shape");
    expect(document.palettes).toBeUndefined();
  });
});
