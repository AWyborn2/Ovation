import { describe, expect, it } from "vitest";
import { CLUB_KIT_COVERAGE, CLUB_KIT_PACK } from "./club-kit";
import { getPackManifest } from "./registry";
import { renderPackCard, resolveCardTokens, packColourModeFor } from "../pack-render";
import { buildPackData } from "../pack-card-data";
import { sampleCardInput } from "../sample-card-inputs";
import { contrastRatio } from "../pack-render/tokens";
import { deriveClubKitPalette, mixHex } from "../pack-render/club-kit-vars";
import { resolveTemplate } from "../pack-render/templates";
import { resultWord } from "../pack-render/bind";
import type { CardSize, ShareCardInput } from "../share-card";

/**
 * Club Kit (Club Colours handoff): the colour derivation, every design at
 * every size, the crest / monogram fallback, the junior palette and the
 * leader presets.
 */

const SIZES: CardSize[] = ["square", "portrait", "story", "landscape"];
const PLACEHOLDER_RE = /\{\{([A-Za-z0-9_.]+)\}\}/;
const ID = CLUB_KIT_PACK.packId;

const HALLS = {
  name: "Demo Districts Cricket Club",
  tagline: "CRICKET CLUB · EST. 1991",
  primaryColour: "#FBAC27",
  backgroundColour: "#333F48",
  juniorsColour: "#42342B",
};

function render(
  input: ShareCardInput,
  size: CardSize,
  brand: Record<string, string | null> | null = HALLS,
  junior = false,
) {
  const data = buildPackData({ brand, hashtag: "#DEMOCC" });
  const tokens = resolveCardTokens({ theme: null, junior, data, packId: ID });
  return renderPackCard(input, size, true, tokens, junior, data, ID);
}

describe("Club Kit palette (handoff §1)", () => {
  it("matches the handoff's Halls Head derivation", () => {
    const p = deriveClubKitPalette({
      primary: "#FBAC27",
      secondary: "#333F48",
      juniors: "#42342B",
      chalk: "#F2F5F8",
      junior: false,
    });
    expect(p.base).toBe("#10151B");
    expect(p.base2).toBe(mixHex("#10151B", "#333F48", 0.35));
    // Ink reads better than white on amber.
    expect(p.onp).toBe("#10151B");
    // Amber already clears 4.5:1 on the base: used as-is for text.
    expect(p.pt).toBe("#FBAC27");
  });

  it("keeps type legible for dark and saturated primaries", () => {
    const primaries = ["#1D2A6B", "#C8102E", "#7C3AED", "#0B6E4F", "#FFFFFF", "#000000", "#E63946"];
    for (const primary of primaries) {
      const p = deriveClubKitPalette({
        primary,
        secondary: "#14213D",
        juniors: "#2E4A3A",
        chalk: "#F2F5F8",
        junior: false,
      });
      expect(contrastRatio(p.pt, p.base), `${primary} as text`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.onp, p.p), `on ${primary}`).toBeGreaterThanOrEqual(
        Math.min(contrastRatio("#FFFFFF", p.p), contrastRatio("#10151B", p.p)),
      );
    }
  });

  it("swaps to the juniors palette for junior cards", () => {
    const p = deriveClubKitPalette({
      primary: "#FBAC27",
      secondary: "#333F48",
      juniors: "#42342B",
      chalk: "#F2F5F8",
      junior: true,
    });
    expect(p.base).toBe(mixHex("#42342B", "#000000", 0.45));
    expect(p.s).toBe("#42342B");
    const html = render(sampleCardInput("milestone"), "square", HALLS, true);
    expect(html).toContain(`--ck-base:${mixHex("#42342B", "#000000", 0.45)}`);
  });
});

