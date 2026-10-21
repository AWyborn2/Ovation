import { describe, expect, it } from "vitest";
import type { CapturedElement, PackCapture } from "@workspace/scorecard/pack-capture";
import type { TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import {
  Tree,
  alignTrees,
  fillOverBox,
  joinRuns,
  mapCapture,
  readingOrder,
  sizedGradient,
} from "./map";
import { mergeOrder, mergePage, mergeSizes, stackContainers, type SizeMaps } from "./merge";

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

  it("tokenises fills, turns a skewed panel into a polygon and maps the pulse", () => {
    const stage = result.layers[0]!.layer as { style: { fill: string } };
    expect(stage.style.fill).toBe("var(--ink)");
    const vector = find((l) => l.layer.kind === "vector")!.layer as { svg: string };
    expect(vector.svg).toContain("<polygon");
    expect(vector.svg).toContain('fill="var(--gold)"');
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
      "vector",
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
    const photo = merged.filter((l) => l.kind === "photo");
    expect(photo).toHaveLength(1);
    expect(Object.keys(photo[0]!.geometry)).toEqual(["square", "story"]);
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
    const stacks = stackContainers(maps(false));
    expect(stacks).toHaveLength(1);
    expect(stacks[0]!.sigs).toEqual(["a", "b", "full"]);
    expect(stacks[0]!.stack.direction).toBe("column");
  });

  it("doesn't stack a container with a nested flex block, which the stack would overlap", () => {
    expect(stackContainers(maps(true))).toEqual([]);
  });
});

describe("merging sizes", () => {
  it("keeps a layer only some sizes have where they draw it", () => {
    // Portrait's chip shape has its own signature: it still goes under the chip's text.
    expect(
      mergeOrder([
        ["stage", "chip:sq", "chipText", "name"],
        ["stage", "chip:po", "chipText", "name"],
      ]),
    ).toEqual(["stage", "chip:sq", "chip:po", "chipText", "name"]);
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
  cap.elements.push(band, stage, wrap, pic);
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
