import { describe, expect, it } from "vitest";
import {
  brandDefaultTokens,
  clubStageInk,
  contrastRatio,
  darkenHex,
  LIGHT_TYPE_REF,
  PACK_DEFAULT_TOKENS,
  resolvePackTokens,
  rootStyle,
  stageInk,
  tokensFromCardTheme,
} from "./tokens";
import { packColourModeFor, renderPackCard, resolveCardTokens } from "./render";
import { JUNIOR_PANEL, type PackCardData } from "./types";
import { getPackManifest } from "../pack-templates/registry";
import {
  SUNSET_BASE,
  SUNSET_CLUB_BASE,
  SUNSET_CLUB_SKY,
  SUNSET_SKY,
} from "../pack-templates/sunset/fragments";
import { buildPackData } from "../pack-card-data";
import { sampleCardInput } from "../sample-card-inputs";

/** Navy/red: a club whose colours are nothing like the packs' defaults. */
const NAVY_RED = { name: "Navy CC", primaryColour: "#E63946", backgroundColour: "#14213D" };
/** The seeded "Club Classic" theme that used to outrank every club's brand. */
const CLUB_CLASSIC = {
  accent: "#FBAC27",
  bgPanel: "#42342B",
  bgDark: "#322F3D",
  textLight: "#F5F2E8",
  displayFont: "bebas",
};

const data = (brand: PackCardData["brand"], modes?: Record<string, string>): PackCardData =>
  buildPackData({ brand, packColourModes: modes });

describe("club colours: brand → tokens", () => {
  it("derives ink, panel and accent from the club's brand", () => {
    const t = brandDefaultTokens(NAVY_RED, "club");
    expect(t.accent).toBe("#E63946");
    expect(t.panel).toBe("#14213D");
    expect(t.ink).toBe(darkenHex("#14213D", 0.55)!.toUpperCase());
    expect(t.textLight).toBe(PACK_DEFAULT_TOKENS.textLight);
  });

  it("uses the juniors colour for the panel only when there is no background", () => {
    const t = brandDefaultTokens({ primaryColour: "#E63946", juniorsColour: "#2E4A3A" }, "club");
    expect(t.panel).toBe("#2E4A3A");
    // No background → the fixed stage.
    expect(t.ink).toBe(PACK_DEFAULT_TOKENS.ink);
  });

  it("pack mode is the historical mapping (juniors → panel, fixed ink)", () => {
    const brand = { ...NAVY_RED, juniorsColour: "#2E4A3A" };
    expect(brandDefaultTokens(brand, "pack")).toEqual({
      ...PACK_DEFAULT_TOKENS,
      accent: "#E63946",
      panel: "#2E4A3A",
    });
    expect(brandDefaultTokens(brand)).toEqual(brandDefaultTokens(brand, "pack"));
  });
});

describe("club colours beat the card theme", () => {
  const theme = tokensFromCardTheme(CLUB_CLASSIC);

  it("club mode: brand accent, panel and ink win; the theme keeps font and text colour", () => {
    const t = resolvePackTokens({
      brand: brandDefaultTokens(NAVY_RED, "club"),
      theme,
      mode: "club",
    });
    expect(t.accent).toBe("#E63946");
    expect(t.panel).toBe("#14213D");
    expect(t.ink).toBe(clubStageInk("#14213D"));
    expect(t.displayFont).toBe("bebas");
    expect(t.textLight).toBe("#F5F2E8");
  });

  it("pack mode keeps theme > brand", () => {
    const t = resolvePackTokens({ brand: brandDefaultTokens(NAVY_RED, "pack"), theme });
    expect(t.accent).toBe("#FBAC27");
    expect(t.panel).toBe("#42342B");
    expect(t.ink).toBe("#322F3D");
  });

  it("per-card overrides win in both modes", () => {
    for (const mode of ["club", "pack"] as const) {
      const d = buildPackData({
        brand: NAVY_RED,
        packColourModes: { "broadcast-dark-v1": mode },
        tokenOverride: { accent: "#00FF88", panel: "#223344" },
      });
      const t = resolveCardTokens({ theme: CLUB_CLASSIC, junior: false, data: d, packId: null });
      expect(t.accent, mode).toBe("#00FF88");
      expect(t.panel, mode).toBe("#223344");
    }
  });

  it("junior forces the junior panel in both modes", () => {
    for (const mode of ["club", "pack"] as const) {
      const d = data(NAVY_RED, { "broadcast-dark-v1": mode });
      const t = resolveCardTokens({ theme: CLUB_CLASSIC, junior: true, data: d, packId: null });
      expect(t.panel, mode).toBe(JUNIOR_PANEL);
      expect(rootStyle(t, true, "square")).toContain(`--panel:${JUNIOR_PANEL}`);
    }
  });
});