describe("Club Kit designs", () => {
  it("declares its coverage literally for the server parity test", () => {
    expect(new Set(CLUB_KIT_COVERAGE.map((c) => c.kind))).toEqual(
      new Set(CLUB_KIT_PACK.designs.map((d) => d.kind)),
    );
  });

  it("is always in club colours, with no pack look", () => {
    expect(getPackManifest(ID).colourMode).toBe("club-only");
    const data = buildPackData({ brand: HALLS, packColourModes: { [ID]: "pack" } });
    expect(packColourModeFor(data, ID)).toBe("club");
  });

  it("renders every design natively at all four sizes, sponsors on and off", () => {
    for (const entry of CLUB_KIT_PACK.designs) {
      const f = entry.template.formats as Record<string, string>;
      for (const k of ["story", "portrait", "square", "landscape"]) {
        expect(f[k]?.length ?? 0, `${entry.designKey}.${k}`).toBeGreaterThan(0);
      }
      const input = sampleCardInput(entry.kind as ShareCardInput["kind"]);
      for (const size of SIZES) {
        for (const brand of [HALLS, null]) {
          const html = render(input, size, brand);
          const ctx = `${entry.designKey}/${size}/${brand ? "brand" : "brandless"}`;
          expect(html, ctx).not.toMatch(PLACEHOLDER_RE);
          expect(html, ctx).not.toContain("pack-landscape-fallback");
          expect(html, ctx).toContain('data-ck-rule="1"');
          expect(html, ctx).toContain("--ck-pt:");
        }
      }
    }
  });

  it("puts the frame beside the body on square / landscape and above it on tall formats", () => {
    const input = { ...sampleCardInput("milestone"), photoUrl: "https://cdn.example/p.jpg" };
    expect(render(input as ShareCardInput, "square")).toContain('data-ck-frame="side"');
    expect(render(input as ShareCardInput, "landscape")).toContain('data-ck-frame="side"');
    expect(render(input as ShareCardInput, "portrait")).toContain('data-ck-frame="top"');
    const story = render(input as ShareCardInput, "story");
    expect(story).toContain('data-ck-frame="top"');
    // The frame grows down to the copy, never shorter than the story minimum.
    expect(story).toContain('data-ck-frame-space="1"');
    expect(story).toContain("min-height:46cqh");
    // Frame photos favour the top of the shot until a focal point is set.
    expect(story).toContain("object-position:50% 22%");
    expect(story).toContain('<img src="https://cdn.example/p.jpg"');
  });

  it("shows the monogram without a crest and the crest (plus watermark) with one", () => {
    const input = sampleCardInput("matchSummary");
    const noCrest = render(input, "square");
    expect(noCrest).toContain(">DD</div>");
    expect(noCrest).not.toContain("opacity:.07");
    const crest = render(input, "square", { ...HALLS, logoUrl: "https://cdn.example/crest.png" });
    expect(crest).not.toContain(">DD</div>");
    expect(crest.match(/crest\.png/g)?.length).toBe(2);
    expect(crest).toContain("opacity:.07");
  });

  it("headlines the result in one word, the club on the top bar", () => {
    expect(resultWord("club", "Won by 5 wickets")).toBe("WIN");
    expect(resultWord("opposition", "Lost by 12 runs")).toBe("RESULT");
    expect(resultWord("draw", "Match drawn")).toBe("DRAW");
    expect(resultWord("draw", "Match tied")).toBe("TIE");
    expect(resultWord("opposition", "No result — rain")).toBe("NO RESULT");
    const html = render(sampleCardInput("matchSummary"), "square");
    expect(html).toMatch(/>WIN<\/div>/);
    expect(html.indexOf("Sample Club")).toBeLessThan(html.indexOf("Rival Club"));
  });

  it("leads each score bar with the club's logo, the name only when there's no logo", () => {
    const base = sampleCardInput("matchSummary") as Extract<
      ShareCardInput,
      { kind: "matchSummary" }
    >;
    const input = {
      ...base,
      club: { ...base.club, name: "Rockingham-Mandurah", logoUrl: "https://cdn.example/rm.png" },
      opposition: { ...base.opposition, name: "Subiaco-Floreat", logoUrl: null },
    };
    for (const size of ["square", "portrait", "story", "landscape"] as const) {
      const html = render(input, size);
      expect(html, size).toContain("rm.png");
      expect(html, size).toContain("display:none");
      // The opposition (no logo) is named; the club's name sits only in the header.
      expect(html, size).toMatch(/>Subiaco-Floreat<\/div>/);
      expect(html, size).not.toMatch(/>Rockingham-Mandurah<\/div>/);
      expect(html, size).not.toMatch(/\{\{/);
    }
  });

  it("serves Runs, Wickets, Catches and Dismissals leaderboards", () => {
    const base = sampleCardInput("clubLeaderboard") as Extract<
      ShareCardInput,
      { kind: "clubLeaderboard" }
    >;
    for (const category of ["Runs", "Wickets", "Catches", "Dismissals"] as const) {
      const t = resolveTemplate({ ...base, category } as ShareCardInput, ID);
      expect(t?.designKey).toBe(`club-leaderboard-${category.toLowerCase()}`);
    }
    // A pack without a Catches design keeps serving it from Runs.
    const bd = resolveTemplate({ ...base, category: "Catches" } as ShareCardInput);
    expect(bd?.designKey).toBe("club-leaderboard-runs");
  });

  it("draws leader bars proportional to the best value, the best row on primary", () => {
    const base = sampleCardInput("clubLeaderboard") as Extract<
      ShareCardInput,
      { kind: "clubLeaderboard" }
    >;
    const input = {
      ...base,
      leaders: [
        { gradeLabel: "A GRADE", playerName: "Leader One", value: "200" },
        { gradeLabel: "B GRADE", playerName: "Leader Two", value: "400" },
      ],
    } as ShareCardInput;
    const html = render(input, "square");
    expect(html).toContain("width:50%");
    const two = html.indexOf("Leader Two");
    const topBar = html.lastIndexOf("width:100%;background:var(--ck-p", two);
    expect(topBar).toBeGreaterThan(html.indexOf("Leader One"));
  });
});

describe("Club Kit-only kinds", () => {
  it("game day lists every grade this round", () => {
    const html = render(sampleCardInput("roundFixtures"), "portrait");
    for (const opp of ["Baldivis", "Rockingham", "Pinjarra", "Mandurah"]) {
      expect(html).toContain(`v ${opp}`);
    }
    expect(html).toContain(">GAME<br>");
  });

  it("the trading card binds its stats, cap and card photo", () => {
    const input = {
      ...sampleCardInput("tradingCard"),
      photoUrl: "https://cdn.example/card.jpg",
    } as ShareCardInput;
    const html = render(input, "story");
    expect(html).toContain("#242");
    expect(html).toContain("1,294");
    expect(html).toContain('<img src="https://cdn.example/card.jpg"');
    expect(html).toContain("rotate(-3deg)");
    const noCap = render({ ...input, capNumber: null } as ShareCardInput, "square");
    expect(noCap).not.toContain("#242");
  });

  it("junior highlights are always junior: juniors palette, first name + initial only", () => {
    const html = render(sampleCardInput("juniorHighlights"), "square");
    expect(html).toContain(`--ck-base:${mixHex("#42342B", "#000000", 0.45)}`);
    expect(html).toContain("Riley T.");
    expect(html).not.toContain("Thompson");
    expect(html).not.toContain("Morgan");
    expect(html).toContain("First names and initials only");
  });
});
