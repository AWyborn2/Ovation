import { describe, expect, it } from "vitest";
import type { CapturedElement, PackCapture } from "@workspace/scorecard/pack-capture";
import type { TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import { mapCapture } from "./map";
import { mergePage, mergeSizes } from "./merge";

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
    expect(t.box).toEqual({ x: 5.56, y: 18.52, w: 55.56, h: 5.56 });
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
