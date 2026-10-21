import { describe, expect, it } from "vitest";
import {
  parseColour,
  parseGradient,
  parseMatrix,
  parseShadows,
  pureRotation,
  splitTopLevel,
  toHex,
  tokeniseColour,
  transformedCorners,
} from "./css";

describe("colours", () => {
  it("reads rgb, rgba, hex and Chrome's color(srgb …) form of color-mix()", () => {
    expect(parseColour("rgb(211, 23, 90)")).toEqual({ r: 211, g: 23, b: 90, a: 1 });
    expect(parseColour("rgba(0, 0, 0, 0.5)")?.a).toBe(0.5);
    expect(parseColour("#1f5fb4")).toEqual({ r: 31, g: 95, b: 180, a: 1 });
    const mixed = parseColour("color(srgb 0.827451 0.0901961 0.352941 / 0.18)")!;
    expect(Math.round(mixed.r)).toBe(211);
    expect(mixed.a).toBe(0.18);
    expect(parseColour("var(--gold)")).toBeNull();
  });

  it("writes hex, with alpha only when not opaque", () => {
    expect(toHex({ r: 211, g: 23, b: 90, a: 1 })).toBe("#D3175A");
    expect(toHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe("#00000080");
  });

  it("a colour is a token only when it matches it in both sentinel palettes", () => {
    const palette = {
      a: { "--gold": "rgb(211, 23, 90)", "--panel": "rgb(31, 95, 180)" },
      b: { "--gold": "rgb(123, 201, 67)", "--panel": "rgb(138, 47, 158)" },
    };
    expect(tokeniseColour("rgb(211, 23, 90)", "rgb(123, 201, 67)", palette)).toEqual({
      value: "var(--gold)",
      token: "--gold",
      moved: true,
    });
    // Same colour in palette A by coincidence, but it didn't follow palette B: the pack's own.
    expect(tokeniseColour("rgb(211, 23, 90)", "rgb(211, 23, 90)", palette)).toEqual({
      value: "#D3175A",
      moved: false,
    });
    // Moved, but no token: reported for polish.
    expect(tokeniseColour("rgb(1, 2, 3)", "rgb(4, 5, 6)", palette)?.moved).toBe(true);
    // No twin capture: palette A decides.
    expect(tokeniseColour("rgb(31, 95, 180)", undefined, { a: palette.a, b: null })?.value).toBe(
      "var(--panel)",
    );
    expect(tokeniseColour("rgba(0, 0, 0, 0)", undefined, palette)).toBeNull();
  });

  it("finds a token at partial alpha, when it moved with the palette at the same alpha", () => {
    const palette = {
      a: { "--gold": "rgb(211, 23, 90)" },
      b: { "--gold": "rgb(123, 201, 67)" },
    };
    expect(
      tokeniseColour(
        "color(srgb 0.827451 0.0901961 0.352941 / 0.45)",
        "color(srgb 0.482353 0.788235 0.262745 / 0.45)",
        palette,
      ),
    ).toEqual({ value: "#D3175A73", moved: true, translucent: { token: "--gold", alpha: 0.45 } });
    // A different alpha in palette B isn't the same paint.
    expect(
      tokeniseColour("rgba(211, 23, 90, 0.45)", "rgba(123, 201, 67, 0.2)", palette)?.translucent,
    ).toBeUndefined();
  });
});

describe("gradients, shadows and transforms", () => {
  it("splits on top-level commas only", () => {
    expect(splitTopLevel("rgb(1, 2, 3) 0%, rgb(4, 5, 6) 100%")).toEqual([
      "rgb(1, 2, 3) 0%",
      "rgb(4, 5, 6) 100%",
    ]);
  });

  it("parses linear and radial gradients, stops and angles", () => {
    expect(parseGradient("linear-gradient(rgba(0, 0, 0, 0.72), rgb(0, 0, 0) 40%)")).toEqual({
      type: "linear",
      stops: [{ colour: "rgba(0, 0, 0, 0.72)" }, { colour: "rgb(0, 0, 0)", at: 40 }],
    });
    expect(parseGradient("linear-gradient(90deg, rgb(1, 2, 3) 0%, rgb(4, 5, 6) 100%)")?.angle).toBe(
      90,
    );
    expect(parseGradient("linear-gradient(to right, rgb(1, 2, 3), rgb(4, 5, 6))")?.angle).toBe(90);
    const radial = parseGradient(
      "radial-gradient(circle at 50% 30%, rgb(1, 2, 3) 0%, rgb(4, 5, 6) 72%)",
    )!;
    expect(radial).toMatchObject({ type: "radial", shape: "circle", at: { x: 50, y: 30 } });
    expect(parseGradient('url("x.png")')).toBeNull();
  });

  it("parses shadow lists, colour first or last, inset included", () => {
    expect(parseShadows("rgba(0, 0, 0, 0.35) 0px 4.32px 21.6px 0px")).toEqual([
      { colour: "rgba(0, 0, 0, 0.35)", x: 0, y: 4.32, blur: 21.6, spread: 0, inset: false },
    ]);
    expect(parseShadows("inset 0px 0px 0px 2px rgb(1, 2, 3)")[0]).toMatchObject({
      inset: true,
      spread: 2,
    });
    expect(parseShadows("none")).toEqual([]);
  });

  it("tells a rotation from a skew, and gives a skewed box's corners", () => {
    const rotate90 = parseMatrix("matrix(0, 1, -1, 0, 0, 0)")!;
    expect(pureRotation(rotate90)).toBe(90);
    const skew = parseMatrix("matrix(1, 0, -0.404026, 1, 0, 0)")!;
    expect(pureRotation(skew)).toBeNull();
    const corners = transformedCorners(100, 50, skew, { x: 50, y: 25 });
    // A leftward skew: the top edge shifts right of the bottom edge.
    expect(corners[0]!.x).toBeGreaterThan(corners[3]!.x);
    expect(Math.min(...corners.map((c) => c.x))).toBe(0);
  });
});
