import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  flattenLayers,
  type TemplateLayerV2,
  type TextLayerV2,
} from "@workspace/scorecard/kind-templates";
import type { FontCatalogueEntry } from "./figma-fonts";
import {
  colourStyleToken,
  figmaHex,
  figmaToTemplate,
  linearGradient,
  mergeOrder,
  sizeByDimensions,
  transformOf,
} from "./figma-map";
import type { FigmaNode, FigmaNodesResponse, FigmaStyleMeta } from "./figma-types";

const FONTS = JSON.parse(
  readFileSync(
    new URL("../../../../cricket-club/src/lib/google-fonts-catalogue.json", import.meta.url),
    "utf8",
  ),
) as FontCatalogueEntry[];

/** The recorded-shape fixture: a century card's square frame and a story frame. */
const FIXTURE = JSON.parse(
  readFileSync(new URL("./__fixtures__/figma-century.json", import.meta.url), "utf8"),
) as FigmaNodesResponse;

function fixtureInput() {
  const frames: FigmaNode[] = [];
  const styles: Record<string, FigmaStyleMeta> = {};
  for (const entry of Object.values(FIXTURE.nodes)) {
    if (!entry) continue;
    frames.push(entry.document);
    Object.assign(styles, entry.styles);
  }
  return { kind: "century", frames, styles, fonts: FONTS };
}

const byName = (layers: TemplateLayerV2[], name: string) => layers.filter((l) => l.name === name);

