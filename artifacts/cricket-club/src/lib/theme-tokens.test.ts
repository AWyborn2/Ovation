import { describe, it, expect } from "vitest";
import { DEFAULT_BRAND, type ClubBrand } from "@workspace/scorecard";
import { deriveThemeTokens, hexToHsl, hexToHslTriplet, hslString } from "./theme-tokens";

// Halls Head's real brand values (mirrors lib/scorecard/src/brand.ts's
// HALLS_HEAD_BRAND, kept local so this test doesn't depend on an export not
// meant for runtime use outside the seed script).
const HALLS_HEAD_BRAND: ClubBrand = {
  name: "Halls Head Cricket Club",
  shortName: "HHCC",
  logoUrl: "https://example.test/logo.png",
  logoUrl128: "https://example.test/logo128.png",
  primaryColour: "#333F48",
  secondaryColour: "#FBAC27",
  tertiaryColour: "#42342B",
  backgroundUrl: "/hallshead-background.png",
  faviconUrl: null,
};

// index.css's pre-Phase-5 hardcoded literals (both :root and .dark were
// byte-identical duplicates of this before this phase).
const PRE_CHANGE_DARK_LITERALS: Record<string, string> = {
  "--background": "207 17% 24%",
  "--foreground": "0 0% 100%",
  "--border": "207 17% 35%",
  "--input": "207 17% 35%",
  "--ring": "46 96% 57%",
  "--card": "207 17% 27%",
  "--card-foreground": "0 0% 100%",
  "--card-border": "46 96% 57%",
  "--popover": "207 17% 27%",
  "--popover-foreground": "0 0% 100%",
  "--popover-border": "207 17% 35%",
  "--primary": "46 96% 57%",
  "--primary-foreground": "207 17% 24%",
  "--primary-border": "46 96% 50%",
  "--secondary": "25 20% 21%",
  "--secondary-foreground": "46 96% 57%",
  "--secondary-border": "25 20% 15%",
  "--muted": "207 17% 30%",
  "--muted-foreground": "207 10% 75%",
  "--muted-border": "207 17% 35%",
  "--accent": "46 96% 57%",
  "--accent-foreground": "207 17% 24%",
  "--accent-border": "46 96% 50%",
  "--destructive": "0 72% 51%",
  "--destructive-foreground": "0 0% 100%",
  "--destructive-border": "0 72% 45%",
};

// The 9 accent-family tokens Phase 2/3's applyBrandTheme already derived at
// runtime before this phase — a working browser never actually showed the
// static CSS literal for these (JS overrides it immediately), so the real
// "must not regress" reference is what that runtime conversion already
// produces (reimplemented here from applyBrandTheme's pre-Phase-5 logic),
// not the pre-JS placeholder literal in PRE_CHANGE_DARK_LITERALS.
function darkenHslTriplet(triplet: string, by: number): string {
  const [h, s, l] = triplet.split(" ");
  const lum = parseInt(l, 10);
  return `${h} ${s} ${Math.max(0, lum - by)}%`;
}
const accentTriplet = hexToHslTriplet(HALLS_HEAD_BRAND.secondaryColour)!;
const chromeTriplet = hexToHslTriplet(HALLS_HEAD_BRAND.primaryColour)!;
const ALREADY_RUNTIME_DERIVED: Record<string, string> = {
  "--primary": accentTriplet,
  "--ring": accentTriplet,
  "--accent": accentTriplet,
  "--card-border": accentTriplet,
  "--secondary-foreground": accentTriplet,
  "--primary-border": darkenHslTriplet(accentTriplet, 7),
  "--accent-border": darkenHslTriplet(accentTriplet, 7),
  "--primary-foreground": chromeTriplet,
  "--accent-foreground": chromeTriplet,
};

function parseTriplet(s: string): [number, number, number] {
  const [h, sPct, lPct] = s.split(" ");
  return [parseInt(h, 10), parseInt(sPct, 10), parseInt(lPct, 10)];
}

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
});

