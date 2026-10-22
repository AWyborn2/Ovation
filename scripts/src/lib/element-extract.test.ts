/**
 * Element extraction (editable-elements plan, D2): which layers are
 * decorations, how copies collapse into one element, and where each lands.
 */
import { describe, expect, it } from "vitest";
import {
  PER_CATEGORY,
  addPieces,
  categorise,
  colourWord,
  decorationSignature,
  extractElements,
  type LookInput,
} from "./element-extract";

type Box = { x: number; y: number; w: number; h: number };
const at = (b: Box, size = "square") => ({ [size]: b });
const shape = (id: string, geometry: Record<string, Box>, style: Record<string, unknown> = {}) => ({
  id,
  kind: "shape",
  geometry,
  style: { fill: "var(--gold)", ...style },
});
const look = (slug: string, layers: unknown[], kind = "milestone"): LookInput => ({
  slug,
  name: slug,
  templates: [{ kind, document: { formatVersion: 2, pages: { card: { layers } } } }],
});

const slash = {
  polygon: [
    [30, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ],
};

describe("categorise", () => {
  const cat = (layer: unknown, page = "card", crests: Box[] = []) =>
    categorise(layer as never, page, crests)?.category ?? null;

  it("sorts decorations by their box and style", () => {
    expect(cat(shape("a", at({ x: 6, y: 40, w: 30, h: 1 })))).toBe("rules");
    expect(cat(shape("a", at({ x: 6, y: 40, w: 1, h: 20 })))).toBe("rules");
    expect(cat(shape("a", at({ x: 6, y: 40, w: 12, h: 6 }), { radius: 3 }))).toBe("badges");
    expect(cat(shape("a", at({ x: 50, y: 0, w: 50, h: 100 }), { clip: slash }))).toBe("bands");
    expect(cat(shape("a", at({ x: 0, y: 80, w: 100, h: 10 })))).toBe("bands");
    expect(
      cat(shape("a", at({ x: 4, y: 4, w: 92, h: 92 }), { fill: undefined, border: { width: 1 } })),
    ).toBe("frames");
    const fade = { type: "linear", stops: [{ color: "var(--ink)" }, { color: "#00000000" }] };
    expect(cat(shape("a", at({ x: 0, y: 50, w: 100, h: 50 }), { fill: fade }))).toBe("glows");
    const radial = { type: "radial", stops: [{ color: "var(--gold)" }, { color: "#000" }] };
    expect(cat(shape("a", at({ x: 0, y: 0, w: 100, h: 100 }), { fill: radial }))).toBe("glows");
  });

  it("finds crest frames, sponsor strips and data blocks", () => {
    const crest = { x: 40, y: 10, w: 20, h: 20 };
    expect(
      cat(shape("a", at({ x: 37, y: 7, w: 26, h: 26 }), { radius: 13 }), "card", [crest]),
    ).toBe("crest-frames");
    expect(cat(shape("a", at({ x: 0, y: 85, w: 100, h: 15 })), "sponsors")).toBe("sponsor-strips");
    const block = {
      id: "g",
      kind: "group",
      geometry: at({ x: 6, y: 60, w: 40, h: 10 }),
      children: [shape("bg", at({ x: 0, y: 0, w: 100, h: 100 })), { id: "t", kind: "text" }],
    };
    expect(cat(block)).toBe("data-blocks");
  });

  it("treats a whole-card vector as a pattern and a polygon vector as a slash", () => {
    const vector = (b: Box, svg: string) => ({ id: "v", kind: "vector", geometry: at(b), svg });
    expect(cat(vector({ x: 0, y: 0, w: 100, h: 100 }, "<svg><path d='M0 0'/></svg>"))).toBe(
      "glows",
    );
    expect(
      cat(vector({ x: 5, y: 5, w: 10, h: 18 }, "<svg><polygon points='0,0 1,1'/></svg>")),
    ).toBe("bands");
  });

  it("leaves out backgrounds and specks", () => {
    expect(cat(shape("a", at({ x: 0, y: 0, w: 100, h: 100 })))).toBeNull();
    expect(cat(shape("a", at({ x: 10, y: 10, w: 1.5, h: 1.5 })))).toBeNull();
    expect(cat({ id: "a", kind: "shape" })).toBeNull();
  });
});

describe("decorationSignature", () => {
  it("ignores ids, positions, exact sizes and colours, but not what you see", () => {
    const a = shape("a", at({ x: 50, y: 0, w: 50, h: 100 }), { clip: slash });
    const b = shape("b", at({ x: 52, y: 0, w: 48, h: 100 }, "landscape"), {
      fill: "var(--panel)",
      clip: {
        polygon: [
          [27, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
      },
    });
    expect(decorationSignature(a as never)).toBe(decorationSignature(b as never));
    const band = shape("c", at({ x: 0, y: 80, w: 100, h: 10 }), { clip: slash });
    expect(decorationSignature(band as never)).not.toBe(decorationSignature(a as never));
    const clear = shape("d", at({ x: 50, y: 0, w: 50, h: 100 }), {
      fill: "#00000000",
      clip: slash,
    });
    expect(decorationSignature(clear as never)).not.toBe(decorationSignature(a as never));
  });

  it("treats a label's words alike, but not its fields", () => {
    const chip = (content: string) => ({
      id: "g",
      kind: "group",
      geometry: at({ x: 6, y: 6, w: 20, h: 6 }),
      children: [
        shape("bg", at({ x: 6, y: 6, w: 20, h: 6 })),
        { id: "t", kind: "text", content, geometry: at({ x: 7, y: 7, w: 18, h: 4 }) },
      ],
    });
    const sig = (content: string) => decorationSignature(chip(content) as never);
    expect(sig("CENTURY")).toBe(sig("MILESTONE"));
    expect(sig("{{grade}}")).not.toBe(sig("CENTURY"));
  });
});

describe("the converter's sig and link (Stream C2)", () => {
  it("don't split a decoration, and stay out of the element", () => {
    const rule = (id: string, size: string, h: number, sig: string) => ({
      ...shape(id, at({ x: 6, y: 40, w: 30, h }, size)),
      sizes: [size],
      sig,
      link: `k-${id}`,
    });
    const { files } = extractElements([
      look("kit", [rule("a", "square", 1, "shape:aaa"), rule("b", "story", 0.6, "shape:bbb")]),
    ]);
    expect(files[0]!.elements).toHaveLength(1);
    const layer = files[0]!.elements[0]!.document.layers[0] as unknown as Record<string, unknown>;
    expect(Object.keys(layer.geometry as object).sort()).toEqual(["square", "story"]);
    expect(layer.sig).toBeUndefined();
    expect(layer.link).toBeUndefined();
  });
});

describe("colourWord", () => {
  it("names brand tokens and plain colours", () => {
    expect(colourWord("var(--gold)")).toBe("Gold");
    expect(colourWord("var(--panel-2)")).toBe("Panel");
    expect(colourWord("var(--ck-chalk)")).toBe("Chalk");
    expect(colourWord("#FFFFFF")).toBe("White");
    expect(colourWord("#101010")).toBe("Dark");
    expect(colourWord(null)).toBe("Plain");
  });
});

describe("extractElements", () => {
  it("makes one element of a look's per-size copies, at every size they share a style", () => {
    const rule = (id: string, size: string, b: Box) => ({
      ...shape(id, at(b, size)),
      sizes: [size],
    });
    const { files, summary } = extractElements([
      look("kit", [
        rule("l1", "square", { x: 6, y: 40, w: 30, h: 1 }),
        rule("l2", "story", { x: 6, y: 60, w: 30, h: 0.6 }),
        rule("l3", "portrait", { x: 6, y: 50, w: 30, h: 0.8 }),
      ]),
    ]);
    expect(summary).toMatchObject({ candidates: 3, distinct: 1, kept: 1, invalid: [] });
    const [element] = files[0]!.elements;
    expect(element).toMatchObject({
      slug: "kit/rules/gold-rule",
      name: "Gold rule",
      category: "rules",
    });
    const layer = element!.document.layers[0] as unknown as Record<string, unknown>;
    expect(layer.id).toBe("e1");
    expect(Object.keys(layer.geometry as object).sort()).toEqual(["portrait", "square", "story"]);
    expect(layer.sizes).toEqual(["square", "portrait", "story"]);
    expect(element!.tags).toEqual(expect.arrayContaining(["kit", "rules", "gold", "shape"]));
  });

  it("credits an exact copy to the converted look, not the starter that borrowed it", () => {
    const band = shape("b", at({ x: 0, y: 80, w: 100, h: 10 }));
    const { files } = extractElements([
      look("club-kit-classic", [band]),
      look("club-kit", [{ ...band, id: "other" }]),
    ]);
    expect(files.map((f) => f.look)).toEqual(["club-kit"]);
  });

  it("keeps a decoration in two looks as two elements when their colours differ", () => {
    const { files } = extractElements([
      look("gold-foil", [shape("b", at({ x: 0, y: 80, w: 100, h: 10 }), { fill: "#D4AF37" })]),
      look("neon-night", [shape("b", at({ x: 0, y: 80, w: 100, h: 10 }), { fill: "#FF00AA" })]),
    ]);
    expect(files.map((f) => f.look)).toEqual(["gold-foil", "neon-night"]);
  });

  it(`keeps the ${PER_CATEGORY} most used a category, with unique names`, () => {
    const layers: unknown[] = [];
    for (let i = 0; i < PER_CATEGORY + 4; i++) {
      // Distinct proportions and clips make distinct badges; i < 3 are used twice.
      const style = {
        clip: {
          polygon: [
            [0, 0],
            [100, 0],
            [100, (i % 4) * 25],
            [0, 100],
          ],
        },
      };
      const b = { x: 6, y: 6, w: 4 + i, h: 4 + (i % 3) };
      layers.push(shape(`b${i}`, at(b), { ...style, opacity: 0.5 + i / 100 }));
      if (i < 3) layers.push(shape(`c${i}`, at(b), { ...style, opacity: 0.5 + i / 100 }));
    }
    const { files } = extractElements([look("kit", layers)]);
    const elements = files[0]!.elements;
    const names = elements.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(elements.map((e) => e.slug)).size).toBe(elements.length);
    expect(elements.filter((e) => e.category === "badges").length).toBeLessThanOrEqual(
      PER_CATEGORY,
    );
  });

  it("uses a starter layer's own name, and leaves out text, photos and the crest", () => {
    const { files } = extractElements([
      look("clubhouse", [
        { ...shape("x", at({ x: 6, y: 90, w: 88, h: 0.5 })), name: "Footer rule" },
        {
          id: "t",
          kind: "text",
          content: "{{clubName}}",
          geometry: at({ x: 0, y: 0, w: 50, h: 5 }),
        },
        { id: "p", kind: "photo", geometry: at({ x: 0, y: 0, w: 50, h: 50 }) },
        {
          id: "i",
          kind: "image",
          content: "{{clubLogo}}",
          geometry: at({ x: 0, y: 0, w: 9, h: 9 }),
        },
      ]),
    ]);
    expect(files[0]!.elements.map((e) => e.name)).toEqual(["Footer rule"]);
  });

  it("records the derived palettes an element's colours use", () => {
    const { files } = extractElements([
      look("club-kit", [
        shape("b", at({ x: 0, y: 80, w: 100, h: 10 }), { fill: "var(--ck-chalk)" }),
      ]),
    ]);
    expect(files[0]!.elements[0]!.document.palettes).toEqual(["club-kit"]);
  });
});

describe("addPieces", () => {
  const piece = (id: string, label: string, layer: unknown) => ({
    id,
    label,
    keywords: "chip label type",
    layers: [layer],
  });

  it("adds the panel's pieces to the look, named as the panel named them", () => {
    const { files } = extractElements([look("club-kit", [])]);
    const r = addPieces(
      files,
      [
        piece(
          "ck.trim",
          "Jumper trim — stripe",
          shape("t", at({ x: 60, y: 0, w: 20, h: 100 }), { fill: "var(--ck-chalk)" }),
        ),
      ],
      "club-kit",
    );
    expect(r).toMatchObject({ added: ["ck.trim"], duplicates: [], invalid: [] });
    const [element] = files.find((f) => f.look === "club-kit")!.elements;
    expect(element).toMatchObject({
      slug: "club-kit/bands/jumper-trim-stripe",
      name: "Jumper trim, stripe",
      category: "bands",
    });
    expect(element!.tags).toEqual(expect.arrayContaining(["club kit", "chip", "label"]));
    expect(element!.document.palettes).toEqual(["club-kit"]);
    expect((element!.document.layers[0] as { id: string }).id).toBe("e1");
  });

  it("leaves out a piece the extraction already found", () => {
    const rule = shape("r", at({ x: 6, y: 86, w: 88, h: 1 }));
    const { files } = extractElements([look("club-kit-classic", [rule])]);
    const r = addPieces(files, [piece("ck.tricolour-rule", "Tricolour rule", rule)], "club-kit");
    expect(r.duplicates).toEqual(["ck.tricolour-rule"]);
    expect(files.find((f) => f.look === "club-kit")?.elements ?? []).toEqual([]);
  });
});

describe("faint decorations", () => {
  const sideRule = (opacity: number, width: number) =>
    shape("h", at({ x: 6, y: 87, w: 88, h: 6 }), {
      fill: "#00000000",
      border: { width, color: "var(--gold)", sides: ["top"] },
      opacity,
    });

  it("leaves out what's too faint to see", () => {
    const { files, summary } = extractElements([look("gold-foil", [sideRule(0.35, 0.09)])]);
    expect(summary.faint).toBe(1);
    expect(files).toEqual([]);
  });

  it("files a clear box drawn by one border side as a rule, named for the border", () => {
    const { files } = extractElements([look("gold-foil", [sideRule(1, 0.3)])]);
    expect(files[0]!.elements[0]).toMatchObject({ category: "rules", name: "Gold rule" });
  });
});
