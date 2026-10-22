import { describe, expect, it } from "vitest";
import type { TemplateDocumentV2, TemplateLayerV2 } from "./format";
import { layerSignature, signDocument } from "./signature";
import { templateDocumentErrors } from "./validate";

const band = (over: Partial<TemplateLayerV2> = {}): TemplateLayerV2 =>
  ({
    id: "band",
    kind: "shape",
    geometry: { square: { x: 0, y: 80, w: 100, h: 6 } },
    style: {
      fill: "var(--gold)",
      clip: {
        polygon: [
          [0, 0],
          [100, 0],
          [96, 100],
          [0, 100],
        ],
      },
    },
    ...over,
  }) as TemplateLayerV2;

describe("layerSignature", () => {
  it("is the design, not the place: the same band anywhere signs the same", () => {
    const sig = layerSignature(band());
    expect(sig).toMatch(/^shape:[0-9a-z]{14}$/);
    expect(
      layerSignature(
        band({
          id: "other",
          name: "Gold band",
          sizes: ["square"],
          geometry: { story: { x: 5, y: 10, w: 50, h: 3 } },
          showWhen: { photo: true },
          link: "x",
          sig: "shape:stale",
        }),
      ),
    ).toBe(sig);
  });

  it("changes with what's drawn, whatever order the keys are in", () => {
    const sig = layerSignature(band());
    expect(layerSignature(band({ style: { fill: "var(--ink)" } }))).not.toBe(sig);
    const reordered = {
      style: {
        clip: {
          polygon: [
            [0, 0],
            [100, 0],
            [96, 100],
            [0, 100],
          ],
        },
        fill: "var(--gold)",
      },
      kind: "shape",
      geometry: {},
      id: "z",
    } as unknown as TemplateLayerV2;
    expect(layerSignature(reordered)).toBe(sig);
  });

  it("signs a group by its children's designs", () => {
    const group = (child: TemplateLayerV2) =>
      ({ id: "g", kind: "group", geometry: {}, children: [child] }) as TemplateLayerV2;
    expect(layerSignature(group(band()))).toBe(layerSignature(group(band({ id: "moved" }))));
    expect(layerSignature(group(band()))).not.toBe(
      layerSignature(group(band({ style: { fill: "red" } }))),
    );
  });
});

describe("signDocument", () => {
  it("signs every layer, children too, once; the result passes the validator", () => {
    const doc = {
      formatVersion: 2,
      pages: {
        card: {
          layers: [
            band(),
            {
              id: "g",
              kind: "group",
              geometry: { square: { x: 0, y: 0, w: 100, h: 100 } },
              children: [band({ id: "inner" })],
            },
          ],
        },
      },
    } as TemplateDocumentV2;
    expect(signDocument(doc)).toBe(3);
    expect(signDocument(doc)).toBe(0);
    const [outer, group] = doc.pages.card!.layers as Array<
      TemplateLayerV2 & { children?: TemplateLayerV2[] }
    >;
    expect(outer!.sig).toBe(group!.children![0]!.sig);
    expect(templateDocumentErrors(doc, "milestone")).toEqual([]);
  });

  it("leaves a v1 document alone", () => {
    const v1 = { layers: [band()] } as unknown as TemplateDocumentV2;
    expect(signDocument(v1)).toBe(0);
    expect((v1 as unknown as { layers: TemplateLayerV2[] }).layers[0]!.sig).toBeUndefined();
  });
});
