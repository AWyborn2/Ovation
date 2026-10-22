import { describe, expect, it } from "vitest";
import type { CapturedElement, PackCapture } from "@workspace/scorecard/pack-capture";
import type { TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import {
  Tree,
  alignTrees,
  fillOverBox,
  joinRuns,
  mapCapture,
  backdropKeys,
  readingOrder,
  sizedGradient,
  widenTextCells,
} from "./map";
import {
  applyStacks,
  mergePage,
  mergeSizes,
  stackContainers,
  stackUnits,
  type SizeMaps,
} from "./merge";

const TEXT = {
  "font-family": '"Barlow Condensed", "Arial Narrow", sans-serif',
  "font-size": "54px",
  "font-weight": "800",
  "line-height": "54px",
  "letter-spacing": "1.08px",
  "text-transform": "uppercase",
  "text-align": "start",
  color: "rgb(245, 242, 232)",
};

let id = 0;
const el = (
  parent: number | null,
  tag: string,
  box: [number, number, number, number],
  extra: Partial<CapturedElement> = {},
): CapturedElement => ({
  id: id++,
  parent,
  tag,
  box: { x: box[0], y: box[1], w: box[2], h: box[3] },
  style: {},
  ...extra,
});
const text = (s: string, box: [number, number, number, number]) => [
  { text: s, box: { x: box[0], y: box[1], w: box[2], h: box[3] }, lines: 1 },
];

function capture(
  opts: { size?: "square" | "story"; fontPx?: number; noPhotoArt?: boolean } = {},
): PackCapture {
  id = 0;
  const fontPx = opts.fontPx ?? 54;
  const els: CapturedElement[] = [];
  els.push(
    el(null, "div", [0, 0, 1080, 1080], {
      className: "pack-card-root",
      style: { "background-color": "rgb(14, 43, 81)", ...TEXT },
    }),
  );
  els.push(el(0, "div", [0, 0, 540, 100], { style: { "background-color": "rgb(211, 23, 90)" } }));
  els.push(
    el(0, "div", [60, 200, 600, 60], {
      data: { fit: "26" },
      style: { ...TEXT, "font-size": `${fontPx}px` },
      text: text("[[playerName]]", [60, 200, 400, 60]),
    }),
  );
  els.push(el(0, "img", [600, 300, 400, 500], { src: "sentinel:photo" }));
  els.push(el(0, "img", [60, 40, 80, 80], { src: "sentinel:clubLogo" }));
  const list = el(0, "div", [60, 600, 900, 140]);
  els.push(list);
  for (const [i, [n, name]] of [
    ["1", "QA ZA"],
    ["2", "QB ZB"],
  ].entries()) {
    const y = 600 + i * 70;
    const row = el(list.id, "div", [60, y, 900, 60]);
    els.push(row);
    els.push(el(row.id, "span", [60, y, 60, 60], { style: TEXT, text: text(n!, [60, y, 30, 60]) }));
    els.push(
      el(row.id, "span", [140, y, 500, 60], { style: TEXT, text: text(name!, [140, y, 200, 60]) }),
    );
  }
  els.push(
    el(0, "div", [900, 0, 120, 60], {
      size: { w: 100, h: 60 },
      style: {
        "background-color": "rgb(211, 23, 90)",
        transform: "matrix(1, 0, -0.404026, 1, 0, 0)",
        "transform-origin": "50px 30px",
      },
    }),
  );
  els.push(
    el(0, "div", [1000, 1000, 20, 20], {
      style: {
        "background-color": "rgb(211, 23, 90)",
        "animation-name": "hhPulse",
        "animation-duration": "1.4s",
      },
    }),
  );
  if (opts.noPhotoArt)
    els.push(
      el(0, "div", [600, 300, 400, 500], {
        style: TEXT,
        text: text("NO PHOTO ART", [600, 300, 400, 60]),
      }),
    );
  return {
    format: "ovation-pack-capture/1",
    packId: "test-v1",
    size: opts.size ?? "square",
    native: { w: 1080, h: opts.size === "story" ? 1920 : 1080 },
    colourMode: "club",
    detail: "full",
    rootVars: {},
    rootColours: { "--gold": "rgb(211, 23, 90)", "--ink": "rgb(14, 43, 81)" },
    tokens: {},
    fields: { playerName: "QC ZC" },
    markers: { playerName: "[[playerName]]" },
    rows: {
      players: [
        { values: { number: "1", surname: "QA ZA" } },
        { values: { number: "2", surname: "QB ZB" } },
      ],
    },
    images: { photo: "sentinel:photo", clubLogo: "sentinel:clubLogo" },
    keyframes: { hhPulse: "@keyframes hhPulse{}" },
    fontFailures: [],
    elements: els,
    warnings: [],
    ms: 1,
  };
}

const kinds = (layers: Array<{ layer: { kind: string } }>) => layers.map((l) => l.layer.kind);

describe("mapCapture", () => {
  const result = mapCapture(capture());
  const find = (pred: (l: (typeof result.layers)[number]) => boolean) => result.layers.find(pred);

  it("maps text markers to tokens, with the text style and the name fit", () => {
    const t = find((l) => l.layer.kind === "text")!;
    const layer = t.layer as Extract<TemplateLayerV2, { kind: "text" }>;
    expect(layer.content).toBe("{{playerName}}");
    expect(layer.fit).toEqual({ minScale: 0.6, maxLines: 2, ellipsis: true });
    expect(layer.style).toMatchObject({
      fontFamily: "'Barlow Condensed',sans-serif",
      fontSize: 5,
      fontWeight: 800,
      letterSpacing: 0.02,
      uppercase: true,
      align: "left",
      lineHeight: 1,
      color: "#F5F2E8",
    });
    // The pack's box, with room to spare on the right (left-aligned text).
    expect(t.box).toEqual({ x: 5.56, y: 18.52, w: 57.22, h: 5.56 });
  });

  it("maps sentinel images to the photo and to token image layers", () => {
    expect(find((l) => l.layer.kind === "photo")).toBeDefined();
    const logo = find((l) => l.layer.kind === "image")!.layer as { content: string };
    expect(logo.content).toBe("{{clubLogo}}");
  });

  it("finds a repeat by its rows' values and maps the first row's cells", () => {
    const rows = find((l) => l.layer.kind === "rows")!;
    const spec = (rows.layer as Extract<TemplateLayerV2, { kind: "rows" }>).rows;
    expect(spec.repeat).toBe("players");
    expect(spec.cells.map((c) => c.field)).toEqual(["number", "surname"]);
    expect(spec.rowHeight).toBe(5.56);
    expect(spec.gap).toBe(0.93);
    // The row cells don't also become text layers.
    expect(result.layers.filter((l) => l.layer.kind === "text")).toHaveLength(1);
  });

  it("tokenises fills, cuts a skewed panel to its corners and maps the pulse", () => {
    const stage = result.layers[0]!.layer as { style: { fill: string } };
    expect(stage.style.fill).toBe("var(--ink)");
    // A native shape, not a polygon SVG: its box cut to the skewed corners (C1).
    const slash = find((l) => l.sig.startsWith("shape:skew:"))!;
    expect(slash.layer.style).toEqual({
      fill: "var(--gold)",
      clip: {
        polygon: [
          [19.51, 0],
          [100, 0],
          [80.49, 100],
          [0, 100],
        ],
      },
    });
    expect(result.layers.some((l) => l.layer.kind === "vector")).toBe(false);
    expect(result.motion).toEqual({ hhPulse: "loop: pulse, 1400 ms" });
    const dot = find((l) => !!(l.layer as { motion?: unknown }).motion)!.layer as {
      motion: unknown;
    };
    expect(dot.motion).toEqual({ loop: { preset: "pulse", periodMs: 1400 } });
    expect(kinds(result.layers)).toEqual([
      "shape",
      "shape",
      "text",
      "photo",
      "image",
      "rows",
      "shape",
      "shape",
    ]);
  });
});

describe("merging", () => {
  it("one layer across sizes when its style matches; split by style when it doesn't", () => {
    const square = mapCapture(capture({ size: "square" }));
    const story = mapCapture(capture({ size: "story", fontPx: 70 }));
    const merged = mergeSizes([
      { size: "square", layers: square.layers.map((l) => ({ ...l, layer: l.layer })) },
      { size: "story", layers: story.layers.map((l) => ({ ...l, layer: l.layer })) },
    ]);
    const texts = merged.filter((l) => l.kind === "text");
    expect(texts).toHaveLength(2);
    expect(texts.map((t) => t.sizes)).toEqual([["square"], ["story"]]);
    // The split copies are one element: they share a link, the first one's id (C2).
    expect(texts.map((t) => t.link)).toEqual([texts[0]!.id, texts[0]!.id]);
    const photo = merged.filter((l) => l.kind === "photo");
    expect(photo).toHaveLength(1);
    expect(Object.keys(photo[0]!.geometry)).toEqual(["square", "story"]);
    expect(photo[0]!.link).toBeUndefined();
  });

  it("a layer only drawn without the photo shows when there is none", () => {
    const on = mapCapture(capture());
    const off = mapCapture(capture({ noPhotoArt: true }));
    const { layers } = mergePage([
      { size: "square", base: on, baseCapture: capture(), photo: { on, off } },
    ]);
    const art = layers.find(
      (l) => l.kind === "text" && (l as { content?: string }).content === "NO PHOTO ART",
    );
    expect(art?.showWhen).toEqual({ photo: false });
  });
});

describe("text runs and twins", () => {
  it("joins runs with spaces, except inside brackets", () => {
    expect(joinRuns(["(", "[[balls]]", ")"])).toBe("([[balls]])");
    expect(joinRuns(["[[grade]]", "· vs", "[[opponent]]", "· RD", "[[round]]"])).toBe(
      "[[grade]] · vs [[opponent]] · RD [[round]]",
    );
  });

  it("reads runs line by line, left to right", () => {
    const run = (t: string, x: number, y: number) => ({ text: t, box: { x, y, w: 10, h: 24 } });
    // A wrapped meta line: the parent's own runs sit between its child spans.
    const order = readingOrder([
      run("· vs", 824, 801),
      run("· RD", 733, 825),
      run("[[grade]]", 64, 801),
      run("[[opponent]]", 64, 825),
      run("[[round]]", 824, 825),
    ]).map((r) => r.text);
    expect(order).toEqual(["[[grade]]", "· vs", "[[opponent]]", "· RD", "[[round]]"]);
  });

  it("finds each element's worst-case twin by content, when one render has an extra element", () => {
    const cap = (elements: CapturedElement[], fields: Record<string, string>) =>
      ({ elements, fields }) as unknown as PackCapture;
    id = 0;
    const sentinel = cap(
      [
        el(null, "div", [0, 0, 1080, 1080]),
        el(0, "div", [60, 260, 200, 24], { text: text("RAISED THE BAT", [60, 260, 200, 24]) }),
        el(0, "div", [60, 690, 300, 50], { text: text("[[playerName]]", [60, 690, 300, 50]) }),
      ],
      { playerName: "QC ZC" },
    );
    id = 0;
    const worst = cap(
      [
        el(null, "div", [0, 0, 1080, 1080]),
        el(0, "div", [60, 260, 212, 24], { text: text("RAISED THE BAT", [60, 260, 212, 24]) }),
        // The shirt-number chip only the worst case fills.
        el(0, "div", [60, 640, 83, 42], {
          data: { shirtNumber: "1" },
          text: text("#100", [70, 640, 60, 37]),
        }),
        el(0, "div", [60, 690, 884, 100], { text: text("Marton Dacalgusr", [60, 690, 660, 110]) }),
      ],
      { playerName: "Marton Dacalgusr" },
    );
    const twins = alignTrees(new Tree(sentinel), new Tree(worst));
    expect(twins.get(1)?.box.w).toBe(212);
    expect(twins.get(2)?.box.w).toBe(884);
  });
});

describe("text fill over a taller box", () => {
  it("moves a vertical gradient's stops into the element's band", () => {
    const style = {
      textFill: {
        type: "linear" as const,
        stops: [
          { color: "#ffffff", at: 0 },
          { color: "#000000", at: 100 },
        ],
      },
    };
    // The element is 215 px tall at 297; the layer holds the glyphs, 386 px from 211.
    const out = fillOverBox(style, { y: 297, h: 215 }, { y: 211, h: 386 });
    expect(out.textFill).toEqual({
      type: "linear",
      stops: [
        { color: "#ffffff", at: 22.28 },
        { color: "#000000", at: 77.98 },
      ],
    });
    expect(fillOverBox(style, { y: 0, h: 100 }, { y: 0, h: 100 })).toBe(style);
  });
});

describe("stacks", () => {
  // A flex column (1) holding two texts, a text only Full shows, and maybe a nested block.
  function maps(nested: boolean): SizeMaps {
    id = 0;
    const elements = [
      el(null, "div", [0, 0, 1080, 1080]),
      el(0, "div", [60, 100, 960, 600], { style: { display: "flex", "flex-direction": "column" } }),
      el(1, "div", [60, 100, 960, 50]),
      el(1, "div", [60, 160, 960, 50]),
      el(1, "div", [60, 220, 960, 50]),
      el(1, "div", [60, 280, 960, 200], { style: { display: "flex" } }),
      el(5, "div", [60, 280, 300, 200]),
    ];
    const layer = (sig: string, element: number, y: number) => ({
      sig,
      layer: { kind: "text", content: sig } as never,
      box: { x: 5, y, w: 90, h: 5 },
      element,
    });
    const base = [layer("a", 2, 10), layer("b", 3, 15), layer("full", 4, 20)];
    if (nested) base.push(layer("tile", 6, 26));
    const result = (layers: typeof base) => ({ layers, polish: [], untokenised: [], motion: {} });
    return {
      size: "square",
      base: result(base),
      baseCapture: { elements, native: { w: 1080, h: 1080 } } as unknown as PackCapture,
      // Minimal hides "full" and moves "b" up.
      minimal: result([layer("a", 2, 10), layer("b", 3, 12)]),
    };
  }

  it("stacks a flex container whose members move between presets", () => {
    const m = maps(false);
    const stacks = stackContainers(m);
    expect(stacks).toHaveLength(1);
    expect(stacks[0]!.stack.direction).toBe("column");
    const units = stackUnits(m, stacks[0]!.container.id)!.units;
    expect(units.map((u) => u.sigs)).toEqual([["a"], ["b"], ["full"]]);
  });

  it("keeps a nested flex block as one item of the stack, so the stack can't overlap it", () => {
    const m = maps(true);
    const [stack] = stackContainers(m);
    const units = stackUnits(m, stack!.container.id)!.units;
    // The nested block (element 5) is one flow item holding its tile.
    expect(units.map((u) => u.child.id)).toEqual([2, 3, 4, 5]);
    expect(units[3]!.sigs).toEqual(["tile"]);
  });
});

describe("gradients taller than their box", () => {
  it("keeps the part the box shows (background-size 100% 220%, at the top)", () => {
    const fill = {
      type: "linear" as const,
      stops: [
        { color: "#ffffff", at: 0 },
        { color: "#000000", at: 100 },
      ],
    };
    expect(sizedGradient(fill, "100% 220%", "50% 0%")).toEqual({
      type: "linear",
      stops: [
        { color: "#ffffff", at: 0 },
        { color: "#8B8B8B", at: 100 },
      ],
    });
    // A gradient the box's own size is left alone.
    expect(sizedGradient(fill, "auto", undefined)).toBe(fill);
  });
});

describe("clips, layered backgrounds and brightness", () => {
  const cap = capture();
  const band = el(0, "div", [0, 800, 1080, 200], {
    size: { w: 1080, h: 200 },
    style: {
      "background-color": "rgb(211, 23, 90)",
      "clip-path": "polygon(160px 0px, 100% 0px, 100% 100%, 0px calc(100% - 50px))",
    },
  });
  const stage = el(0, "div", [0, 0, 1080, 400], {
    style: {
      "background-color": "rgb(14, 43, 81)",
      "background-image":
        "linear-gradient(rgba(0, 0, 0, 0.5), rgb(0, 0, 0)), radial-gradient(circle at 50% 0%, rgb(211, 23, 90), rgb(14, 43, 81))",
    },
  });
  const wrap = el(0, "div", [100, 100, 300, 300], { style: { filter: "brightness(50%)" } });
  const pic = el(wrap.id, "img", [100, 100, 300, 300], {
    src: "sentinel:photo",
    style: { filter: "brightness(0.6)" },
  });
  // A photo inside the band, the lower half of it: the band's clip cuts it too.
  const inner = el(band.id, "img", [0, 900, 1080, 100], { src: "sentinel:photo" });
  cap.elements.push(band, inner, stage, wrap, pic);
  const result = mapCapture(cap);
  const of = (e: CapturedElement) => result.layers.filter((l) => l.element === e.id);

  it("cuts a clipped box to its polygon, in percent of the box", () => {
    const [shape] = of(band);
    expect(shape!.layer).toMatchObject({
      kind: "shape",
      style: {
        clip: {
          polygon: [
            [14.81, 0],
            [100, 0],
            [100, 100],
            [0, 75],
          ],
        },
      },
    });
    expect(result.polish.some((p) => p.element === band.id && /clip-path/.test(p.what))).toBe(
      false,
    );
  });

  it("cuts a layer inside a clipped box to the box's polygon, in the layer's own percent", () => {
    const [photo] = of(inner);
    const clip = (photo!.layer as { style?: { clip?: { polygon: number[][] } } }).style?.clip;
    const want = [
      [14.81, -100],
      [100, -100],
      [100, 100],
      [0, 50],
    ];
    // Within the rounding of the layer's box (percent of the card, two places).
    clip!.polygon.flat().forEach((v, i) => expect(v).toBeCloseTo(want.flat()[i]!, 0));
  });

  it("keeps every background layer, bottom first, the top one on the box", () => {
    const layers = of(stage).map((l) => (l.layer as { style: { fill: unknown } }).style.fill);
    expect(layers).toHaveLength(3);
    expect(typeof layers[0]).toBe("string"); // the background colour, at the bottom
    expect(layers[1]).toMatchObject({ type: "radial" });
    expect(layers[2]).toMatchObject({ type: "linear" });
    expect(result.polish.some((p) => /layered backgrounds/.test(p.what))).toBe(false);
  });

  it("maps brightness, nested filters multiplied", () => {
    const photo = result.layers.find((l) => l.layer.kind === "photo" && l.element === pic.id)!;
    expect((photo.layer as { style?: { filter?: unknown } }).style?.filter).toEqual([
      { preset: "brightness", amount: 0.3 },
    ]);
  });
});

describe("stack flow items", () => {
  it("keeps a chip's shape and its text together as one flow item", () => {
    const box = (x: number) => ({ square: { x, y: 10, w: 10, h: 5 } });
    const layers = [
      { id: "chip", kind: "shape", geometry: box(5) },
      {
        id: "chipText",
        kind: "text",
        content: "WATCH LIVE",
        geometry: { square: { x: 6, y: 11, w: 8, h: 3 } },
      },
      { id: "link", kind: "text", content: "{{livestream}}", geometry: box(20) },
    ] as unknown as TemplateLayerV2[];
    const sigOf = new Map(layers.map((l) => [l.id, l.id]));
    const [stack] = applyStacks(
      layers,
      sigOf,
      [
        {
          sigs: ["chip", "chipText", "link"],
          depth: 2,
          stack: { direction: "row" },
          geometry: { square: { x: 5, y: 10, w: 40, h: 5 } },
          units: [
            { sigs: ["chip", "chipText"], geometry: { square: { x: 5, y: 10, w: 10, h: 5 } } },
            { sigs: ["link"], geometry: box(20) },
          ],
        },
      ],
      "title-",
    ) as Array<TemplateLayerV2 & { children: TemplateLayerV2[] }>;
    expect(stack!.children.map((c) => c.id)).toEqual(["title-stack1-item1", "link"]);
    const item = stack!.children[0] as TemplateLayerV2 & { children: TemplateLayerV2[] };
    expect(item.kind).toBe("group");
    expect(item.children.map((c) => c.id)).toEqual(["chip", "chipText"]);
    expect(item.geometry.square).toEqual({ x: 5, y: 10, w: 10, h: 5 });
  });
});

describe("paint order", () => {
  it("paints a z-index: 1 header over art after it in the document, as CSS does", () => {
    id = 0;
    const root = el(null, "div", [0, 0, 1080, 1920], {
      className: "pack-card-root",
      style: { "background-color": "rgb(14, 43, 81)" },
    });
    const header = el(0, "div", [0, 0, 1080, 120], {
      style: { position: "relative", "z-index": "1", "background-color": "rgb(211, 23, 90)" },
    });
    const title = el(header.id, "div", [60, 30, 600, 60], {
      style: TEXT,
      text: text("[[clubName]]", [60, 30, 400, 60]),
    });
    const art = el(0, "div", [0, 0, 1080, 1200], {
      style: { position: "absolute", "background-color": "rgb(30, 90, 170)" },
    });
    // z-index on a static element outside a flex container does nothing.
    const plain = el(0, "div", [0, 1300, 1080, 100], {
      style: { "z-index": "5", "background-color": "rgb(240, 240, 240)" },
    });
    const cap = capture();
    cap.elements = [root, header, title, art, plain];
    const order = mapCapture(cap).layers.map((l) => l.element);
    expect(order).toEqual([root.id, art.id, plain.id, header.id, title.id]);
  });
});

describe("text width", () => {
  it("keeps the pack's width for text that wraps, and adds room to one line", () => {
    id = 0;
    const root = el(null, "div", [0, 0, 1080, 1080], { className: "pack-card-root" });
    const wrapped = el(0, "div", [60, 100, 900, 240], {
      style: TEXT,
      text: [{ text: "[[headline]]", box: { x: 60, y: 100, w: 880, h: 240 }, lines: 2 }],
    });
    const single = el(0, "div", [60, 500, 900, 60], {
      style: TEXT,
      text: text("[[clubName]]", [60, 500, 600, 60]),
    });
    const cap = capture();
    cap.elements = [root, wrapped, single];
    const boxOf = (e: CapturedElement) =>
      mapCapture(cap).layers.find((l) => l.element === e.id)!.box;
    expect(boxOf(wrapped).w).toBeCloseTo(((900 + 1) / 1080) * 100, 1);
    expect(boxOf(single).w).toBeGreaterThan((900 / 1080) * 100 + 1);
  });
});

describe("row cells", () => {
  it("widens text cells away from their alignment, sharing gaps with growing neighbours", () => {
    const cell = (field: string, x: number, w: number, align: "left" | "right" | "center") => ({
      field,
      x,
      w,
      y: 0,
      h: 100,
      style: { align },
    });
    const cells = [
      { field: "name", x: 0, w: 100, show: "backdrop" as const },
      cell("name", 5, 20, "left"),
      cell("note", 40, 10, "left"),
      cell("figure", 80, 10, "right"),
    ];
    widenTextCells(cells, { left: 2, right: 98 });
    // The name takes the whole gap up to the note (it grows rightward too);
    // the note and the right-aligned figure split theirs.
    expect(cells.slice(1).map((c) => [c.x, c.w])).toEqual([
      [5, 35],
      [40, 25],
      [65, 25],
    ]);
    expect(cells[0]).toMatchObject({ x: 0, w: 100 });
  });

  it("treats a left-aligned cell pushed to the row's right edge as right-aligned", () => {
    const cells = [
      { field: "name", x: 5, w: 30, y: 0, h: 50, style: { align: "left" as const } },
      { field: "figure", x: 88, w: 10, y: 20, h: 60, style: { align: "left" as const } },
    ];
    widenTextCells(cells, { left: 2, right: 98 });
    // The figure grows leftward to the gap's middle; the name takes the other half.
    expect(cells[1]).toMatchObject({ x: 61.5, w: 36.5, style: { align: "right" } });
    expect(cells[0]).toMatchObject({ x: 5, w: 56.5 });
  });

  it("binds the cell a ladder's position and losses share by the other rows, then the free field", () => {
    id = 0;
    const root = el(null, "div", [0, 0, 1080, 1080], { className: "pack-card-root" });
    const list = el(0, "div", [60, 100, 900, 200]);
    const rows: CapturedElement[] = [];
    const cellsOf = (y: number, pos: string, team: string, lost: string, club: boolean) => {
      const row = el(list.id, "div", [60, y, 900, 60], {
        style: club
          ? {
              "background-color": "rgb(211, 23, 90)",
              "border-left-width": "8px",
              "border-left-color": "rgb(30, 90, 170)",
            }
          : { "background-color": "rgb(30, 40, 60)" },
      });
      rows.push(
        row,
        el(row.id, "div", [70, y, 40, 60], { style: TEXT, text: text(pos, [70, y, 30, 60]) }),
        el(row.id, "div", [140, y, 300, 60], { style: TEXT, text: text(team, [140, y, 200, 60]) }),
        el(row.id, "div", [800, y, 40, 60], { style: TEXT, text: text(lost, [800, y, 30, 60]) }),
      );
    };
    cellsOf(100, "1", "QD", "1", true);
    cellsOf(170, "2", "QE", "2", false);
    cellsOf(240, "3", "QF", "3", false);
    const cap = capture();
    cap.elements = [root, list, ...rows];
    cap.rows = {
      rows: [
        { variant: "club", values: { pos: "1", team: "QD", lost: "1" } },
        { values: { pos: "2", team: "QE", lost: "2" } },
        { values: { pos: "3", team: "QF", lost: "3" } },
        // A row past the card's room: bound, but not drawn.
        { values: { pos: "4", team: "QG", lost: "4" } },
      ],
    };
    const layer = mapCapture(cap).layers.find((l) => l.layer.kind === "rows")!.layer as {
      rows: {
        cells: Array<{ field: string; show?: string }>;
        variants?: Record<string, Record<string, { background?: string }>>;
      };
    };
    expect(layer.rows.cells.filter((c) => !c.show).map((c) => c.field)).toEqual([
      "pos",
      "team",
      "lost",
    ]);
    // The club row's fill survives the text cell that shares its field key, and its accent bar is a strip.
    const club = layer.rows.variants?.club ?? {};
    expect(Object.values(club).some((s) => s.background !== undefined)).toBe(true);
  });

  it("keys each backdrop by the content it holds, else a field no other backdrop has", () => {
    const badge = { field: "", x: 2, w: 10, y: 10, h: 80, show: "backdrop" as const };
    const strip = { field: "", x: 0, w: 1, show: "backdrop" as const };
    const cells = [
      badge,
      strip,
      { field: "grade", x: 3, w: 8, y: 20, h: 60 },
      { field: "result", x: 15, w: 60 },
      { field: "outcome", x: 80, w: 15 },
    ];
    const keys = backdropKeys(cells, true);
    expect(keys.get(badge)).toBe("grade");
    expect(keys.get(strip)).toBe("result");
    expect(keys.get(null)).toBe("outcome");
  });

  it("doesn't anchor a row on a value another row's text holds (DEF in DEF BY)", () => {
    id = 0;
    const root = el(null, "div", [0, 0, 1080, 1080], { className: "pack-card-root" });
    const list = el(0, "div", [60, 100, 900, 400]);
    const els: CapturedElement[] = [root, list];
    const row = (y: number, grade: string, verb: string) => {
      const r = el(list.id, "div", [60, y, 900, 150], {
        style: { "background-color": "rgb(30, 40, 60)" },
      });
      const head = el(r.id, "div", [60, y, 900, 50]);
      els.push(
        r,
        head,
        el(head.id, "div", [70, y, 300, 50], { style: TEXT, text: text(grade, [70, y, 60, 50]) }),
        el(r.id, "div", [500, y + 60, 100, 40], {
          style: TEXT,
          text: text(verb, [500, y + 60, 80, 40]),
        }),
      );
    };
    row(100, "QG", "DEF");
    row(300, "QN", "DEF BY");
    const cap = capture();
    cap.elements = els;
    cap.rows = {
      results: [
        { values: { grade: "QG", verb: "DEF" } },
        { variant: "lost", values: { grade: "QN", verb: "DEF BY" } },
      ],
    };
    const result = mapCapture(cap);
    const rows = result.layers.find((l) => l.layer.kind === "rows")!.layer as {
      rows: { cells: Array<{ field: string; show?: string }> };
    };
    expect(rows.rows.cells.filter((c) => !c.show).map((c) => c.field)).toEqual(["grade", "verb"]);
    expect(result.polish.some((p) => /left as fixed text/.test(p.what))).toBe(false);
    // No row value is left behind as static text.
    expect(
      result.layers.some((l) =>
        /"Q[GN]"|DEF/.test(JSON.stringify(l.layer.kind === "text" ? l.layer : {})),
      ),
    ).toBe(false);
  });

  it("reads a grid of tiles that fills each line first as flow across", () => {
    id = 0;
    const root = el(null, "div", [0, 0, 1080, 1080], { className: "pack-card-root" });
    const grid = el(0, "div", [60, 100, 960, 400]);
    const els: CapturedElement[] = [root, grid];
    const tile = (x: number, y: number, name: string) => {
      const t = el(grid.id, "div", [x, y, 440, 180], {
        style: { "background-color": "rgb(30, 40, 60)" },
      });
      els.push(
        t,
        el(t.id, "div", [x + 20, y + 60, 300, 60], {
          style: TEXT,
          text: text(name, [x + 20, y + 60, 100, 60]),
        }),
      );
    };
    tile(60, 100, "QA");
    tile(560, 100, "QB");
    tile(60, 300, "QC");
    tile(560, 300, "QD");
    const cap = capture();
    cap.elements = els;
    cap.rows = { players: ["QA", "QB", "QC", "QD"].map((name) => ({ values: { name } })) };
    const layer = mapCapture(cap).layers.find((l) => l.layer.kind === "rows")!.layer as {
      rows: { columns?: number; flow?: string };
    };
    expect(layer.rows).toMatchObject({ columns: 2, flow: "across", columnGap: 6.38 });
  });
});

describe("live text fit", () => {
  it("fits one-line text to one line, and lets text the worst case wraps wrap as the pack does", () => {
    id = 0;
    const root = el(null, "div", [0, 0, 1080, 1080], { className: "pack-card-root" });
    // A label, a field and a separator: three one-line runs that wrap onto two lines.
    const eyebrow = el(0, "div", [60, 100, 600, 60], {
      style: { ...TEXT, "font-size": "24px", "line-height": "30px" },
      text: [
        { text: "FIRST GRADE DEBUT ·", box: { x: 60, y: 100, w: 580, h: 30 }, lines: 1 },
        { text: "[[grade]]", box: { x: 60, y: 130, w: 300, h: 30 }, lines: 1 },
      ],
    });
    const name = el(0, "div", [60, 300, 900, 60], {
      style: TEXT,
      text: text("[[clubName]]", [60, 300, 600, 60]),
    });
    const cap = capture();
    cap.elements = [root, eyebrow, name];
    const fitOf = (e: CapturedElement) =>
      (mapCapture(cap).layers.find((l) => l.element === e.id)!.layer as { fit?: unknown }).fit;
    expect(fitOf(eyebrow)).toBeUndefined();
    expect(fitOf(name)).toEqual({ minScale: 0.6, maxLines: 1, ellipsis: true });
  });
});

describe("a text's own background in a row", () => {
  it("draws an outcome pill's fill as a backdrop under its text", () => {
    id = 0;
    const root = el(null, "div", [0, 0, 1080, 1080], { className: "pack-card-root" });
    const list = el(0, "div", [60, 100, 900, 200]);
    const els: CapturedElement[] = [root, list];
    const row = (y: number, name: string, outcome: string) => {
      const r = el(list.id, "div", [60, y, 900, 80]);
      els.push(
        r,
        el(r.id, "div", [80, y + 20, 300, 40], {
          style: TEXT,
          text: text(name, [80, y + 20, 100, 40]),
        }),
        el(r.id, "div", [820, y + 20, 120, 40], {
          style: {
            ...TEXT,
            "background-color": "rgb(211, 23, 90)",
            "border-top-left-radius": "8px",
          },
          text: text(outcome, [840, y + 20, 80, 40]),
        }),
      );
    };
    row(100, "QA", "WON");
    row(200, "QB", "LOST");
    const cap = capture();
    cap.elements = els;
    cap.rows = {
      matches: [
        { values: { gradeLabel: "QA", outcome: "WON" } },
        { values: { gradeLabel: "QB", outcome: "LOST" } },
      ],
    };
    const layer = mapCapture(cap).layers.find((l) => l.layer.kind === "rows")!.layer as {
      rows: {
        cells: Array<{
          field: string;
          show?: string;
          style?: { background?: string; radius?: number };
        }>;
      };
    };
    const pill = layer.rows.cells.find((c) => c.show === "backdrop" && c.field === "outcome");
    expect(pill?.style).toMatchObject({ radius: 8 });
    expect(pill?.style?.background).toBeTruthy();
    const order = layer.rows.cells.map((c) => `${c.field}:${c.show ?? "text"}`);
    expect(order.indexOf("outcome:backdrop")).toBeLessThan(order.indexOf("outcome:text"));
  });
});

describe("the Duotone pack's photo map", () => {
  it("maps its SVG gradient-map filter to the duotone preset from the Duotone palette", () => {
    id = 0;
    const root = el(null, "div", [0, 0, 1080, 1350], { className: "pack-card-root" });
    const wrap = el(0, "div", [0, 0, 1080, 1350], {
      style: { filter: 'url("#dt-duo-0e2b51-1f5fb4-e988aa")' },
    });
    const pic = el(wrap.id, "img", [0, 0, 1080, 1350], { src: "sentinel:photo" });
    const cap = capture();
    cap.elements = [root, wrap, pic];
    const result = mapCapture(cap);
    const photo = result.layers.find((l) => l.layer.kind === "photo")!;
    expect((photo.layer as { style?: { filter?: unknown } }).style?.filter).toEqual([
      { preset: "duotone", dark: "var(--dt-ink)", light: "var(--dt-p)" },
    ]);
    expect(result.polish.some((p) => /filter url/.test(p.what))).toBe(false);
  });
});

describe("cells only some rows draw", () => {
  it("adds a captain's mark from the row that has it, once", () => {
    id = 0;
    const root = el(null, "div", [0, 0, 1080, 1080], { className: "pack-card-root" });
    const list = el(0, "div", [60, 100, 900, 300]);
    const els: CapturedElement[] = [root, list];
    const row = (y: number, n: string, name: string, role: string) => {
      const r = el(list.id, "div", [60, y, 900, 60]);
      els.push(
        r,
        el(r.id, "div", [60, y, 60, 60], { style: TEXT, text: text(n, [60, y, 40, 60]) }),
        el(r.id, "div", [140, y, 500, 60], { style: TEXT, text: text(name, [140, y, 300, 60]) }),
      );
      if (role)
        els.push(
          el(r.id, "div", [860, y, 80, 60], { style: TEXT, text: text(role, [860, y, 60, 60]) }),
        );
    };
    row(100, "1", "QI ZI", "");
    row(170, "2", "QJ ZJ", "(VC)");
    row(240, "3", "QK ZK", "");
    const cap = capture();
    cap.elements = els;
    cap.rows = {
      players: [
        { values: { number: "1", surname: "QI ZI", broadcastName: "QI ZI", role: "" } },
        { values: { number: "2", surname: "QJ ZJ", broadcastName: "QJ ZJ", role: "VC" } },
        { values: { number: "3", surname: "QK ZK", broadcastName: "QK ZK", role: "" } },
      ],
    };
    const layer = mapCapture(cap).layers.find((l) => l.layer.kind === "rows")!.layer as {
      rows: { cells: Array<{ field: string; show?: string }> };
    };
    const fields = layer.rows.cells.filter((c) => !c.show).map((c) => c.field);
    expect(fields).toContain("role");
    // The name is bound once (surname and broadcast name share the sentinel's marker).
    expect(fields.filter((f) => f === "surname" || f === "broadcastName")).toHaveLength(1);
  });
});
