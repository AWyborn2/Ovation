import { describe, it, expect } from "vitest";
import {
  DEFAULT_BRAND,
  snapHexToAccentToken,
  resolveAccentToken,
  ACCENT_HEX,
  type AccentToken,
  type ClubBrand,
} from "@workspace/scorecard";
import {
  ACCENT_TOKENS,
  deriveThemeTokens,
  hexToHsl,
  hexToHslTriplet,
  hslString,
} from "./theme-tokens";

// Halls Head's real legacy brand values (mirrors lib/scorecard/src/brand.ts's
// HALLS_HEAD_BRAND, kept local so this test doesn't depend on an export not
// meant for runtime use outside the seed script). Deliberately WITHOUT an
// explicit accentToken, to exercise the legacy-hex snapping path.
const HALLS_HEAD_LEGACY: ClubBrand = {
  name: "Halls Head Cricket Club",
  shortName: "HHCC",
  logoUrl: "https://example.test/logo.png",
  logoUrl128: "https://example.test/logo128.png",
  backgroundColour: "#333F48",
  primaryColour: "#FBAC27",
  juniorsColour: "#42342B",
  backgroundUrl: null,
  faviconUrl: null,
};

const ALL_ACCENTS = Object.keys(ACCENT_TOKENS) as AccentToken[];

// The design system's fixed navy surface values — used by the fallback path
// (no backgroundColour, L > 60%, or useNavyBase=true).
const DARK_SURFACES: Record<string, string> = {
  "--background": "222 33% 8%", // #0B0F1A
  "--card": "220 30% 11%", // #131826
  "--muted": "222 28% 16%", // #1B2236
  "--border": "220 23% 21%", // #232B3D
  "--foreground": "220 20% 96%", // #F5F7FA
  "--muted-foreground": "218 12% 60%", // #8D96A8
};
const LIGHT_SURFACES: Record<string, string> = {
  "--background": "220 25% 97%", // #F5F6FA
  "--card": "0 0% 100%", // #FFFFFF
  "--muted": "220 20% 94%", // #EBEDF2
  "--border": "220 20% 88%", // #D9DDE6
  "--foreground": "222 30% 12%", // #14171F
  "--muted-foreground": "218 12% 42%", // #5D6472
};

describe("hexToHsl / hexToHslTriplet", () => {
  it("converts known hex values to the expected HSL triplet", () => {
    expect(hexToHsl("#FBAC27")).toEqual({ h: 38, s: 96, l: 57 });
    expect(hexToHslTriplet("#FBAC27")).toBe("38 96% 57%");
  });

  it("returns null for an unparseable value", () => {
    expect(hexToHsl(null)).toBeNull();
    expect(hexToHsl(undefined)).toBeNull();
    expect(hexToHsl("not-a-colour")).toBeNull();
  });

  it("round-trips hslString", () => {
    expect(hslString({ h: 10, s: 20, l: 30 })).toBe("10 20% 30%");
  });

  it("ACCENT_TOKENS triplets are the exact conversions of ACCENT_HEX", () => {
    for (const token of ALL_ACCENTS) {
      expect(hexToHslTriplet(ACCENT_HEX[token]), token).toBe(ACCENT_TOKENS[token]);
    }
  });
});

describe("snapHexToAccentToken / resolveAccentToken", () => {
  it("snaps Halls Head's gold to amber, preserving its look", () => {
    expect(snapHexToAccentToken("#FBAC27")).toBe("amber");
    expect(resolveAccentToken(HALLS_HEAD_LEGACY)).toBe("amber");
  });

  it("each canonical accent hex snaps back to its own token", () => {
    for (const token of ALL_ACCENTS) {
      expect(snapHexToAccentToken(ACCENT_HEX[token]), token).toBe(token);
    }
  });

  it("greys and unparseable values land on the platform default (amber)", () => {
    expect(snapHexToAccentToken("#888888")).toBe("amber");
    expect(snapHexToAccentToken(null)).toBe("amber");
    expect(snapHexToAccentToken("nope")).toBe("amber");
  });

  it("an explicit accentToken wins over any stored hex", () => {
    expect(
      resolveAccentToken({ ...HALLS_HEAD_LEGACY, accentToken: "purple" }),
    ).toBe("purple");
  });

  it("the default brand resolves to amber", () => {
    expect(resolveAccentToken(DEFAULT_BRAND)).toBe("amber");
  });
});

