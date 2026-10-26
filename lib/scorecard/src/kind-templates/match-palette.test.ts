import { describe, expect, it } from "vitest";
import {
  contrast,
  matchColours,
  matchTokenColour,
  matchTokenName,
  matchTokensIn,
  matchVars,
  parseMatchToken,
  shadeHex,
  teamColours,
} from "./match-palette";
import { templateDocumentErrors } from "./validate";

const colours = matchColours({
  club: { identity: "#FBAC27", base: "#333F48" },
  opposition: { identity: "#560560", base: "#FEF203" },
  firstInnings: "opposition",
  winner: "club",
  competition: { colour: "#333F48", accent: "#FBAC27" },
});

describe("match palette tokens", () => {
  it("names and parses a role, slot, shade and alpha", () => {
    expect(matchTokenName("win", "colour", 0.18, 0.5)).toBe("--mt-win-colour-l18-a50");
    expect(matchTokenName("i1", "dark", -0.32)).toBe("--mt-i1-dark-d32");
    expect(parseMatchToken("--mt-win-colour-l18-a50")).toEqual({
      role: "win",
      slot: "colour",
      shade: 0.18,
      alpha: 0.5,
    });
    expect(parseMatchToken("--mt-comp-accent")).toMatchObject({ role: "comp", slot: "accent" });
  });

  it("refuses names outside the grammar", () => {
    expect(parseMatchToken("--mt-home-colour")).toBeNull();
    expect(parseMatchToken("--mt-win-accent")).toBeNull();
    expect(parseMatchToken("--mt-comp-dark")).toBeNull();
    expect(parseMatchToken("--mt-win-colour-l5")).toBeNull();
  });

  it("shades the way the design system does", () => {
    // shade(hex, t) = mix toward white (t > 0) or black (t < 0), rounded per channel.
    expect(shadeHex("#560560", 0.18)).toBe("#74327d");
    expect(shadeHex("#560560", -0.32)).toBe("#3a0341");
    expect(matchTokenColour(colours, "--mt-i1-colour-l18")).toBe("#74327d");
    expect(matchTokenColour(colours, "--mt-win-colour-a50")).toBe("#fbac2780");
  });

  it("puts the sides in batting order and by result", () => {
    expect(colours.i1.colour).toBe("#560560");
    expect(colours.i2.colour).toBe("#fbac27");
    expect(colours.win.colour).toBe("#fbac27");
    expect(colours.lose.colour).toBe("#560560");
  });

  it("gives the club the winner's role on a draw", () => {
    const draw = matchColours({
      club: { identity: "#FBAC27", base: "#333F48" },
      opposition: { identity: "#560560", base: "#FEF203" },
      firstInnings: "club",
      winner: "draw",
      competition: { colour: "#333F48", accent: "#FBAC27" },
    });
    expect(draw.win.colour).toBe("#fbac27");
  });

  it("emits only the tokens a document names", () => {
    const json = JSON.stringify({ fill: "var(--mt-win-colour)", c: "var(--mt-i2-ondark-a85)" });
    expect(matchTokensIn(json)).toEqual(["--mt-win-colour", "--mt-i2-ondark-a85"]);
    expect(matchVars(colours, matchTokensIn(json))).toBe(
      `--mt-win-colour:#fbac27;--mt-i2-ondark-a85:${colours.i2.ondark}d9`,
    );
  });

  it("validates as a colour token", () => {
    const doc = {
      formatVersion: 2,
      pages: {
        result: {
          layers: [
            {
              id: "a",
              kind: "shape",
              geometry: { square: { x: 0, y: 0, w: 10, h: 10 } },
              style: { fill: "var(--mt-win-colour-l18)" },
            },
          ],
        },
      },
    };
    expect(templateDocumentErrors(doc, "matchSummary")).toEqual([]);
  });
});

describe("a team's colours (M6)", () => {
  it("reads every slot on its ground", () => {
    for (const [identity, base] of [
      ["#560560", "#ffffff"],
      ["#FBAC27", "#333F48"],
      ["#0a1a3a", "#0b2a5a"],
      ["#ffe14d", "#fff7cc"],
    ] as const) {
      const t = teamColours(identity, base);
      expect(contrast(t.colour, t.on)).toBeGreaterThanOrEqual(3);
      expect(contrast(t.ondark, "#1c2026")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.bright, t.dark)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