describe("Figma → template v2 (L8-A)", () => {
  const result = figmaToTemplate(fixtureInput());
  const layers = result.document.pages.card?.layers ?? [];

  it("reads frames as page × size by name, else by dimensions", () => {
    expect(result.frames).toEqual([
      { nodeId: "10:1", name: "card/square", page: "card", size: "square", by: "name" },
      { nodeId: "20:1", name: "Century — story", page: "card", size: "story", by: "dimensions" },
    ]);
    expect(Object.keys(result.document.pages)).toEqual(["card"]);
    expect(result.document.formatVersion).toBe(2);
  });

  it("keeps Figma's back-to-front order, layers matched across sizes by name path", () => {
    expect(layers.map((l) => l.name)).toEqual([
      "Stage",
      "Accent bar",
      "Player",
      "Player",
      "Label",
      "Badge",
      "Tag",
    ]);
    const ids = flattenLayers(layers).map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The stage is the same on both frames: one layer, on every size.
    const [stage] = byName(layers, "Stage");
    expect(stage).toMatchObject({ kind: "shape", style: { fill: "var(--ink)" } });
    expect(stage!.sizes).toBeUndefined();
    expect(stage!.geometry.square).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(stage!.geometry.story).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it("maps text: tokens, font, size as % of width, spacing, case, alignment, shadow and fit", () => {
    const [square, story] = byName(layers, "Player") as TextLayerV2[];
    expect(square).toMatchObject({
      kind: "text",
      content: "{{playerName}}",
      sizes: ["square", "portrait", "landscape"],
      fit: { minScale: 0.6, maxLines: 1, ellipsis: true },
      style: {
        fontFamily: "'Anton',sans-serif",
        fontWeight: 400,
        fontSize: 6.67,
        letterSpacing: 0.02,
        lineHeight: 1.11,
        uppercase: true,
        align: "left",
        color: "#ffffff",
        textShadow: [{ x: 0, y: 0.37, blur: 1.481, color: "#00000080" }],
      },
    });
    expect(square!.geometry.square).toEqual({ x: 5, y: 10, w: 90, h: 7.41 });
    // The story frame sets the name larger: a different style splits the layer by size.
    expect(story).toMatchObject({ sizes: ["story"], style: { fontSize: 10 } });
    expect(story!.geometry.story).toEqual({ x: 5, y: 10.42, w: 90, h: 6.25 });
  });

  it("substitutes fonts outside the catalogue and binds colour styles to tokens", () => {
    const [label] = byName(layers, "Label") as TextLayerV2[];
    expect(label).toMatchObject({
      content: "CENTURY · {{runs}}",
      style: {
        fontFamily: "'Arimo',sans-serif",
        fontWeight: 700,
        letterSpacing: 0.2,
        align: "center",
        color: "var(--gold)",
      },
    });
    expect(result.fonts).toEqual([{ from: "Helvetica Neue", to: "Arimo" }]);
    expect(result.report).toContainEqual({
      level: "warn",
      message:
        'Font "Helvetica Neue" isn\'t in the Google Fonts catalogue: "Arimo" is used instead.',
    });
  });

  it("maps shapes: gradients, radius, stroke, shadow, opacity and blend", () => {
    const [bar] = byName(layers, "Accent bar");
    expect(bar).toMatchObject({
      kind: "shape",
      style: {
        fill: {
          type: "linear",
          angle: 90,
          stops: [
            { color: "#fbac27", at: 0 },
            { color: "#fbac2700", at: 100 },
          ],
        },
        // 4 px on a 540-wide frame is 8 px on the 1080 card.
        radius: 8,
      },
    });
    const [badge] = byName(layers, "Badge");
    expect(badge).toMatchObject({
      kind: "shape",
      style: {
        fill: "var(--panel)",
        border: { width: 0.37, color: "#ffffff" },
        radius: 60,
        boxShadow: [{ x: 0, y: 0.741, blur: 1.852, spread: 0.185, color: "#00000040" }],
        // The node's 0.9 times the token fill's 0.8: a token can't carry alpha.
        opacity: 0.72,
        blend: "multiply",
      },
    });
  });

  it("rotates a turned layer about its centre, from its transform and size", () => {
    const [tag] = byName(layers, "Tag");
    expect(tag!.geometry.square).toEqual({ x: 64.81, y: 7.41, w: 18.52, h: 7.41, rotate: 8 });
    expect(tag!.style).toEqual({ fill: "#ff0000" });
  });

  it("places sizes with no frame from the nearest imported one, and says so", () => {
    const [square] = byName(layers, "Player");
    expect(square!.geometry.portrait).toBeDefined();
    expect(square!.geometry.landscape).toBeDefined();
    expect(result.report).toContainEqual({
      level: "warn",
      page: "card",
      message:
        "No portrait frame: the portrait layout is placed from square. Check it, or add a card/portrait frame.",
    });
  });

  it("leaves image fills, vectors and auto layout to L8-B, and reports what it skips", () => {
    expect(result.deferred).toEqual([
      { nodeId: "10:8", page: "card", size: "square", layer: "{{photo}}", what: "image" },
      { nodeId: "10:9", page: "card", size: "square", layer: "Swoosh", what: "vector" },
      {
        nodeId: "20:1",
        page: "card",
        size: "story",
        layer: "Century — story",
        what: "auto-layout",
      },
    ]);
    const messages = result.report.map((l) => `${l.layer ?? ""}: ${l.message}`);
    expect(messages).toContain(
      "Stray: Uses {{notAField}}, which the card page of century doesn't have: not imported.",
    );
    expect(messages).toContain("Draft note: Hidden in Figma: not imported.");
    expect(byName(layers, "Stray")).toEqual([]);
    expect(byName(layers, "Draft note")).toEqual([]);
    // Warnings come before notes.
    const levels = result.report.map((l) => l.level);
    expect(levels.indexOf("info")).toBeGreaterThan(levels.lastIndexOf("warn"));
  });

  it("skips frames that are neither named nor card-shaped, and pages the kind lacks", () => {
    const frame = (id: string, name: string, w: number, h: number): FigmaNode => ({
      id,
      name,
      type: "FRAME",
      absoluteBoundingBox: { x: 0, y: 0, width: w, height: h },
      children: [],
    });
    const res = figmaToTemplate({
      kind: "matchDay",
      fonts: FONTS,
      frames: [
        frame("1:1", "Notes", 800, 600),
        frame("1:2", "card/square", 1080, 1080),
        frame("1:3", "title/story", 1080, 1080),
        frame("1:4", "title/story", 1080, 1920),
        frame("1:5", "Fixture", 1200, 630),
      ],
    });
    expect(res.frames.map((f) => `${f.page}/${f.size}`)).toEqual([
      "title/story",
      "fixture/landscape",
    ]);
    const warn = res.report.filter((l) => l.level === "warn").map((l) => l.message);
    expect(warn).toContain(
      'Frame "card/square" names the card page, which matchDay doesn\'t have (its pages: fixture, title, day, sponsors): skipped.',
    );
    expect(warn).toContain(
      'Frame "title/story" is named story but is 1080×1080: its layers are stretched to the story shape.',
    );
    expect(warn).toContain(
      'Frame "title/story" is skipped: "title/story" is already the title page\'s story.',
    );
    expect(warn).toContain("No frames for the day page: it isn't imported.");
  });

  it("refuses an unknown kind", () => {
    expect(() => figmaToTemplate({ kind: "nope", frames: [], fonts: FONTS })).toThrow(
      /Unknown card kind/,
    );
  });
});

describe("Figma mapping helpers", () => {
  it("reads card sizes from any scale of the four shapes", () => {
    expect(sizeByDimensions(1080, 1080)).toBe("square");
    expect(sizeByDimensions(540, 675)).toBe("portrait");
    expect(sizeByDimensions(360, 640)).toBe("story");
    expect(sizeByDimensions(1200, 630)).toBe("landscape");
    expect(sizeByDimensions(800, 600)).toBeNull();
  });

  it("writes Figma colours as hex, with alpha only when translucent", () => {
    expect(figmaHex({ r: 1, g: 1, b: 1, a: 1 })).toBe("#ffffff");
    expect(figmaHex({ r: 0, g: 0, b: 0, a: 1 }, 0.5)).toBe("#00000080");
    expect(figmaHex({ r: 0.2, g: 0.4, b: 0.6, a: 0.25 })).toBe("#33669940");
  });

  it("maps the ovation colour styles, whatever their case and spacing", () => {
    expect(colourStyleToken("ovation/accent")).toBe("var(--gold)");
    expect(colourStyleToken("ovation/gold")).toBe("var(--gold)");
    expect(colourStyleToken("Ovation / Panel")).toBe("var(--panel)");
    expect(colourStyleToken("ovation/ink")).toBe("var(--ink)");
    expect(colourStyleToken("ovation/panel 2")).toBe("var(--panel-2)");
    expect(colourStyleToken("brand/accent")).toBeUndefined();
  });

  it("turns gradient handles into a CSS angle, stops where Figma draws them", () => {
    const stops = [
      { color: { r: 0, g: 0, b: 0, a: 1 }, position: 0 },
      { color: { r: 1, g: 1, b: 1, a: 1 }, position: 1 },
    ];
    // Top to bottom across the whole box: CSS's default 180°.
    expect(
      linearGradient(
        {
          type: "GRADIENT_LINEAR",
          gradientHandlePositions: [
            { x: 0.5, y: 0 },
            { x: 0.5, y: 1 },
          ],
          gradientStops: stops,
        },
        200,
        100,
      ),
    ).toEqual({
      type: "linear",
      angle: 180,
      stops: [
        { color: "#000000", at: 0 },
        { color: "#ffffff", at: 100 },
      ],
    });
    // Left to right across the middle half only.
    expect(
      linearGradient(
        {
          type: "GRADIENT_LINEAR",
          gradientHandlePositions: [
            { x: 0.25, y: 0.5 },
            { x: 0.75, y: 0.5 },
          ],
          gradientStops: stops,
        },
        200,
        100,
      ),
    ).toMatchObject({ angle: 90, stops: [{ at: 25 }, { at: 75 }] });
  });

  it("reads rotation clockwise from the transform, and flips", () => {
    const rad = (-30 * Math.PI) / 180;
    expect(
      transformOf({
        id: "1",
        name: "n",
        type: "RECTANGLE",
        relativeTransform: [
          [Math.cos(rad), -Math.sin(rad), 0],
          [Math.sin(rad), Math.cos(rad), 0],
        ],
      }).angle,
    ).toBeCloseTo(-30, 5);
    expect(
      transformOf({
        id: "1",
        name: "n",
        type: "RECTANGLE",
        relativeTransform: [
          [-1, 0, 0],
          [0, 1, 0],
        ],
      }).flipped,
    ).toBe(true);
  });

  it("merges each size's layer order into one", () => {
    expect(
      mergeOrder([
        ["a", "b", "d"],
        ["a", "c", "d", "e"],
      ]),
    ).toEqual(["a", "b", "c", "d", "e"]);
    expect(mergeOrder([["x"], ["y", "x"]])).toEqual(["y", "x"]);
  });
});