describe("deriveThemeTokens: navy fallback (no backgroundColour, L > 60%, or useNavyBase)", () => {
  // No backgroundColour set — surfaces fall back to fixed navy.
  const NO_BG_BRAND: ClubBrand = { name: "No BG FC", primaryColour: "#FFB238" };

  // backgroundColour too light (L=87% > 60%) — surfaces fall back to navy.
  const LIGHT_BG_BRAND: ClubBrand = {
    name: "Light BG FC",
    backgroundColour: "#CCDDEE",
    primaryColour: "#FFB238",
  };

  // Dark backgroundColour, but useNavyBase=true forces navy regardless.
  const NAVY_FORCED_BRAND: ClubBrand = {
    name: "Forced Navy FC",
    backgroundColour: "#7A2E4C", // L=33% — would derive without the flag
    primaryColour: "#FFB238",
    useNavyBase: true,
  };

  for (const [mode, surfaces] of [
    ["dark", DARK_SURFACES],
    ["light", LIGHT_SURFACES],
  ] as const) {
    for (const brandCase of [NO_BG_BRAND, LIGHT_BG_BRAND, NAVY_FORCED_BRAND]) {
      it(`${brandCase.name} (${mode}) uses the fixed navy surface scale`, () => {
        const tokens = deriveThemeTokens(brandCase, mode);
        for (const [key, value] of Object.entries(surfaces)) {
          expect(tokens[key], key).toBe(value);
        }
      });
    }
  }

  it("dark-mode accent slots carry the direct hex→HSL of primaryColour", () => {
    // Halls Head has a dark backgroundColour so it derives surfaces, but
    // the accent slots are purely from primaryColour and are unaffected.
    const tokens = deriveThemeTokens(HALLS_HEAD_LEGACY, "dark");
    // #FBAC27 → "38 96% 57%" (exact hex→HSL, not the ACCENT_TOKENS.amber snap)
    const expected = hexToHslTriplet(HALLS_HEAD_LEGACY.primaryColour)!;
    expect(tokens["--primary"]).toBe(expected);
    expect(tokens["--accent"]).toBe(expected);
    expect(tokens["--ring"]).toBe(expected);
    // L=57 > 55 → dark navy foreground on the accent fill.
    expect(tokens["--primary-foreground"]).toBe("222 33% 8%");
  });

  it("preset ACCENT_HEX colours produce the same HSL as ACCENT_TOKENS (round-trip)", () => {
    // This verifies the claim in the deriveThemeTokens comment: preset hex
    // values were derived from ACCENT_TOKENS HSL values, so they round-trip
    // cleanly. Existing tenants whose primaryColour is an ACCENT_HEX value
    // see no visual change.
    for (const token of ALL_ACCENTS) {
      const brand: ClubBrand = { name: "Preset Club", primaryColour: ACCENT_HEX[token] };
      const tokens = deriveThemeTokens(brand, "dark");
      expect(tokens["--primary"], token).toBe(ACCENT_TOKENS[token]);
    }
  });
});

describe("deriveThemeTokens: surfaces derived from backgroundColour", () => {
  // Halls Head #333F48 → hexToHsl: {h:206, s:17, l:24}
  // s_dark = min(17, 35) = 17; s_light = min(17, 20) = 17
  it("Halls Head (dark) derives surfaces from its background hue", () => {
    const tokens = deriveThemeTokens(HALLS_HEAD_LEGACY, "dark");
    expect(tokens["--background"]).toBe("206 17% 8%");
    expect(tokens["--card"]).toBe("206 15% 11%");   // Math.round(17*0.9)=15
    expect(tokens["--muted"]).toBe("206 14% 16%");   // Math.round(17*0.85)=14
    expect(tokens["--border"]).toBe("206 12% 21%");  // Math.round(17*0.7)=12
    // Foreground and accent are unaffected by the surface derivation.
    expect(tokens["--foreground"]).toBe("220 20% 96%");
    expect(tokens["--primary"]).toBe(hexToHslTriplet(HALLS_HEAD_LEGACY.primaryColour)!);
  });

  it("Halls Head (light) derives surfaces from its background hue", () => {
    const tokens = deriveThemeTokens(HALLS_HEAD_LEGACY, "light");
    expect(tokens["--background"]).toBe("206 17% 97%");
    expect(tokens["--card"]).toBe("0 0% 100%");
    expect(tokens["--muted"]).toBe("206 15% 94%");   // Math.round(17*0.9)=15
    expect(tokens["--border"]).toBe("206 14% 88%");  // Math.round(17*0.85)=14
    expect(tokens["--foreground"]).toBe("222 30% 12%");
  });

  // Wild #7A2E4C → hexToHsl: {h:336, s:45, l:33}; s_dark clamped to 35
  it("wild brand (dark) clamps saturation at 35 and uses its hue", () => {
    const wild: ClubBrand = { name: "Wild FC", backgroundColour: "#7A2E4C", primaryColour: "#2E7A5C" };
    const tokens = deriveThemeTokens(wild, "dark");
    expect(tokens["--background"]).toBe("336 35% 8%");
    expect(tokens["--card"]).toBe("336 32% 11%");    // Math.round(35*0.9)=32
    expect(tokens["--muted"]).toBe("336 30% 16%");   // Math.round(35*0.85)=30
    expect(tokens["--border"]).toBe("336 25% 21%");  // Math.round(35*0.7)=25
  });

  it("useNavyBase=true overrides a valid dark backgroundColour and restores navy", () => {
    const navyBrand: ClubBrand = { ...HALLS_HEAD_LEGACY, useNavyBase: true };
    const dark = deriveThemeTokens(navyBrand, "dark");
    expect(dark["--background"]).toBe("222 33% 8%");
    expect(dark["--card"]).toBe("220 30% 11%");
    const light = deriveThemeTokens(navyBrand, "light");
    expect(light["--background"]).toBe("220 25% 97%");
    expect(light["--card"]).toBe("0 0% 100%");
  });

  it("backgroundColour with L > 60% falls back to navy", () => {
    const lightBrand: ClubBrand = { name: "Light FC", backgroundColour: "#CCDDEE" }; // L=87%
    const tokens = deriveThemeTokens(lightBrand, "dark");
    expect(tokens["--background"]).toBe("222 33% 8%");
    expect(tokens["--card"]).toBe("220 30% 11%");
  });
});

