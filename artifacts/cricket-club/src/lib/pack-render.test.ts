import { describe, expect, it } from "vitest";
import {
  renderPackCard,
  packSupportsKind,
  resolvePackTokens,
  tokensFromCardTheme,
  JUNIOR_PANEL,
  type PackTokens,
} from "./pack-render";
import { sampleCardInput } from "./sample-card-inputs";
import type { ShareCardInput, CardSize, LadderRow } from "./share-card";

// A distinct value per source at each token, so the winning source is
// unambiguous in the resolution-order assertions below.
const BRAND: PackTokens = {
  accent: "#B7A100", // brand
  panel: "#111111", // brand
  ink: "#000000",
  textLight: "#EEEEEE",
  displayFont: "anton",
};

const TOKENS: PackTokens = {
  accent: "#FBAC27",
  panel: "#6E1C2B",
  ink: "#101216",
  textLight: "#F5F2E8",
  displayFont: "anton",
};

const hasUnresolved = (html: string) => /\{\{/.test(html);

describe("renderPackCard", () => {
  it("binds a full matchSummary sample into all three sizes with no unresolved placeholders", () => {
    const input = sampleCardInput("matchSummary");
    for (const size of ["square", "portrait", "story"] as CardSize[]) {
      const html = renderPackCard(input, size, true, TOKENS, false);
      expect(html.length).toBeGreaterThan(0);
      expect(hasUnresolved(html)).toBe(false);
      // The bound match title from the sample must appear.
      expect(html).toContain("A Grade");
    }
  });

  it("supports every card kind in the pack", () => {
    const kinds: ShareCardInput["kind"][] = [
      "milestone", "player", "record", "gradeLeader", "premiership",
      "debut", "newCap", "century", "fiveFor", "matchSummary", "matchDay",
      "teamList", "weekendWrap", "ladder", "bigMoment", "newSigning",
      "countdown", "clubLeaderboard",
    ];
    for (const kind of kinds) {
      expect(packSupportsKind(kind)).toBe(true);
      const html = renderPackCard(sampleCardInput(kind), "square", true, TOKENS, false);
      expect(hasUnresolved(html)).toBe(false);
    }
  });

  it("renders the hashtag-footer variant (not the sponsor strip) when sponsors are off", () => {
    const input = sampleCardInput("matchSummary");
    const off = renderPackCard(input, "story", false, TOKENS, false);
    expect(off).not.toContain("PROUDLY SUPPORTED BY");
    // The story sponsors-off branch is the centered hashtag footer.
    expect(off).toContain("#HALLSHEAD");

    const on = renderPackCard(input, "story", true, TOKENS, false);
    expect(on).toContain("PROUDLY SUPPORTED BY");
  });

  it("forces the brown junior panel token regardless of the supplied tokens", () => {
    const input = { ...sampleCardInput("matchSummary"), junior: true } as ShareCardInput;
    const html = renderPackCard(input, "story", true, TOKENS, true);
    expect(html).toMatch(/--panel:\s*#42342B/i);
  });

  it("renders placeholder markup (never an empty img src) for a missing photo/logo", () => {
    // The matchSummary sample carries no logo/photo URLs.
    const html = renderPackCard(sampleCardInput("matchSummary"), "story", true, TOKENS, false);
    expect(html).not.toContain('src=""');
    expect(html).toContain("pack-slot-placeholder");
  });

  it("html-escapes user-supplied text to prevent injection", () => {
    const base = sampleCardInput("matchSummary");
    const input = {
      ...base,
      matchTitle: `Round 5 & 6 <script>alert("xss")</script>`,
    } as ShareCardInput;
    const html = renderPackCard(input, "story", true, TOKENS, false);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("expands the ladder repeat to exactly the number of rows supplied", () => {
    const base = sampleCardInput("ladder");
    const rowCell = /width:92px;text-align:center;font-family:var\(--disp/g;

    const oneRow = {
      ...base,
      rows: [{ pos: 1, team: "Solo Club", played: 1, won: 1, lost: 0, points: 6 } as LadderRow],
    } as ShareCardInput;
    const html1 = renderPackCard(oneRow, "story", true, TOKENS, false);
    expect((html1.match(rowCell) ?? []).length).toBe(1);

    // The seven-row sample.
    const html7 = renderPackCard(base, "story", true, TOKENS, false);
    expect((html7.match(rowCell) ?? []).length).toBe(7);
    for (const team of ["Halls Head", "Dawesville"]) expect(html7).toContain(team);
  });

  it("applies the club-highlight row variant to the isClub ladder row", () => {
    const base = sampleCardInput("ladder");
    const withClub = {
      ...base,
      rows: [
        { pos: 1, team: "Halls Head", played: 8, won: 7, lost: 1, points: 42, isClub: true },
        { pos: 2, team: "Baldivis", played: 8, won: 6, lost: 2, points: 38 },
      ] as LadderRow[],
    } as ShareCardInput;
    const html = renderPackCard(withClub, "story", true, TOKENS, false);
    expect(html).toContain('data-repeat-variant="club"');

    const noClub = {
      ...base,
      rows: [
        { pos: 1, team: "Baldivis", played: 8, won: 6, lost: 2, points: 38 },
        { pos: 2, team: "Mandurah", played: 8, won: 5, lost: 3, points: 33 },
      ] as LadderRow[],
    } as ShareCardInput;
    const htmlNoClub = renderPackCard(noClub, "story", true, TOKENS, false);
    expect(htmlNoClub).not.toContain('data-repeat-variant="club"');
  });

  it("maps a displayFont key into the --disp font family (bebas → 'Bebas Neue')", () => {
    const bebasTokens: PackTokens = { ...TOKENS, displayFont: "bebas" };
    const html = renderPackCard(sampleCardInput("player"), "square", true, bebasTokens, false);
    expect(html).toMatch(/--disp:\s*'Bebas Neue'/);
  });

  it("falls back sanely for an unknown size", () => {
    const html = renderPackCard(
      sampleCardInput("ladder"),
      "banner" as unknown as CardSize,
      true,
      TOKENS,
      false,
    );
    expect(html.length).toBeGreaterThan(0);
    expect(hasUnresolved(html)).toBe(false);
  });
});

describe("resolvePackTokens (token resolution order)", () => {
  it("uses the brand default when there is no theme and no override", () => {
    // Brand-derived default used when no theme rows / null theme.
    expect(resolvePackTokens({ brand: BRAND, theme: null })).toEqual(BRAND);
    expect(resolvePackTokens({ brand: BRAND, theme: tokensFromCardTheme(null) })).toEqual(BRAND);
  });

  it("lets a theme override the brand default", () => {
    const theme = tokensFromCardTheme({ accent: "#22AA22", bgPanel: "#333333", displayFont: "oswald" });
    const resolved = resolvePackTokens({ brand: BRAND, theme });
    expect(resolved.accent).toBe("#22AA22"); // theme wins over brand
    expect(resolved.panel).toBe("#333333"); // bgPanel → panel
    expect(resolved.displayFont).toBe("oswald");
    expect(resolved.ink).toBe(BRAND.ink); // theme carried no ink → brand kept
  });

  it("applies precedence junior > override > theme > brand for every token", () => {
    const theme: Partial<PackTokens> = { accent: "#THEME0", panel: "#THEMEP", displayFont: "oswald" };
    const override: Partial<PackTokens> = { panel: "#OVERRP", displayFont: "teko" };

    // No junior: override beats theme beats brand.
    const resolved = resolvePackTokens({ brand: BRAND, theme, override });
    expect(resolved.accent).toBe("#THEME0"); // theme (override silent) beats brand
    expect(resolved.panel).toBe("#OVERRP"); // override beats theme
    expect(resolved.displayFont).toBe("teko"); // override beats theme
    expect(resolved.ink).toBe(BRAND.ink); // brand only

    // Junior forces the brown panel over everything (override/theme/brand).
    const junior = resolvePackTokens({ brand: BRAND, theme, override, junior: true });
    expect(junior.panel).toBe(JUNIOR_PANEL);
    // Non-panel tokens still resolve by the normal order.
    expect(junior.accent).toBe("#THEME0");
    expect(junior.displayFont).toBe("teko");
  });

  it("junior ignores the theme entirely for the panel (brown wins)", () => {
    const theme = tokensFromCardTheme({ bgPanel: "#ABCDEF", accent: "#123456" });
    const resolved = resolvePackTokens({ brand: BRAND, theme, junior: true });
    expect(resolved.panel).toBe(JUNIOR_PANEL);
  });

  it("tokensFromCardTheme drops null/empty fields so they do not clobber the brand", () => {
    const partial = tokensFromCardTheme({ accent: "#FF0000", bgPanel: "", bgDark: null, displayFont: null });
    expect(partial).toEqual({ accent: "#FF0000" });
    const resolved = resolvePackTokens({ brand: BRAND, theme: partial });
    expect(resolved.accent).toBe("#FF0000");
    expect(resolved.panel).toBe(BRAND.panel);
    expect(resolved.displayFont).toBe(BRAND.displayFont);
  });
});
