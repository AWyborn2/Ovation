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
  primaryColour: "#333F48",
  secondaryColour: "#FBAC27",
  tertiaryColour: "#42342B",
  backgroundUrl: null,
  faviconUrl: null,
};

const ALL_ACCENTS = Object.keys(ACCENT_TOKENS) as AccentToken[];

// The design system's fixed surface values (Ovation UI migration §2/§4).
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

describe("deriveThemeTokens: fixed surfaces regardless of brand", () => {
  // A brand with an off-palette legacy hex — surfaces must still be the fixed
  // navy/paper scales; only the accent slots may vary.
  const WILD_BRAND: ClubBrand = {
    name: "Wild FC",
    primaryColour: "#7A2E4C",
    secondaryColour: "#2E7A5C",
  };

  for (const [mode, surfaces] of [
    ["dark", DARK_SURFACES],
    ["light", LIGHT_SURFACES],
  ] as const) {
    for (const brandCase of [DEFAULT_BRAND, HALLS_HEAD_LEGACY, WILD_BRAND]) {
      it(`${brandCase.name} (${mode}) gets the fixed surface scale`, () => {
        const tokens = deriveThemeTokens(brandCase, mode);
        for (const [key, value] of Object.entries(surfaces)) {
          expect(tokens[key], key).toBe(value);
        }
      });
    }
  }

  it("dark-mode accent slots carry the direct hex→HSL of secondaryColour", () => {
    const tokens = deriveThemeTokens(HALLS_HEAD_LEGACY, "dark");
    // #FBAC27 → "38 96% 57%" (exact hex→HSL, not the ACCENT_TOKENS.amber snap value)
    const expected = hexToHslTriplet(HALLS_HEAD_LEGACY.secondaryColour)!;
    expect(tokens["--primary"]).toBe(expected);
    expect(tokens["--accent"]).toBe(expected);
    expect(tokens["--ring"]).toBe(expected);
    // L=57 > 55 → dark navy foreground.
    expect(tokens["--primary-foreground"]).toBe("222 33% 8%");
  });

  it("preset ACCENT_HEX colours produce the same HSL as ACCENT_TOKENS (round-trip)", () => {
    // This verifies the claim in the deriveThemeTokens comment: preset hex
    // values were derived from ACCENT_TOKENS HSL values, so they round-trip
    // cleanly. Existing tenants whose secondaryColour is an ACCENT_HEX value
    // see no visual change.
    for (const token of ALL_ACCENTS) {
      const brand: ClubBrand = { name: "Preset Club", secondaryColour: ACCENT_HEX[token] };
      const tokens = deriveThemeTokens(brand, "dark");
      expect(tokens["--primary"], token).toBe(ACCENT_TOKENS[token]);
    }
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
  // The theme engine reads secondaryColour directly (not accentToken), so each
  // ACCENT_HEX value must produce a distinct --primary in both modes.
  for (const mode of ["light", "dark"] as const) {
    it(`each preset accent hex produces a distinct --primary (${mode})`, () => {
      const primaries = ALL_ACCENTS.map(
        (token) =>
          deriveThemeTokens({ name: "Any Club", secondaryColour: ACCENT_HEX[token] }, mode)[
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
        const brand: ClubBrand = { name: "Any Club", secondaryColour: ACCENT_HEX[token] };
        expect(deriveThemeTokens(brand, mode)["--primary"]).toBe(
          deriveThemeTokens(brand, "dark")["--primary"],
        );
      }
    });
  }

  it("no secondaryColour falls back to amber", () => {
    const tokens = deriveThemeTokens({ name: "Bare Club" }, "dark");
    expect(tokens["--primary"]).toBe(ACCENT_TOKENS.amber);
  });
});

describe("deriveThemeTokens: totality / edge cases", () => {
  const TOKEN_KEYS = Object.keys(deriveThemeTokens(DEFAULT_BRAND, "dark"));

  const edgeCases: Array<[string, ClubBrand]> = [
    ["all-black primary", { ...DEFAULT_BRAND, primaryColour: "#000000" }],
    ["all-white primary", { ...DEFAULT_BRAND, primaryColour: "#FFFFFF" }],
    ["missing tertiary", { ...DEFAULT_BRAND, tertiaryColour: null }],
    ["missing everything", { name: "No Brand FC" }],
    ["bogus accent token", { name: "Bogus FC", accentToken: "chartreuse" as AccentToken }],
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
