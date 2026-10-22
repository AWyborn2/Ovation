import { describe, expect, it } from "vitest";
import type { TemplateDocumentV2, TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import { templateDocumentErrors } from "@workspace/scorecard/kind-templates";
import { nativiseVectors } from "./nativise";

const slash =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200" preserveAspectRatio="none">' +
  '<polygon points="75,0 100,0 25,200 0,200" fill="var(--gold)" fill-opacity="0.5"/></svg>';

const doc = (layers: TemplateLayerV2[]): TemplateDocumentV2 =>
  ({ formatVersion: 2, pages: { card: { layers } } }) as TemplateDocumentV2;

describe("nativiseVectors", () => {
  it("turns a simple vector into a shape with the same id and settings, on every size", () => {
    const d = doc([
      {
        id: "slash",
        kind: "vector",
        svg: slash,
        sizes: ["square", "story"],
        geometry: {
          square: { x: 80, y: 0, w: 10, h: 20 },
          story: { x: 80, y: 0, w: 10, h: 12 },
        },
        style: { opacity: 0.8, blend: "screen" },
        showWhen: { photo: true },
      },
    ]);
    expect(nativiseVectors(d)).toEqual({ shapes: 1, vectors: 0, recoloured: 0 });
    const [shape] = d.pages.card!.layers;
    expect(shape).toEqual({
      id: "slash",
      kind: "shape",
      sizes: ["square", "story"],
      geometry: {
        square: { x: 80, y: 0, w: 10, h: 20 },
        story: { x: 80, y: 0, w: 10, h: 12 },
      },
      // The vector's own opacity times its polygon's; the blend kept.
      style: {
        blend: "screen",
        fill: "var(--gold)",
        clip: {
          polygon: [
            [75, 0],
            [100, 0],
            [25, 100],
            [0, 100],
          ],
        },
        opacity: 0.4,
      },
      showWhen: { photo: true },
    });
    expect(templateDocumentErrors(d, "milestone")).toEqual([]);
  });

  it("finds vectors inside groups, and gives a complex one a colour per element", () => {
    const stripes =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><g fill="var(--gold)">' +
      '<path d="M0 0L1 1"/><path d="M2 2L3 3"/></g></svg>';
    const d = doc([
      {
        id: "grp",
        kind: "group",
        geometry: { square: { x: 0, y: 0, w: 100, h: 100 } },
        children: [
          {
            id: "art",
            kind: "vector",
            svg: stripes,
            geometry: { square: { x: 0, y: 0, w: 100, h: 100 } },
          },
        ],
      } as TemplateLayerV2,
    ]);
    expect(nativiseVectors(d)).toEqual({ shapes: 0, vectors: 1, recoloured: 1 });
    const art = (d.pages.card!.layers[0] as { children: Array<{ svg: string }> }).children[0]!;
    expect(art.svg).toContain('<path d="M0 0L1 1" fill="var(--gold)"/>');
  });

  it("leaves a v1 document alone", () => {
    expect(nativiseVectors({ layers: [] } as unknown as TemplateDocumentV2)).toEqual({
      shapes: 0,
      vectors: 0,
      recoloured: 0,
    });
  });
});
