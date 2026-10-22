/** Inserting a library element as native layers (editable-elements plan, D3). */
import { describe, expect, it } from "vitest";
import type { FreeLayer } from "@/lib/pack-render";
import { boxAt, elementBounds, elementLayers } from "../element-insert";

const band = {
  id: "e1",
  kind: "shape",
  sizes: ["square", "story"],
  sig: "shape:abc",
  link: "k1",
  geometry: {
    square: { x: 0, y: 80, w: 100, h: 10 },
    story: { x: 0, y: 85, w: 100, h: 6 },
  },
  style: { fill: "var(--gold)" },
};

const chip = {
  id: "e2",
  kind: "group",
  link: "k1",
  geometry: { square: { x: 6, y: 6, w: 20, h: 8 } },
  children: [
    { id: "e2-1", kind: "shape", geometry: { square: { x: 6, y: 6, w: 20, h: 8 } } },
    {
      id: "e2-2",
      kind: "text",
      content: "{{grade}}",
      geometry: { square: { x: 7, y: 7, w: 18, h: 6 } },
    },
  ],
};

describe("elementLayers", () => {
  it("copies the layers with fresh ids, children too, and drops the library's sizes and sig", () => {
    const [copy] = elementLayers({ layers: [band] }, "square", 5);
    expect(copy!.id).not.toBe("e1");
    expect(copy!.sizes).toBeUndefined();
    expect((copy as { sig?: string }).sig).toBeUndefined();
    expect(copy!.geometry).toEqual(band.geometry);
    expect(copy!.editedAt).toEqual({ square: 5 });
    expect(copy!.style).toEqual(band.style);

    const [group] = elementLayers({ layers: [chip] }, "square");
    const children = (group as FreeLayer & { children: FreeLayer[] }).children;
    expect(children.map((c) => c.id)).not.toContain("e2-1");
    expect(new Set([group!.id, ...children.map((c) => c.id)]).size).toBe(3);
  });

  it("gives linked layers one fresh link between them", () => {
    const layers = elementLayers({ layers: [band, chip] }, "square") as Array<
      FreeLayer & { link?: string }
    >;
    expect(layers[0]!.link).toBeDefined();
    expect(layers[0]!.link).not.toBe("k1");
    expect(layers[1]!.link).toBe(layers[0]!.link);
  });

  it("borrows the nearest designed size's box at a size the element lacks", () => {
    const [onPortrait] = elementLayers({ layers: [band] }, "portrait");
    expect(onPortrait!.geometry.portrait).toEqual(band.geometry.square);
    const [onLandscape] = elementLayers({ layers: [band] }, "landscape");
    expect(onLandscape!.geometry.landscape).toEqual(band.geometry.square);
    const [group] = elementLayers({ layers: [chip] }, "story");
    const child = (group as FreeLayer & { children: FreeLayer[] }).children[0]!;
    expect(child.geometry.story).toEqual(chip.children[0]!.geometry.square);
  });

  it("leaves out a layer with no box at all", () => {
    expect(elementLayers({ layers: [{ id: "x", kind: "shape", geometry: {} }] }, "square")).toEqual(
      [],
    );
    expect(elementLayers({}, "square")).toEqual([]);
  });
});

describe("boxAt and elementBounds", () => {
  it("find a layer's box and the box around several", () => {
    expect(boxAt(band as unknown as FreeLayer, "story")).toEqual(band.geometry.story);
    const layers = elementLayers({ layers: [band, chip] }, "square");
    expect(elementBounds(layers, "square")).toEqual({ x: 0, y: 6, w: 100, h: 84 });
    expect(elementBounds([], "square")).toBeNull();
  });
});