describe("deriveThemeTokens: light and dark are genuinely distinct (Phase 5 AE3)", () => {
  it("light vs dark produce different backgrounds, cards, and borders", () => {
    const dark = deriveThemeTokens(DEFAULT_BRAND, "dark");
    const light = deriveThemeTokens(DEFAULT_BRAND, "light");
    for (const key of ["--background", "--card", "--border", "--foreground", "--muted"]) {
      expect(dark[key], key).not.toBe(light[key]);
    }
  });
});

describe("deriveThemeTokens: every preset accent hex is valid and distinct in both modes", () => {
  // The theme engine reads primaryColour directly (not accentToken), so each
  // ACCENT_HEX value must produce a distinct --primary in both modes.
  for (const mode of ["light", "dark"] as const) {
    it(`each preset accent hex produces a distinct --primary (${mode})`, () => {
      const primaries = ALL_ACCENTS.map(
        (token) =>
          deriveThemeTokens({ name: "Any Club", primaryColour: ACCENT_HEX[token] }, mode)[
            "--primary"
          ],
      );
      expect(new Set(primaries).size).toBe(ALL_ACCENTS.length);
      for (const p of primaries) {
        expect(p).toMatch(/^\d+ \d+% \d+%$/);
      }
    });

    it(`accent slots are identical across modes (${mode} vs dark)`, () => {
      for (const token of ALL_ACCENTS) {
        const brand: ClubBrand = { name: "Any Club", primaryColour: ACCENT_HEX[token] };
        expect(deriveThemeTokens(brand, mode)["--primary"]).toBe(
          deriveThemeTokens(brand, "dark")["--primary"],
        );
      }
    });
  }

  it("no primaryColour falls back to amber", () => {
    const tokens = deriveThemeTokens({ name: "Bare Club" }, "dark");
    expect(tokens["--primary"]).toBe(ACCENT_TOKENS.amber);
  });
});

describe("deriveThemeTokens: totality / edge cases", () => {
  const TOKEN_KEYS = Object.keys(deriveThemeTokens(DEFAULT_BRAND, "dark"));

  const edgeCases: Array<[string, ClubBrand]> = [
    ["all-black background", { ...DEFAULT_BRAND, backgroundColour: "#000000" }],
    ["all-white background", { ...DEFAULT_BRAND, backgroundColour: "#FFFFFF" }],
    ["missing juniorsColour", { ...DEFAULT_BRAND, juniorsColour: null }],
    ["missing everything", { name: "No Brand FC" }],
    ["bogus accent token", { name: "Bogus FC", accentToken: "chartreuse" as AccentToken }],
    ["useNavyBase true, no backgroundColour", { name: "Navy FC", useNavyBase: true }],
  ];

  for (const [label, brand] of edgeCases) {
    for (const mode of ["light", "dark"] as const) {
      it(`${label} (${mode}) never throws and returns a value for every token`, () => {
        const tokens = deriveThemeTokens(brand, mode);
        for (const key of TOKEN_KEYS) {
          expect(tokens[key], key).toBeTruthy();
        }
      });
    }
  }
});