describe("deriveThemeTokens: dark mode matches Halls Head's current look (Phase 5 stop condition)", () => {
  const derived = deriveThemeTokens(HALLS_HEAD_BRAND, "dark");

  for (const token of Object.keys(PRE_CHANGE_DARK_LITERALS)) {
    const isRuntimeDerived = token in ALREADY_RUNTIME_DERIVED;
    const expected = isRuntimeDerived ? ALREADY_RUNTIME_DERIVED[token] : PRE_CHANGE_DARK_LITERALS[token];
    const tolerance = isRuntimeDerived ? 0 : 2;
    it(`${token} matches within tolerance ${tolerance}`, () => {
      const [eh, es, el] = parseTriplet(expected);
      const [ah, as_, al] = parseTriplet(derived[token]);
      expect(derived[token]).toBeDefined();
      expect(Math.abs(ah - eh)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(as_ - es)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(al - el)).toBeLessThanOrEqual(tolerance);
    });
  }
});

describe("deriveThemeTokens: brand-neutral regression (Phase 5 R14)", () => {
  // Tokens that are legitimately universal (not derived from brand hue at
  // all) and so are EXPECTED to coincide across brands — excluded from the
  // "never matches Halls Head" check.
  const UNIVERSAL_TOKENS = new Set([
    "--foreground",
    "--card-foreground",
    "--popover-foreground",
    "--destructive",
    "--destructive-foreground",
    "--destructive-border",
  ]);

  it("a brand-less tenant's dark palette never matches Halls Head's brand-derived values", () => {
    const hallsHeadDark = deriveThemeTokens(HALLS_HEAD_BRAND, "dark");
    const derived = deriveThemeTokens(DEFAULT_BRAND, "dark");
    for (const [token, hallsHeadValue] of Object.entries(hallsHeadDark)) {
      if (UNIVERSAL_TOKENS.has(token)) continue;
      expect(derived[token]).not.toBe(hallsHeadValue);
    }
  });

  it("a brand-less tenant's light palette never matches Halls Head's dark brand-derived values", () => {
    const hallsHeadDark = deriveThemeTokens(HALLS_HEAD_BRAND, "dark");
    const derived = deriveThemeTokens(DEFAULT_BRAND, "light");
    for (const [token, hallsHeadValue] of Object.entries(hallsHeadDark)) {
      if (UNIVERSAL_TOKENS.has(token)) continue;
      expect(derived[token]).not.toBe(hallsHeadValue);
    }
  });

  it("light and dark modes are genuinely distinct for the same brand", () => {
    const dark = deriveThemeTokens(HALLS_HEAD_BRAND, "dark");
    const light = deriveThemeTokens(HALLS_HEAD_BRAND, "light");
    let distinctCount = 0;
    for (const token of Object.keys(dark)) {
      if (dark[token] !== light[token]) distinctCount++;
    }
    expect(distinctCount).toBeGreaterThan(15);
  });
});

describe("deriveThemeTokens: totality / edge cases", () => {
  const edgeCases: Array<[string, ClubBrand]> = [
    ["all-black primary", { ...DEFAULT_BRAND, primaryColour: "#000000" }],
    ["all-white primary", { ...DEFAULT_BRAND, primaryColour: "#FFFFFF" }],
    ["missing tertiary", { ...DEFAULT_BRAND, tertiaryColour: null }],
    ["missing everything", { name: "No Brand FC" }],
  ];

  for (const [label, brand] of edgeCases) {
    for (const mode of ["light", "dark"] as const) {
      it(`${label} (${mode}) never throws and returns a value for every token`, () => {
        const tokens = deriveThemeTokens(brand, mode);
        for (const key of Object.keys(PRE_CHANGE_DARK_LITERALS)) {
          expect(tokens[key], key).toBeTruthy();
        }
      });
    }
  }
});
