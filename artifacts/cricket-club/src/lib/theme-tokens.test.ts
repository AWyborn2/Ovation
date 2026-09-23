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
  applyThemeOverrides,
  deriveThemeTokens,
  hexToHsl,
  hexToHslTriplet,
  hslString,
  hslTripletToHex,
  isOverrideColourKey,
  OVERRIDE_COLOUR_KEYS,
  tripletContrast,
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
  "--background": "207 29% 6%", // #0B1014
  "--card": "208 25% 10%", // #131A20
  "--muted": "206 23% 14%", // #1B242B
  "--border": "207 21% 19%", // #26313A
  "--foreground": "210 30% 96%", // #F2F5F8
  "--muted-foreground": "209 12% 61%", // #8E9BA7
};
const LIGHT_SURFACES: Record<string, string> = {
  "--background": "210 18% 96%", // #F2F4F6
  "--card": "0 0% 100%", // #FFFFFF
  "--muted": "206 19% 93%", // #E9EDF0
  "--border": "207 17% 87%", // #D9DFE4
  "--foreground": "208 29% 10%", // #121A21
  "--muted-foreground": "209 13% 39%", // #56636F
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
    expect(resolveAccentToken({ ...HALLS_HEAD_LEGACY, accentToken: "purple" })).toBe("purple");
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
    expect(tokens["--primary-foreground"]).toBe("213 26% 8%");
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
  // s_dark = min(17, 20) = 17; s_light = min(17, 18) = 17
  it("Halls Head (dark) derives surfaces from its background hue", () => {
    const tokens = deriveThemeTokens(HALLS_HEAD_LEGACY, "dark");
    expect(tokens["--background"]).toBe("206 29% 6%");
    expect(tokens["--card"]).toBe("206 25% 10%"); // Math.round(17*1.47)=25
    expect(tokens["--muted"]).toBe("206 23% 14%"); // Math.round(17*1.35)=23
    expect(tokens["--border"]).toBe("206 21% 19%"); // Math.round(17*1.24)=21
    // Foreground and accent are unaffected by the surface derivation.
    expect(tokens["--foreground"]).toBe("210 30% 96%");
    expect(tokens["--primary"]).toBe(hexToHslTriplet(HALLS_HEAD_LEGACY.primaryColour)!);
  });

  it("Halls Head (light) derives surfaces from its background hue", () => {
    const tokens = deriveThemeTokens(HALLS_HEAD_LEGACY, "light");
    expect(tokens["--background"]).toBe("206 18% 96%");
    expect(tokens["--card"]).toBe("0 0% 100%");
    expect(tokens["--muted"]).toBe("206 19% 93%"); // Math.round(17*1.1)=19
    expect(tokens["--border"]).toBe("206 17% 87%");
    expect(tokens["--foreground"]).toBe("208 29% 10%");
  });

  // Wild #7A2E4C → hexToHsl: {h:336, s:45, l:33}; s_dark clamped to 20
  it("wild brand (dark) clamps saturation at 20 and uses its hue", () => {
    const wild: ClubBrand = {
      name: "Wild FC",
      backgroundColour: "#7A2E4C",
      primaryColour: "#2E7A5C",
    };
    const tokens = deriveThemeTokens(wild, "dark");
    expect(tokens["--background"]).toBe("336 34% 6%");
    expect(tokens["--card"]).toBe("336 29% 10%"); // Math.round(20*1.47)=29
    expect(tokens["--muted"]).toBe("336 27% 14%"); // Math.round(20*1.35)=27
    expect(tokens["--border"]).toBe("336 25% 19%"); // Math.round(20*1.24)=25
  });

  it("useNavyBase=true overrides a valid dark backgroundColour and restores navy", () => {
    const navyBrand: ClubBrand = { ...HALLS_HEAD_LEGACY, useNavyBase: true };
    const dark = deriveThemeTokens(navyBrand, "dark");
    expect(dark["--background"]).toBe("207 29% 6%");
    expect(dark["--card"]).toBe("208 25% 10%");
    const light = deriveThemeTokens(navyBrand, "light");
    expect(light["--background"]).toBe("210 18% 96%");
    expect(light["--card"]).toBe("0 0% 100%");
  });

  it("backgroundColour with L > 60% falls back to navy", () => {
    const lightBrand: ClubBrand = { name: "Light FC", backgroundColour: "#CCDDEE" }; // L=87%
    const tokens = deriveThemeTokens(lightBrand, "dark");
    expect(tokens["--background"]).toBe("207 29% 6%");
    expect(tokens["--card"]).toBe("208 25% 10%");
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

describe("hslTripletToHex", () => {
  it("round-trips hexToHslTriplet for a representative set of hexes", () => {
    for (const hex of ["#334155", "#0b0f1a", "#ffb238", "#f0654b", "#4c8cf5"]) {
      const triplet = hexToHslTriplet(hex)!;
      const back = hslTripletToHex(triplet)!.toLowerCase();
      // Allow ±1 per channel for the HSL↔RGB rounding, comparing numerically.
      const toRgb = (h: string) => [
        parseInt(h.slice(1, 3), 16),
        parseInt(h.slice(3, 5), 16),
        parseInt(h.slice(5, 7), 16),
      ];
      const [r1, g1, b1] = toRgb(hex);
      const [r2, g2, b2] = toRgb(back);
      expect(Math.abs(r1 - r2), `${hex} r`).toBeLessThanOrEqual(2);
      expect(Math.abs(g1 - g2), `${hex} g`).toBeLessThanOrEqual(2);
      expect(Math.abs(b1 - b2), `${hex} b`).toBeLessThanOrEqual(2);
    }
  });

  it("returns null for a malformed triplet", () => {
    expect(hslTripletToHex(null)).toBeNull();
    expect(hslTripletToHex("nonsense")).toBeNull();
  });
});

describe("theme overrides", () => {
  it("isOverrideColourKey recognises colour tokens and rejects raw/unknown keys", () => {
    expect(isOverrideColourKey("--card")).toBe(true);
    expect(isOverrideColourKey("--destructive")).toBe(true);
    expect(isOverrideColourKey("--radius")).toBe(false);
    expect(isOverrideColourKey("--app-font-sans")).toBe(false);
    expect(isOverrideColourKey("--nope")).toBe(false);
  });

  it("a null/empty override map leaves the derived tokens untouched", () => {
    const base = deriveThemeTokens(DEFAULT_BRAND, "dark");
    const withNull = deriveThemeTokens({ ...DEFAULT_BRAND, themeOverrides: null }, "dark");
    const withEmpty = deriveThemeTokens({ ...DEFAULT_BRAND, themeOverrides: {} }, "dark");
    expect(withNull).toEqual(base);
    expect(withEmpty).toEqual(base);
    // And the key set is unchanged — the css-sync contract depends on this.
    expect(Object.keys(withEmpty).sort()).toEqual(Object.keys(base).sort());
  });

  it("colour overrides are converted hex→triplet and replace the derived value", () => {
    const tokens = deriveThemeTokens(
      { ...DEFAULT_BRAND, themeOverrides: { "--card": "#123456" } },
      "dark",
    );
    expect(tokens["--card"]).toBe(hexToHslTriplet("#123456"));
    // A sibling surface the override didn't touch keeps its derived value.
    expect(tokens["--background"]).toBe(deriveThemeTokens(DEFAULT_BRAND, "dark")["--background"]);
  });

  it("raw overrides (--radius, fonts) are applied verbatim and add keys only when set", () => {
    const base = deriveThemeTokens(DEFAULT_BRAND, "dark");
    expect(base["--radius"]).toBeUndefined();
    const tokens = deriveThemeTokens(
      {
        ...DEFAULT_BRAND,
        themeOverrides: { "--radius": "0.75rem", "--app-font-sans": "Georgia, serif" },
      },
      "dark",
    );
    expect(tokens["--radius"]).toBe("0.75rem");
    expect(tokens["--app-font-sans"]).toBe("Georgia, serif");
  });

  it("an unparseable colour override is skipped (degrades to the derived value)", () => {
    const base = deriveThemeTokens(DEFAULT_BRAND, "dark");
    const tokens = deriveThemeTokens(
      { ...DEFAULT_BRAND, themeOverrides: { "--card": "not-a-colour" } },
      "dark",
    );
    expect(tokens["--card"]).toBe(base["--card"]);
  });

  it("unknown override keys are ignored", () => {
    const out = applyThemeOverrides(
      { "--card": "220 30% 11%" },
      { "--totally-made-up": "#fff" },
      "dark",
    );
    expect(out["--totally-made-up"]).toBeUndefined();
    expect(out["--card"]).toBe("220 30% 11%");
  });

  it("an on-surface text override inverts its lightness between light and dark", () => {
    // A club picks a near-black body text (a colour tuned for light mode).
    const light = deriveThemeTokens(
      { ...DEFAULT_BRAND, themeOverrides: { "--foreground": "#1a1a1a" } },
      "light",
    );
    const dark = deriveThemeTokens(
      { ...DEFAULT_BRAND, themeOverrides: { "--foreground": "#1a1a1a" } },
      "dark",
    );
    // Light mode keeps the dark ink as-picked; dark mode flips its lightness so
    // the same choice stays legible (hue/saturation preserved, L mirrored).
    expect(light["--foreground"]).toBe(hexToHslTriplet("#1a1a1a"));
    const picked = hexToHsl("#1a1a1a")!;
    const [h, s, l] = dark["--foreground"].split(" ");
    expect(h).toBe(String(picked.h));
    expect(s).toBe(`${picked.s}%`);
    expect(l).toBe(`${100 - picked.l}%`);
    expect(picked.l).toBeLessThan(50); // sanity: it really did need flipping
  });

  it("text on fixed accent chips does NOT invert with the mode", () => {
    // --primary-foreground sits on the accent button, which is the same colour in
    // both modes, so a picked value must apply verbatim regardless of mode.
    const overrides = { "--primary-foreground": "#ffffff" };
    const light = deriveThemeTokens({ ...DEFAULT_BRAND, themeOverrides: overrides }, "light");
    const dark = deriveThemeTokens({ ...DEFAULT_BRAND, themeOverrides: overrides }, "dark");
    expect(light["--primary-foreground"]).toBe(hexToHslTriplet("#ffffff"));
    expect(dark["--primary-foreground"]).toBe(hexToHslTriplet("#ffffff"));
  });

  it("every OVERRIDE_COLOUR_KEY is one deriveThemeTokens actually emits", () => {
    const emitted = new Set(Object.keys(deriveThemeTokens(DEFAULT_BRAND, "dark")));
    for (const key of OVERRIDE_COLOUR_KEYS) {
      expect(emitted.has(key), key).toBe(true);
    }
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

describe("--primary-text: contrast-safe accent text (Broadcast R2)", () => {
  const YELLOW: ClubBrand = { name: "Yellow FC", primaryColour: "#FBE34A" };

  it("a light yellow primary in light mode darkens to ≥ 4.5:1 on the card, fill unchanged", () => {
    const tokens = deriveThemeTokens(YELLOW, "light");
    expect(tokens["--primary"]).toBe(hexToHslTriplet("#FBE34A"));
    expect(tokens["--primary-text"]).not.toBe(tokens["--primary"]);
    expect(tripletContrast(tokens["--primary-text"], tokens["--card"])).toBeGreaterThanOrEqual(4.5);
  });

  it("a dark navy primary in dark mode lightens to ≥ 4.5:1 on the dark card", () => {
    const tokens = deriveThemeTokens({ name: "Navy FC", primaryColour: "#1E3A8A" }, "dark");
    expect(tripletContrast(tokens["--primary-text"], tokens["--card"])).toBeGreaterThanOrEqual(4.5);
  });

  it("an accent that already passes is used verbatim", () => {
    const tokens = deriveThemeTokens(HALLS_HEAD_LEGACY, "dark");
    expect(tokens["--primary-text"]).toBe(tokens["--primary"]);
  });

  it("is computed against an overridden --card", () => {
    const brand: ClubBrand = {
      ...HALLS_HEAD_LEGACY,
      themeOverrides: { "--card": "#F4F4F4" },
    };
    const tokens = deriveThemeTokens(brand, "dark");
    expect(tripletContrast(tokens["--primary-text"], tokens["--card"])).toBeGreaterThanOrEqual(4.5);
  });

  it("an explicit --primary-text override wins", () => {
    const brand: ClubBrand = { ...YELLOW, themeOverrides: { "--primary-text": "#123456" } };
    expect(deriveThemeTokens(brand, "light")["--primary-text"]).toBe(hexToHslTriplet("#123456"));
  });

  it("is emitted for every mode and brand", () => {
    for (const mode of ["light", "dark"] as const) {
      expect(deriveThemeTokens(DEFAULT_BRAND, mode)["--primary-text"]).toBeTruthy();
    }
  });
});
