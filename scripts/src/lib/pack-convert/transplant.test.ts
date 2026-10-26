import { describe, expect, it } from "vitest";
import type { TemplateDocumentV2, TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import { transplant } from "./transplant";

const doc = (layers: TemplateLayerV2[]): TemplateDocumentV2 =>
  ({ formatVersion: 2, pages: { card: { layers } } }) as TemplateDocumentV2;
const box = { x: 5, y: 5, w: 50, h: 10 };
const text = (id: string, sizes: string[], over: Partial<TemplateLayerV2> = {}) =>
  ({
    id,
    kind: "text",
    content: "{{playerName}}",
    sizes,
    geometry: Object.fromEntries(sizes.map((s) => [s, box])),
    ...over,
  }) as TemplateLayerV2;

describe("transplant", () => {
  it("links per-size copies matched to one fresh link group, whatever their ids", () => {
    const polished = doc([
      text("card-l3", ["square", "portrait"], { style: { color: "#fff", fontSize: 5 } }),
      text("card-l7", ["story", "landscape"], { style: { fontSize: 7 } }),
    ]);
    const fresh = doc([
      text("card-l2", ["square", "portrait"], { link: "card-l2" }),
      text("card-l3", ["story", "landscape"], { link: "card-l2" }),
    ]);
    expect(transplant(polished, fresh)).toEqual({
      matched: 2,
      unmatched: 0,
      links: 1,
      linkedLayers: 2,
      skews: 0,
    });
    const [a, b] = polished.pages.card!.layers;
    expect([a!.link, b!.link]).toEqual(["card-l2", "card-l2"]);
    // The polish stays.
    expect(a!.style).toEqual({ color: "#fff", fontSize: 5 });
  });

  it("leaves a layer the polish moved or changed as it was", () => {
    const polished = doc([
      text("card-l3", ["square"]),
      text("card-l4", ["story"], { geometry: { story: { ...box, y: 40 } } }), // moved
      text("card-l5", ["landscape"], { content: "{{opponent}}" }), // other content
    ]);
    const fresh = doc([text("card-l3", ["square", "story", "landscape"])]);
    expect(transplant(polished, fresh)).toMatchObject({ matched: 1, unmatched: 2, links: 0 });
    expect(polished.pages.card!.layers.every((l) => !l.link)).toBe(true);
  });

  it("doesn't link two layers on the same size, even matched to one fresh layer", () => {
    const polished = doc([text("a", ["square"]), text("b", ["square"])]);
    expect(transplant(polished, doc([text("card-l1", ["square", "story"])]))).toMatchObject({
      matched: 2,
      links: 0,
    });
  });

  it("turns clipped slashes into their own boxes with the skew, and links the copies", () => {
    const clipped = (id: string, size: "square" | "story", y: number) =>
      ({
        id,
        kind: "shape",
        sizes: [size],
        geometry: { [size]: { x: 79.37, y, w: 10.22, h: 17.96 } },
        style: {
          fill: "var(--gold)",
          clip: {
            polygon: [
              [70.66, 0],
              [100, 0],
              [29.34, 100],
              [0, 100],
            ],
          },
        },
      }) as TemplateLayerV2;
    const slanted = {
      id: "fixture-l2",
      kind: "shape",
      geometry: {
        square: { x: 83.03, y: -4, w: 2.96, h: 17.96 },
        story: { x: 83.03, y: 10, w: 2.96, h: 17.96 },
      },
      style: { fill: "var(--gold)", skew: { x: -22, y: 0 } },
    } as TemplateLayerV2;
    const polished = doc([clipped("a", "square", -4), clipped("b", "story", 10)]);
    expect(transplant(polished, doc([slanted]))).toEqual({
      matched: 2,
      unmatched: 0,
      links: 1,
      linkedLayers: 2,
      skews: 2,
    });
    const [a, b] = polished.pages.card!.layers;
    expect(a).toMatchObject({
      link: "fixture-l2",
      geometry: { square: { x: 83.03, y: -4, w: 2.96, h: 17.96 } },
      style: { fill: "var(--gold)", skew: { x: -22, y: 0 } },
    });
    expect(a!.style?.clip).toBeUndefined();
    expect(b!.geometry.story).toEqual({ x: 83.03, y: 10, w: 2.96, h: 17.96 });
  });
});