describe("mode resolution", () => {
  it("defaults every pack to club colours and honours a per-pack switch", () => {
    const d = data(NAVY_RED, { "sunset-v1": "pack" });
    expect(packColourModeFor(d, "neon-night-v1")).toBe("club");
    expect(packColourModeFor(d, "sunset-v1")).toBe("pack");
    // Omitted / unknown pack ids resolve like the renderer: the default pack.
    expect(packColourModeFor(d, null)).toBe("club");
    expect(packColourModeFor(data(NAVY_RED, { "broadcast-dark-v1": "pack" }), "nope")).toBe("pack");
  });

  it("a brand without usable colours always gets the pack's own look", () => {
    expect(packColourModeFor(data(null), "sunset-v1")).toBe("pack");
    expect(packColourModeFor(data({ name: "No Colours CC" }), "sunset-v1")).toBe("pack");
    expect(packColourModeFor(data({ primaryColour: "red" }), "sunset-v1")).toBe("pack");
  });
});

describe("legibility clamp", () => {
  it.each(["#FFFFFF", "#F2F2F2", "#FFE8A3", "#8ECAE6", "#333F48", "#14213D"])(
    "a %s background keeps light type at 4.5:1 on the stage and panel",
    (bg) => {
      const t = brandDefaultTokens({ backgroundColour: bg, primaryColour: "#E63946" }, "club");
      for (const text of [LIGHT_TYPE_REF, PACK_DEFAULT_TOKENS.textLight, "#FFFFFF"]) {
        expect(contrastRatio(t.ink, text), `ink ${t.ink} vs ${text}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.panel, text), `panel ${t.panel} vs ${text}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    },
  );

  it("a dark background is darkened by the default 55% only", () => {
    expect(clubStageInk("#333F48")).toBe(darkenHex("#333F48", 0.55)!.toUpperCase());
  });

  it("a pale background is darkened past 55% until the type clears 4.5:1", () => {
    const ink = clubStageInk("#FFFFFF")!;
    expect(ink).not.toBe(darkenHex("#FFFFFF", 0.55)!.toUpperCase());
    expect(contrastRatio(ink, LIGHT_TYPE_REF)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("brand colours stay an injection boundary", () => {
  it.each([
    '#fff"><img src=x onerror=alert(1)>',
    "red",
    "rgb(1,2,3)",
    "#12345",
    "url(javascript:alert(1))",
    "#000;background:url(x)",
  ])("rejects %s and falls back to the defaults", (bad) => {
    const t = brandDefaultTokens({ primaryColour: bad, backgroundColour: bad }, "club");
    expect(t).toEqual(PACK_DEFAULT_TOKENS);
    expect(clubStageInk(bad)).toBeNull();
  });

  it("sanitises per-card override colours and font keys too", () => {
    const d = buildPackData({
      brand: NAVY_RED,
      tokenOverride: {
        accent: '#fff"><script>',
        panel: "blue",
        displayFont: "constructor",
      },
    });
    const t = resolveCardTokens({ theme: null, junior: false, data: d, packId: null });
    expect(t.accent).toBe("#E63946");
    expect(t.panel).toBe("#14213D");
    expect(t.displayFont).toBe("anton");
  });

  it("keeps the auto-contrast ink on the accent", () => {
    const t = brandDefaultTokens({ ...NAVY_RED, primaryColour: "#14213D" }, "club");
    expect(rootStyle(t, false, "square")).toContain("--accent-ink:#FFFFFF");
    const light = brandDefaultTokens({ ...NAVY_RED, primaryColour: "#F2C94C" }, "club");
    expect(rootStyle(light, false, "square")).toContain("--accent-ink:#10151B");
  });
});

describe("tinted packs lean to the club in club mode", () => {
  it.each(["gold-foil-v1", "neon-night-v1", "sunset-v1"])("%s", (packId) => {
    const tint = getPackManifest(packId).inkTint!;
    expect(tint.clubTenantWeight).toBeGreaterThanOrEqual(80);
    expect(tint.clubTenantWeight).toBeGreaterThan(tint.tenantWeight);
    const t = brandDefaultTokens(NAVY_RED, "club");
    expect(stageInk(t, tint, "club")).toBe(
      `color-mix(in srgb, ${t.ink} ${tint.clubTenantWeight}%, ${tint.toward})`,
    );
    expect(stageInk(t, tint, "pack")).toBe(
      `color-mix(in srgb, ${t.ink} ${tint.tenantWeight}%, ${tint.toward})`,
    );
  });

  it("the rendered stage carries the mode's weight", () => {
    const input = sampleCardInput("century");
    for (const packId of ["gold-foil-v1", "neon-night-v1"]) {
      const tint = getPackManifest(packId).inkTint!;
      for (const mode of ["club", "pack"] as const) {
        const d = data(NAVY_RED, { [packId]: mode });
        const tokens = resolveCardTokens({ theme: null, junior: false, data: d, packId });
        const html = renderPackCard(input, "square", true, tokens, false, d, packId);
        const w = mode === "club" ? tint.clubTenantWeight : tint.tenantWeight;
        expect(html, `${packId}/${mode}`).toContain(`--ink:color-mix(in srgb, ${tokens.ink} ${w}%`);
      }
    }
  });
});

describe("Sunset sky", () => {
  const input = sampleCardInput("century");
  const render = (mode: "club" | "pack") => {
    const d = data(NAVY_RED, { "sunset-v1": mode });
    const tokens = resolveCardTokens({ theme: null, junior: false, data: d, packId: "sunset-v1" });
    return renderPackCard(input, "square", true, tokens, false, d, "sunset-v1");
  };

  it("club mode builds the sky from the club's colours", () => {
    const html = render("club");
    expect(html).toContain(SUNSET_CLUB_SKY);
    expect(html).toContain(SUNSET_CLUB_BASE);
    expect(html).not.toContain(SUNSET_SKY);
    expect(html).not.toContain(SUNSET_BASE);
    // The club sky is drawn from the club's tokens, never fixed colours.
    expect(SUNSET_CLUB_SKY).toContain("var(--gold");
    expect(SUNSET_CLUB_SKY).toContain("var(--ink");
    expect(SUNSET_CLUB_SKY).not.toMatch(/rgba\(/);
  });

  it("pack mode keeps the fixed orange → magenta → plum sky", () => {
    const html = render("pack");
    expect(html).toContain(SUNSET_SKY);
    expect(html).toContain(SUNSET_BASE);
    expect(html).not.toContain(SUNSET_CLUB_SKY);
  });

  it("only Sunset swaps markup", () => {
    for (const m of ["broadcast-dark-v1", "gold-foil-v1", "bold-type-v1", "neon-night-v1"]) {
      expect(getPackManifest(m).clubSwaps, m).toBeUndefined();
    }
  });
});
