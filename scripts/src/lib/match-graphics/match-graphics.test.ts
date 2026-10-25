/**
 * The Ovation Match Graphics converter's pure parts, and the bundles it wrote
 * (plan 2026-10-23): seven Match Summary looks in one family, and the 51
 * layer components as elements.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  elementDocumentErrors,
  ELEMENT_CATEGORIES,
  normaliseDocument,
  templateDocumentErrors,
} from "@workspace/scorecard/kind-templates";
import { parseMatchToken } from "@workspace/scorecard/match-palette";
import { categoryOf, elementName } from "./elements";
import { FAMILY, LAYER_COMPONENTS, MATCH_LOOKS } from "./looks";
import {
  candidateTokens,
  joinScores,
  markFields,
  sentinelColours,
  sentinelImage,
} from "./sentinels";
import { withinLimits } from "./templates";

const BUNDLES = path.resolve(__dirname, "../../../../lib/template-bundles");

describe("the looks", () => {
  it("are the design system's seven, with its 51 layer components", () => {
    expect(MATCH_LOOKS.map((l) => l.component)).toEqual([
      "BroadcastSummary",
      "PanelSummary",
      "CleanSummary",
      "ClassicSummary",
      "ScoreboardSummary",
      "GroundScoreboardSummary",
      "T20Summary",
    ]);
    expect(LAYER_COMPONENTS).toHaveLength(51);
    expect(new Set(LAYER_COMPONENTS.map((c) => c.name)).size).toBe(51);
  });
});

describe("sentinels", () => {
  it("joins a design's wickets and runs into one score token", () => {
    expect(joinScores("[[innings1.wickets]]/[[innings1.runs]]")).toBe("[[innings1.score]]");
    expect(joinScores("[[innings2.wickets]]-[[innings2.runs]]")).toBe("[[innings2.scoreDash]]");
  });

  it("puts long real values back as their markers, only where they stand alone", () => {
    expect(markFields("Rushton Park Recreation Reserve, 17 Oct 2026")).toBe("[[venue]], [[date]]");
    expect(markFields("Overs 49.4")).toBe("Overs [[innings1.overs]]");
    expect(markFields("10/168")).toBe("[[innings1.score]]");
    // A value inside a longer number isn't one.
    expect(markFields("110/1681")).toBe("110/1681");
  });

  it("names each image's slot in its data URL", () => {
    expect(decodeURIComponent(sentinelImage("innings1.logo"))).toContain("sentinel:innings1.logo ");
  });

  it("tells the winner from the first innings by the two palettes", () => {
    const a = sentinelColours("A");
    const b = sentinelColours("B");
    expect(a.win).toBe(a.i1);
    expect(b.win).toBe(b.i2);
    const tokens = candidateTokens("A");
    expect(Object.keys(tokens).every((t) => parseMatchToken(t) !== null)).toBe(true);
    expect(tokens["--mt-win-colour"]).toBe(a.i1.colour);
  });
});

describe("elements", () => {
  it("files each component under a panel category", () => {
    for (const { name } of LAYER_COMPONENTS) expect(ELEMENT_CATEGORIES).toContain(categoryOf(name));
    expect(categoryOf("T20LogoTile")).toBe("crest-frames");
    expect(categoryOf("ClassicStripes")).toBe("glows");
    expect(categoryOf("BroadcastBatterRow")).toBe("data-blocks");
    expect(categoryOf("PanelFrame")).toBe("frames");
    expect(categoryOf("CleanResultBar")).toBe("bands");
  });

  it("names a component without its look", () => {
    const broadcast = MATCH_LOOKS[0]!;
    const ground = MATCH_LOOKS.find((l) => l.slug === "omg-ground-scoreboard")!;
    expect(elementName("BroadcastTitleBar", broadcast)).toBe("Title bar");
    expect(elementName("GroundScoreboardHeader", ground)).toBe("Board header");
  });

  it("trims a style to the format's limits", () => {
    const layers = [
      {
        id: "a",
        kind: "shape",
        geometry: {},
        style: {
          fill: {
            type: "linear",
            stops: Array.from({ length: 11 }, (_, i) => ({ color: "#ffffff", at: i * 10 })),
          },
          boxShadow: Array.from({ length: 6 }, () => ({ x: 0, y: 0, blur: 1, color: "#000000" })),
        },
      },
    ] as never;
    withinLimits(layers);
    const style = (
      layers as Array<{ style: { fill: { stops: Array<{ at: number }> }; boxShadow: unknown[] } }>
    )[0]!.style;
    expect(style.fill.stops.map((s) => s.at)).toEqual([0, 10, 30, 40, 60, 70, 90, 100]);
    expect(style.boxShadow).toHaveLength(4);
  });
});

describe("the bundles", () => {
  const looks = MATCH_LOOKS.filter((l) => existsSync(path.join(BUNDLES, l.slug, "look.json")));

  it("hold all seven looks in the family, each a listed Match Summary that validates", () => {
    expect(looks).toHaveLength(7);
    for (const look of looks) {
      const lookFile = JSON.parse(readFileSync(path.join(BUNDLES, look.slug, "look.json"), "utf8"));
      expect(lookFile).toMatchObject({ name: look.name, family: FAMILY });
      expect(readdirSync(path.join(BUNDLES, look.slug)).sort()).toEqual([
        "look.json",
        "matchSummary.json",
      ]);
      const file = JSON.parse(
        readFileSync(path.join(BUNDLES, look.slug, "matchSummary.json"), "utf8"),
      );
      expect(file.listed).toBe(true);
      const { sourceFormat: _s, ...doc } = normaliseDocument(file.document, "matchSummary");
      expect(templateDocumentErrors(doc, "matchSummary")).toEqual([]);
      const json = JSON.stringify(file.document);
      // Club colours come from the match palette (Broadcast's default theme is its own
      // teal chrome), and no sentinel colour is left behind.
      if (look.slug !== "omg-broadcast") {
        expect(json).toContain("var(--mt-");
        expect(file.document.palettes).toContain("match");
      }
      // The photo fills the card at every size (M11).
      const photo = file.document.pages.result.layers.find(
        (l: { kind: string }) => l.kind === "photo",
      );
      for (const box of Object.values(photo.geometry))
        expect(box).toEqual({ x: 0, y: 0, w: 100, h: 100 });
      for (const palette of ["A", "B"] as const)
        for (const team of Object.values(sentinelColours(palette)))
          for (const hex of Object.values(team))
            expect(json.toLowerCase()).not.toContain(`"${hex.toLowerCase()}`);
    }
  });

  it("hold the 51 layer components as elements, each credited to its look", () => {
    let count = 0;
    for (const look of looks) {
      const file = JSON.parse(
        readFileSync(path.join(BUNDLES, "elements", `${look.slug}.json`), "utf8"),
      );
      expect(file.look).toBe(look.slug);
      expect(file.elements).toHaveLength(look.layers.length);
      for (const e of file.elements) {
        expect(e.slug.startsWith(`${look.slug}/${e.category}/`)).toBe(true);
        expect(elementDocumentErrors(e.document)).toEqual([]);
        // Native layers, never one element box.
        expect(JSON.stringify(e.document)).not.toContain('"kind":"element"');
        count++;
      }
    }
    expect(count).toBe(51);
  });
});
