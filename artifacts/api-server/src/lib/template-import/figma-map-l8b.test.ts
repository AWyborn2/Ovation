/**
 * The Figma import's second pass (ADR-011 L8-B, T8.6–T8.7): image slots and
 * library images, vectors from Figma's SVG export, auto layout as stacks and
 * `rows:<repeat>` frames as rows layers. Synthetic Figma trees; every result
 * must pass the format's validator.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { templateDocumentErrors, type TemplateLayerV2 } from "@workspace/scorecard/kind-templates";
import type { FontCatalogueEntry } from "./figma-fonts";
import { figmaToTemplate, type FigmaAssets } from "./figma-map";
import type { FigmaNode } from "./figma-types";

const FONTS = JSON.parse(
  readFileSync(
    new URL("../../../../cricket-club/src/lib/google-fonts-catalogue.json", import.meta.url),
    "utf8",
  ),
) as FontCatalogueEntry[];

let seq = 0;
const node = (
  type: string,
  name: string,
  [x, y, w, h]: [number, number, number, number],
  extra: Partial<FigmaNode> = {},
): FigmaNode => ({
  id: `${++seq}:1`,
  name,
  type,
  absoluteBoundingBox: { x, y, width: w, height: h },
  ...extra,
});
const solid = (r: number, g: number, b: number) => [{ type: "SOLID", color: { r, g, b, a: 1 } }];
const text = (name: string, chars: string, at: [number, number, number, number]) =>
  node("TEXT", name, at, {
    characters: chars,
    style: { fontFamily: "Inter", fontWeight: 700, fontSize: 40 },
    fills: solid(1, 1, 1),
  });
const page = (name: string, children: FigmaNode[]) =>
  node("FRAME", name, [0, 0, 1080, 1080], { children, fills: solid(0, 0, 0) });

const run = (kind: string, frames: FigmaNode[], assets?: FigmaAssets) =>
  figmaToTemplate({ kind, frames, fonts: FONTS, ...(assets ? { assets } : {}) });

const valid = (kind: string, doc: unknown) => expect(templateDocumentErrors(doc, kind)).toEqual([]);

describe("image fills (T8.6)", () => {
  const frame = () =>
    page("card/square", [
      node("RECTANGLE", "{{clubLogo}}", [40, 40, 200, 200], {
        fills: [{ type: "IMAGE", imageRef: "a" }],
      }),
      node("RECTANGLE", "Texture", [0, 0, 1080, 300], {
        fills: [{ type: "IMAGE", imageRef: "b" }],
        cornerRadius: 12,
      }),
    ]);

  it("makes {{clubLogo}} the crest slot and defers other images on the first pass", () => {
    const f = frame();
    const res = run("century", [f]);
    const layers = res.document.pages.card!.layers;
    expect(layers.find((l) => l.name === "{{clubLogo}}")).toMatchObject({
      kind: "image",
      content: "{{clubLogo}}",
    });
    expect(res.deferred).toEqual([
      expect.objectContaining({ nodeId: f.children![1]!.id, what: "image", layer: "Texture" }),
    ]);
  });

  it("uses the library copy on the second pass", () => {
    const f = frame();
    const url = "/api/storage/public-objects/library/0b0c0d0e-0000-4000-8000-000000000001.png";
    const res = run("century", [f], { images: { [f.children![1]!.id]: url } });
    const texture = res.document.pages.card!.layers.find((l) => l.name === "Texture");
    expect(texture).toMatchObject({ kind: "image", content: url, style: { radius: 12 } });
    expect(res.deferred).toEqual([]);
    valid("century", res.document);
  });

  it("reports an image whose render couldn't be copied", () => {
    const res = run("century", [frame()], {});
    expect(res.report.map((l) => l.message)).toContain(
      "Image fill: Figma's render couldn't be copied, so it isn't imported.",
    );
  });
});

describe("vectors (T8.7)", () => {
  it("uses the sanitised SVG export, in the node's upright bounding box", () => {
    const swoosh = node("VECTOR", "Swoosh", [108, 540, 540, 108], { fills: solid(1, 0, 0) });
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 2"><path d="M0 0h10v2z" fill="#ff0000"/></svg>';
    const res = run("century", [page("card/square", [swoosh])], { vectors: { [swoosh.id]: svg } });
    expect(res.document.pages.card!.layers.find((l) => l.name === "Swoosh")).toMatchObject({
      kind: "vector",
      svg,
      geometry: { square: { x: 10, y: 50, w: 50, h: 10 } },
    });
    valid("century", res.document);
  });
});

describe("auto layout (T8.7)", () => {
  const block = (extra: Partial<FigmaNode> = {}) =>
    node("FRAME", "Name block", [100, 600, 600, 300], {
      layoutMode: "VERTICAL",
      itemSpacing: 21.6,
      paddingLeft: 54,
      paddingTop: 30,
      paddingRight: 6,
      paddingBottom: 30,
      primaryAxisAlignItems: "MAX",
      counterAxisAlignItems: "CENTER",
      fills: solid(0.1, 0.1, 0.2),
      children: [
        text("Tier", "{{tierLabel}}", [154, 630, 540, 50]),
        text("Name", "{{playerName}}", [154, 700, 540, 80]),
      ],
      ...extra,
    });

  it("becomes a stack group inset by the padding, behind its painted box", () => {
    const res = run("milestone", [page("card/square", [block()])]);
    const layers = res.document.pages.card!.layers;
    const panel = layers.find((l) => l.name === "Name block" && l.kind === "shape");
    const group = layers.find((l) => l.kind === "group") as TemplateLayerV2 & {
      kind: "group";
    };
    expect(panel?.geometry.square).toEqual({ x: 9.26, y: 55.56, w: 55.56, h: 27.78 });
    expect(group).toMatchObject({
      name: "Name block",
      stack: { direction: "column", gap: 2, justify: "end", align: "center" },
      geometry: { square: { x: 14.26, y: 58.33, w: 50, h: 22.22 } },
    });
    expect(group.children.map((c) => c.name)).toEqual(["Tier", "Name"]);
    expect(layers.indexOf(panel!)).toBeLessThan(layers.indexOf(group));
    valid("milestone", res.document);
  });

  it("nests stacks, and places deeper auto layout where Figma draws it", () => {
    let inner = block();
    for (let i = 0; i < 4; i++) {
      inner = node("FRAME", `Level ${i}`, [100, 600, 600, 300], {
        layoutMode: "HORIZONTAL",
        children: [inner],
      });
    }
    const res = run("milestone", [page("card/square", [inner])]);
    let depth = 0;
    let layer: TemplateLayerV2 | undefined = res.document.pages.card!.layers.find(
      (l) => l.kind === "group",
    );
    while (layer && layer.kind === "group") {
      depth += 1;
      layer = layer.children.find((c) => c.kind === "group");
    }
    expect(depth).toBe(4);
    expect(res.report.map((l) => l.message)).toContain(
      "Auto layout nested deeper than 4: its layers are placed where Figma draws them.",
    );
    valid("milestone", res.document);
  });

  it("leaves a page frame's own auto layout as drawn", () => {
    const frame = page("card/square", [text("Name", "{{playerName}}", [100, 100, 800, 100])]);
    frame.layoutMode = "VERTICAL";
    const res = run("milestone", [frame]);
    expect(res.document.pages.card!.layers.some((l) => l.kind === "group")).toBe(false);
  });
});

describe("rows:<repeat> frames (T8.7)", () => {
  const row = (y: number) =>
    node("FRAME", "Row", [60, y, 960, 80], {
      children: [
        text("Team", "{{team}}", [80, y + 10, 600, 60]),
        text("Points", "{{points}}", [900, y + 10, 100, 60]),
        text("Label", "PTS", [860, y + 10, 30, 60]),
        node("RECTANGLE", "{{crest}}", [700, y + 10, 60, 60], {
          fills: [{ type: "IMAGE", imageRef: "c" }],
        }),
      ],
    });

  it("becomes a rows layer: the first row's fields as cells, the gap from the second row", () => {
    const res = run("ladder", [
      page("card/square", [
        node("FRAME", "rows:rows", [60, 200, 960, 800], { children: [row(200), row(296)] }),
      ]),
    ]);
    const layers = res.document.pages.card!.layers;
    const rows = layers.find((l) => l.kind === "rows") as TemplateLayerV2 & { kind: "rows" };
    expect(rows.rows).toMatchObject({ repeat: "rows", rowHeight: 7.407, gap: 1.481 });
    expect(rows.rows.cells.map((c) => [c.field, c.show ?? "text", c.x, c.w])).toEqual([
      ["team", "text", 2.08, 62.5],
      ["points", "text", 87.5, 10.42],
    ]);
    const messages = res.report.map((l) => l.message);
    expect(messages).toContain(
      'Fixed text "Label" in a row isn\'t imported: a cell shows a field.',
    );
    expect(messages).toContain(
      'Row image "{{crest}}" isn\'t named after a field of rows: not imported.',
    );
    valid("ladder", res.document);
  });

  it("makes image-filled {{field}} layers image cells, and crests logo cells", () => {
    const cell = (name: string, x: number) =>
      node("RECTANGLE", name, [x, 210, 60, 60], { fills: [{ type: "IMAGE", imageRef: "p" }] });
    const listOf = (name: string, inner: FigmaNode) =>
      node("FRAME", name, [60, 200, 960, 800], {
        children: [node("FRAME", "Row", [60, 200, 960, 80], { children: [inner] })],
      });
    const rowsOf = (layers: TemplateLayerV2[]) =>
      (layers.find((l) => l.kind === "rows") as TemplateLayerV2 & { kind: "rows" }).rows;

    const team = run("teamOfWeek", [
      page("card/square", [listOf("rows:players", cell("{{photo}}", 60))]),
    ]);
    expect(rowsOf(team.document.pages.card!.layers).cells).toEqual([
      { field: "photo", x: 0, w: 6.25, y: 12.5, h: 75, show: "image" },
    ]);
    valid("teamOfWeek", team.document);

    const day = run("matchDay", [
      node("FRAME", "day/square", [0, 0, 1080, 1080], {
        children: [listOf("rows:dayRows", cell("{{crest}}", 60))],
      }),
    ]);
    expect(rowsOf(day.document.pages.day!.layers).cells[0]).toMatchObject({
      field: "crest",
      show: "logo",
    });
  });

  it("refuses a list the page doesn't have", () => {
    const res = run("ladder", [
      page("card/square", [
        node("FRAME", "rows:players", [0, 0, 100, 100], { children: [row(0)] }),
      ]),
    ]);
    expect(res.document.pages.card!.layers.some((l) => l.kind === "rows")).toBe(false);
    expect(res.report.some((l) => /has no list called players/.test(l.message))).toBe(true);
  });
});
