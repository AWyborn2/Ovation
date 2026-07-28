import { describe, expect, it } from "vitest";
import {
  renderPackCard,
  packSupportsKind,
  resolvePackTokens,
  tokensFromCardTheme,
  brandDefaultTokens,
  normaliseBrandHex,
  packImageSlots,
  PACK_DEFAULT_TOKENS,
  JUNIOR_PANEL,
  type PackTokens,
  type PackCardData,
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
    expect(off).toContain("#YOURCLUB");

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
    for (const team of ["Your Club", "Dawesville"]) expect(html7).toContain(team);
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

  it("binds the premiership teamPhotoUrl into the teamPhoto slot (both formats)", () => {
    const base = sampleCardInput("premiership");
    const url = "/api/storage/objects/premiers-2024.jpg";
    const input = { ...base, teamPhotoUrl: url } as ShareCardInput;
    for (const size of ["square", "story"] as CardSize[]) {
      const html = renderPackCard(input, size, true, TOKENS, false);
      expect(html, size).toContain(`<img src="${url}"`);
      expect(hasUnresolved(html)).toBe(false);
    }
  });

  it("renders a placeholder (never an empty img src) for a premiership with no teamPhotoUrl", () => {
    const html = renderPackCard(sampleCardInput("premiership"), "story", true, TOKENS, false);
    expect(html).not.toContain('src=""');
    expect(html).toContain("pack-slot-placeholder");
  });

  it("binds the teamList squadPhotoUrl into the squadPhoto slot (both formats)", () => {
    const base = sampleCardInput("teamList");
    const url = "/api/storage/objects/squad-a-grade.jpg";
    const input = { ...base, squadPhotoUrl: url } as ShareCardInput;
    for (const size of ["square", "story"] as CardSize[]) {
      const html = renderPackCard(input, size, true, TOKENS, false);
      expect(html, size).toContain(`<img src="${url}"`);
      expect(hasUnresolved(html)).toBe(false);
    }
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

// ---------------------------------------------------------------------------
// Tenant data threading (PackCardData) — the pack path's brand / sponsors /
// hashtag / photo overlay, plus the S1/S2 no-leak regression guards.
// ---------------------------------------------------------------------------

describe("renderPackCard with tenant data (PackCardData)", () => {
  const DATA: PackCardData = {
    brand: { name: "Test Cricket Club", logoUrl: "https://cdn.example.com/logo.png" },
    hashtag: "#TESTCC",
    sponsors: [
      { name: "Sponsor A", logoUrl: "https://cdn.example.com/spon-a.png" },
      { name: "Sponsor B", logoUrl: "https://cdn.example.com/spon-b.png" },
      { name: "Sponsor C", logoUrl: "https://cdn.example.com/spon-c.png" },
    ],
    photoUrl: null,
    photoTransform: null,
  };

  it("(a) binds tenant logo / name / sponsors over the sample defaults", () => {
    const input = sampleCardInput("matchSummary");
    const html = renderPackCard(input, "story", true, TOKENS, false, DATA);
    // clubLogo slot resolves to the tenant logo image.
    expect(html).toContain('src="https://cdn.example.com/logo.png"');
    // clubName header uses the tenant name (not the "HALLS HEAD" sample).
    expect(html).toContain("Test Cricket Club");
    // First three sponsor logos fill sponsor1..3.
    expect(html).toContain('src="https://cdn.example.com/spon-a.png"');
    expect(html).toContain('src="https://cdn.example.com/spon-b.png"');
    expect(html).toContain('src="https://cdn.example.com/spon-c.png"');
  });

  it("(a) uses the tenant hashtag in the sponsors-off footer", () => {
    const input = sampleCardInput("matchSummary");
    const off = renderPackCard(input, "story", false, TOKENS, false, DATA);
    expect(off).toContain("#TESTCC");
  });

  it("(b) falls back to placeholders for absent brand / sponsors / photo (no crash)", () => {
    const input = sampleCardInput("matchSummary");
    const empty: PackCardData = {};
    for (const size of ["square", "portrait", "story"] as CardSize[]) {
      const html = renderPackCard(input, size, true, TOKENS, false, empty);
      expect(html.length).toBeGreaterThan(0);
      expect(hasUnresolved(html)).toBe(false);
      // Never an empty <img src> — unresolved logo/sponsor slots stay placeholders.
      expect(html).not.toContain('src=""');
      expect(html).toContain("pack-slot-placeholder");
    }
  });

  it("(c) never leaks the sample #HALLSHEAD or EST 1991 on a data-bearing render", () => {
    const input = sampleCardInput("matchSummary");
    // A branded tenant with NO configured hashtag (empty string) and no tagline
    // source — the sample must not survive through either the header tagline or
    // the hashtag footer (S1 + S2 regression guard).
    const noHashtag: PackCardData = {
      brand: { name: "Other Club", logoUrl: null },
      hashtag: "",
    };
    for (const sponsorsOn of [true, false]) {
      for (const size of ["square", "portrait", "story"] as CardSize[]) {
        const html = renderPackCard(input, size, sponsorsOn, TOKENS, false, noHashtag);
        expect(html, `${size} sponsors=${sponsorsOn}`).not.toContain("#HALLSHEAD");
        expect(html, `${size} sponsors=${sponsorsOn}`).not.toContain("EST 1991");
      }
    }
  });

  it("(A9) renders the tenant tagline when set, over the EST 1991 sample", () => {
    const input = sampleCardInput("matchSummary");
    const withTagline: PackCardData = {
      brand: { name: "Other Club", logoUrl: null, tagline: "PROUDLY LOCAL · EST 2010" },
      hashtag: "",
    };
    for (const size of ["square", "portrait", "story"] as CardSize[]) {
      const html = renderPackCard(input, size, false, TOKENS, false, withTagline);
      expect(html, `${size}`).toContain("PROUDLY LOCAL · EST 2010");
      expect(html, `${size}`).not.toContain("EST 1991");
    }
  });

  it("(A9) leaves the tagline empty (no EST 1991) when the tenant has none", () => {
    const input = sampleCardInput("matchSummary");
    const noTagline: PackCardData = {
      brand: { name: "Other Club", logoUrl: null },
      hashtag: "",
    };
    const html = renderPackCard(input, "story", false, TOKENS, false, noTagline);
    expect(html).not.toContain("EST 1991");
    expect(html).not.toContain("CRICKET CLUB · EST");
  });

  it("(A9/S3) never leaks the sample competition hashtag (#PEELPREMIERLEAGUE) on a data-bearing render", () => {
    // weekendWrap/ladder headers carry the {{hashtagsExtra}} competition line,
    // whose sample is the hard-coded Peel literal — it must be cleared.
    const noExtra: PackCardData = {
      brand: { name: "Other Club", logoUrl: null },
      hashtag: "",
    };
    for (const kind of ["weekendWrap", "ladder"] as ShareCardInput["kind"][]) {
      const input = sampleCardInput(kind);
      for (const size of ["square", "portrait", "story"] as CardSize[]) {
        const html = renderPackCard(input, size, true, TOKENS, false, noExtra);
        expect(html, `${kind} ${size}`).not.toContain("PEELPREMIERLEAGUE");
        expect(html, `${kind} ${size}`).not.toContain("LIVE UPDATES");
      }
    }
  });

  it("falls back to NEUTRAL samples on a no-data render (brand-less tenant)", () => {
    // Without a `data` argument the template samples apply. Those samples are
    // deliberately club-agnostic (U3) so a brand-less render can never present
    // one tenant's identity to another.
    const input = sampleCardInput("matchSummary");
    const html = renderPackCard(input, "story", false, TOKENS, false);
    expect(html).toContain("#YOURCLUB");
    expect(html).not.toContain("#HALLSHEAD");
  });

  // A7 — dynamic "presented by" primary sponsor -----------------------------
  it("(A7) stamps the presenting sponsor NAME into the presented-by line", () => {
    const input = sampleCardInput("century");
    const data: PackCardData = { presentingSponsorName: "Acme Motors" };
    for (const size of ["story", "square"] as CardSize[]) {
      const html = renderPackCard(input, size, true, TOKENS, false, data);
      expect(html, `${size}`).toContain("presented by");
      expect(html, `${size}`).toContain("Acme Motors");
      // The sample literal must never survive a data-bearing render.
      expect(html, `${size}`).not.toContain("eSA Sport");
    }
  });

  it("(A7) hides the presented-by line entirely when no presenting sponsor is set", () => {
    // A data-bearing render with no presenting sponsor → the whole line drops, so
    // neither the sample literals nor an orphan "presented by" prose leaks.
    const data: PackCardData = { presentingSponsorName: null };
    for (const kind of ["century", "matchSummary", "premiership", "newSigning"] as ShareCardInput["kind"][]) {
      const input = sampleCardInput(kind);
      for (const size of ["story", "square"] as CardSize[]) {
        const html = renderPackCard(input, size, true, TOKENS, false, data);
        const ctx = `${kind}/${size}`;
        expect(html, ctx).not.toContain("eSA Sport");
        expect(html, ctx).not.toContain("PlayHQ");
        expect(html, ctx).not.toContain("presented by");
        expect(html, ctx).not.toContain("proudly supported by");
        expect(html, ctx).not.toContain("recruitment by");
        // No orphan empty sponsor span left behind.
        expect(html, ctx).not.toContain('color:#fff;font-weight:700"></span>');
        expect(hasUnresolved(html), ctx).toBe(false);
      }
    }
  });

  it("(A7) drops only the presented-by line on bespoke flex rows, keeping the clubHashtag sibling", () => {
    // new-cap / debut put the clubHashtag and the presented-by line in the SAME
    // flex row. Dropping the empty presented-by line must leave the hashtag
    // sibling (and its surrounding flex row) intact.
    const data: PackCardData = { hashtag: "#TESTCC", presentingSponsorName: null };
    for (const kind of ["newCap", "debut"] as ShareCardInput["kind"][]) {
      const input = sampleCardInput(kind);
      for (const size of ["story", "square"] as CardSize[]) {
        const html = renderPackCard(input, size, true, TOKENS, false, data);
        const ctx = `${kind}/${size}`;
        // Hashtag sibling survives the drop.
        expect(html, ctx).toContain("#TESTCC");
        // Presented-by line and its sample literal are gone.
        expect(html, ctx).not.toContain("presented by");
        expect(html, ctx).not.toContain("eSA Sport");
        expect(html, ctx).not.toContain('color:#fff;font-weight:700"></span>');
        expect(hasUnresolved(html), ctx).toBe(false);
      }
    }
  });

  it("(A7) keeps a NEUTRAL sample presented-by sponsor on a no-data render", () => {
    // The line must still render (so the layout is representative), but with a
    // placeholder rather than Halls Head's actual sponsor.
    const html = renderPackCard(sampleCardInput("century"), "story", true, TOKENS, false);
    expect(html).toContain("presented by");
    expect(html).toContain("Your Sponsor");
    expect(html).not.toContain("eSA Sport");
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

// ---------------------------------------------------------------------------
// Brand → default token bridge (A8): a tenant's brand colours become the pack's
// lowest-priority default palette, below theme / override / junior force.
// ---------------------------------------------------------------------------

describe("brandDefaultTokens (brand → pack default palette)", () => {
  // Halls Head's seeded brand — must reproduce the hard-coded default palette so
  // HH pack cards stay pixel-identical to the pre-bridge output.
  const HH_BRAND: PackCardData["brand"] = {
    name: "Halls Head Cricket Club",
    logoUrl: null,
    primaryColour: "#FBAC27",
    backgroundColour: "#333F48",
    juniorsColour: "#42342B",
  };

  it("falls back to the full default palette when no brand / no colours are set", () => {
    expect(brandDefaultTokens(null)).toEqual(PACK_DEFAULT_TOKENS);
    expect(brandDefaultTokens(undefined)).toEqual(PACK_DEFAULT_TOKENS);
    expect(brandDefaultTokens({ name: "Logo Only", logoUrl: "x" })).toEqual(PACK_DEFAULT_TOKENS);
    // Empty strings are treated as "absent" and keep the fallback.
    expect(brandDefaultTokens({ primaryColour: "", juniorsColour: "" })).toEqual(PACK_DEFAULT_TOKENS);
  });

  it("(a) seeds a non-HH brand's colours into the default tokens", () => {
    const other: PackCardData["brand"] = {
      name: "Other CC",
      primaryColour: "#22AA22", // → accent
      juniorsColour: "#0055FF", // → panel
      backgroundColour: "#123456", // deliberately NOT mapped onto ink
    };
    const tokens = brandDefaultTokens(other);
    expect(tokens.accent).toBe("#22AA22");
    expect(tokens.panel).toBe("#0055FF");
    // ink + textLight have no brand source → keep the hard-coded fallback.
    expect(tokens.ink).toBe(PACK_DEFAULT_TOKENS.ink);
    expect(tokens.textLight).toBe(PACK_DEFAULT_TOKENS.textLight);

    // …and those colours reach the rendered root style as --gold / --panel.
    const input = sampleCardInput("matchSummary");
    const html = renderPackCard(input, "story", true, resolvePackTokens({ brand: tokens }), false);
    expect(html).toMatch(/--gold:\s*#22AA22/i);
    expect(html).toMatch(/--panel:\s*#0055FF/i);
  });

  it("(b) leaves Halls Head visually identical (HH brand maps to the defaults)", () => {
    // The bridge maps HH's brand onto exactly the hard-coded default palette.
    expect(brandDefaultTokens(HH_BRAND)).toEqual(PACK_DEFAULT_TOKENS);

    // End-to-end: rendering HH through the brand bridge is byte-identical to
    // rendering with the raw default palette (across sizes / sponsor states).
    const input = sampleCardInput("matchSummary");
    for (const size of ["square", "portrait", "story"] as CardSize[]) {
      for (const sponsorsOn of [true, false]) {
        const viaBrand = renderPackCard(
          input,
          size,
          sponsorsOn,
          resolvePackTokens({ brand: brandDefaultTokens(HH_BRAND) }),
          false,
        );
        const baseline = renderPackCard(input, size, sponsorsOn, PACK_DEFAULT_TOKENS, false);
        expect(viaBrand, `${size} sponsors=${sponsorsOn}`).toBe(baseline);
      }
    }
  });

  it("(c) a theme and per-card override still beat the brand default", () => {
    const other: PackCardData["brand"] = {
      primaryColour: "#22AA22",
      juniorsColour: "#0055FF",
    };
    const brand = brandDefaultTokens(other);

    // Theme beats the brand default.
    const theme = tokensFromCardTheme({ accent: "#EE0000", bgPanel: "#EEEEEE" });
    const themed = resolvePackTokens({ brand, theme });
    expect(themed.accent).toBe("#EE0000"); // theme > brand
    expect(themed.panel).toBe("#EEEEEE"); // theme > brand

    // Per-card override beats both theme and brand default.
    const override: Partial<PackTokens> = { accent: "#FFFFFF" };
    const overridden = resolvePackTokens({ brand, theme, override });
    expect(overridden.accent).toBe("#FFFFFF"); // override > theme > brand
    expect(overridden.panel).toBe("#EEEEEE"); // theme still applies

    // Junior force still wins the panel over the brand default.
    const junior = resolvePackTokens({ brand, junior: true });
    expect(junior.panel).toBe(JUNIOR_PANEL);
    expect(junior.accent).toBe("#22AA22"); // brand default still seeds the accent
  });
});

// ---------------------------------------------------------------------------
// Brand colour hardening (A8 review S1 + S2): brand colours are admin-controlled
// and flow unescaped into the inline style mounted via dangerouslySetInnerHTML,
// so they are sanitised (hex-only) + normalised to 6-digit hex at the boundary.
// ---------------------------------------------------------------------------

describe("normaliseBrandHex (brand colour sanitisation + normalisation)", () => {
  it("passes a clean 6-digit hex through (uppercased), preserving HH parity", () => {
    expect(normaliseBrandHex("#FBAC27")).toBe("#FBAC27");
    expect(normaliseBrandHex("#42342B")).toBe("#42342B");
    expect(normaliseBrandHex("#fbac27")).toBe("#FBAC27"); // case-normalised
    expect(normaliseBrandHex("FBAC27")).toBe("#FBAC27"); // leading # optional
  });

  it("expands #RGB and strips the alpha from #RRGGBBAA to a 6-digit hex", () => {
    expect(normaliseBrandHex("#f00")).toBe("#FF0000");
    expect(normaliseBrandHex("#0055FFAA")).toBe("#0055FF");
    expect(normaliseBrandHex("  #0f8  ")).toBe("#00FF88"); // trimmed
  });

  it("rejects anything that is not a strict hex literal (→ null)", () => {
    expect(normaliseBrandHex(null)).toBeNull();
    expect(normaliseBrandHex(undefined)).toBeNull();
    expect(normaliseBrandHex("")).toBeNull();
    expect(normaliseBrandHex("red")).toBeNull(); // named colour
    expect(normaliseBrandHex("rgb(255,0,0)")).toBeNull(); // rgb()
    expect(normaliseBrandHex("hsl(0,100%,50%)")).toBeNull(); // hsl()
    expect(normaliseBrandHex("#12345")).toBeNull(); // wrong length
    expect(normaliseBrandHex('#fff"><img src=x onerror=alert(1)>')).toBeNull(); // injection
  });
});

describe("brandDefaultTokens hardening (S1 injection / S2 --panel-2 derivation)", () => {
  const input = sampleCardInput("matchSummary");

  it("(a) rejects a malicious / non-colour brand colour → keeps the default token, no injection", () => {
    const evil: PackCardData["brand"] = {
      primaryColour: '#fff"><img src=x onerror=alert(1)>',
      juniorsColour: "javascript:alert(1)",
    };
    const tokens = brandDefaultTokens(evil);
    // Both invalid → fall back to the hard-coded defaults (never the raw string).
    expect(tokens.accent).toBe(PACK_DEFAULT_TOKENS.accent);
    expect(tokens.panel).toBe(PACK_DEFAULT_TOKENS.panel);

    const html = renderPackCard(input, "story", true, resolvePackTokens({ brand: tokens }), false);
    // The attacker markup must not appear anywhere in the rendered style/root.
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("javascript:");
    // --gold / --panel carry the safe defaults.
    expect(html).toMatch(/--gold:\s*#FBAC27/i);
    expect(html).toMatch(/--panel:\s*#42342B/i);
  });

  it("(b) normalises short/alpha brand hex so --panel-2 derives (not the HH brown)", () => {
    // HH brown panel → panel-2 is #261e19; a non-HH club must NOT inherit it.
    const HH_PANEL2 = "#261e19";

    // #f00 → #FF0000 → darken(0.42) → #940000
    const shortHex = brandDefaultTokens({ juniorsColour: "#f00" });
    expect(shortHex.panel).toBe("#FF0000");
    const htmlShort = renderPackCard(input, "story", true, resolvePackTokens({ brand: shortHex }), false);
    expect(htmlShort).toMatch(/--panel:\s*#FF0000/i);
    expect(htmlShort).toContain("--panel-2:#940000");
    expect(htmlShort).not.toContain(HH_PANEL2);

    // #0055FFAA → #0055FF → darken(0.42) → #003194
    const alphaHex = brandDefaultTokens({ juniorsColour: "#0055FFAA" });
    expect(alphaHex.panel).toBe("#0055FF");
    const htmlAlpha = renderPackCard(input, "story", true, resolvePackTokens({ brand: alphaHex }), false);
    expect(htmlAlpha).toContain("--panel-2:#003194");
    expect(htmlAlpha).not.toContain(HH_PANEL2);
  });

  it("(c) HH's clean 6-digit hex still derives its own brown --panel-2 (parity)", () => {
    const hh = brandDefaultTokens({ primaryColour: "#FBAC27", juniorsColour: "#42342B" });
    expect(hh).toEqual(PACK_DEFAULT_TOKENS);
    const html = renderPackCard(input, "story", true, resolvePackTokens({ brand: hh }), false);
    expect(html).toContain("--panel:#42342B");
    expect(html).toContain("--panel-2:#261e19");
  });
});

// ---------------------------------------------------------------------------
// Generic per-slot image overrides (B1): an admin-supplied image for ANY slot a
// template exposes wins over the bound input image and the brand/sponsor/photo
// overlays — resolution order override > input > bind.
// ---------------------------------------------------------------------------

describe("renderPackCard per-slot image overrides (B1)", () => {
  const BOUND = "https://cdn.example.com/bound.jpg";
  const OVERRIDE = "https://cdn.example.com/override.jpg";

  it("an override URL wins over the bound input image (override > bind)", () => {
    // A player card binds its own photoUrl into the `photo` slot; the override
    // for that slot must replace it.
    const input = { ...sampleCardInput("player"), photoUrl: BOUND } as ShareCardInput;
    const html = renderPackCard(input, "story", true, TOKENS, false, {
      imagesOverride: { photo: OVERRIDE },
    });
    expect(html).toContain(`<img src="${OVERRIDE}"`);
    expect(html).not.toContain(`<img src="${BOUND}"`);
  });

  it("an override URL wins over the tenant photo + brand-logo overlays (override > input)", () => {
    const input = sampleCardInput("player");
    const html = renderPackCard(input, "story", true, TOKENS, false, {
      brand: { name: "X", logoUrl: "https://cdn.example.com/brandlogo.png" },
      photoUrl: "https://cdn.example.com/uploaded.jpg", // A4 overlay into `photo`
      imagesOverride: { photo: OVERRIDE, clubLogo: OVERRIDE },
    });
    // The override beats both the A4 uploaded photo and the brand clubLogo.
    expect(html).toContain(`<img src="${OVERRIDE}"`);
    expect(html).not.toContain("uploaded.jpg");
    expect(html).not.toContain("brandlogo.png");
  });

  it("ignores an empty override value (slot falls back, never blanked)", () => {
    const input = { ...sampleCardInput("player"), photoUrl: BOUND } as ShareCardInput;
    const html = renderPackCard(input, "story", true, TOKENS, false, {
      imagesOverride: { photo: "" },
    });
    expect(html).toContain(`<img src="${BOUND}"`);
    expect(html).not.toContain('src=""');
  });

  it("leaves renders byte-identical when no override (or an empty map) is supplied", () => {
    const input = { ...sampleCardInput("player"), photoUrl: BOUND } as ShareCardInput;
    for (const size of ["square", "portrait", "story"] as CardSize[]) {
      const base = renderPackCard(input, size, true, TOKENS, false, { photoTransform: null });
      const withEmpty = renderPackCard(input, size, true, TOKENS, false, {
        photoTransform: null,
        imagesOverride: {},
      });
      expect(withEmpty, size).toBe(base);
    }
  });

  it("mechanism stays general: overrides a UI-hidden branding slot (clubLogo) when set programmatically", () => {
    // The panel hides clubLogo (see PACK_OVERRIDE_HIDDEN_SLOTS), but the
    // imagesOverride MECHANISM must still repoint it if a caller sets the key —
    // only the UI list is filtered, not the renderer.
    const input = sampleCardInput("player");
    const CLUBLOGO = "https://cdn.example.com/clublogo-override.png";
    const html = renderPackCard(input, "story", true, TOKENS, false, {
      brand: { name: "X", logoUrl: "https://cdn.example.com/brandlogo.png" },
      imagesOverride: { clubLogo: CLUBLOGO },
    });
    expect(html).toContain(`<img src="${CLUBLOGO}"`);
    expect(html).not.toContain("brandlogo.png");
  });

  it("renders deterministically across call sites for identical PackCardData (preview/server parity)", () => {
    // The live <PackCard> preview and the server still harness both call
    // renderPackCard with the same PackCardData, so the same input must yield
    // byte-identical html at every call site (determinism, not a round-trip).
    const input = sampleCardInput("matchSummary");
    const data: PackCardData = {
      imagesOverride: { "opposition.logo": OVERRIDE, "potm.photo": OVERRIDE },
    };
    for (const size of ["square", "portrait", "story"] as CardSize[]) {
      const a = renderPackCard(input, size, true, TOKENS, false, data);
      const b = renderPackCard(input, size, true, TOKENS, false, data);
      expect(a, size).toBe(b);
      expect(a, size).toContain(`<img src="${OVERRIDE}"`);
    }
  });
});

describe("packImageSlots (per-slot override editor enumeration)", () => {
  it("surfaces a player card's content slot (photo) and hides the club logo", () => {
    const slots = packImageSlots(sampleCardInput("player"));
    const keys = slots.map((s) => s.key);
    expect(keys).toContain("photo");
    // clubLogo is tenant branding → filtered out of the panel list.
    expect(keys).not.toContain("clubLogo");
    // Every entry carries a human label and a photo|logo type (no text/repeat).
    for (const s of slots) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(["photo", "logo"]).toContain(s.type);
    }
  });

  it("hides the tenant-branding slots (clubLogo + sponsors) from the match-result panel", () => {
    const keys = packImageSlots(sampleCardInput("matchSummary")).map((s) => s.key);
    // Content slots are surfaced…
    for (const k of ["club.logo", "opposition.logo", "potm.photo"]) {
      expect(keys, k).toContain(k);
    }
    // …the branding slots (header logo + sponsor tiles) are hidden.
    for (const k of ["clubLogo", "sponsor1", "sponsor2", "sponsor3"]) {
      expect(keys, k).not.toContain(k);
    }
  });

  it("gives every surfaced slot a unique, disambiguated label", () => {
    const labels = packImageSlots(sampleCardInput("matchSummary")).map((s) => s.label);
    // No raw duplicate "Logo" rows reach the panel — labels are unique.
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("Opposition logo");
    expect(labels).toContain("Club logo");
  });

  it("includeHidden keeps the raw enumerator (branding slots + sponsors) intact", () => {
    const keys = packImageSlots(sampleCardInput("matchSummary"), {
      includeHidden: true,
    }).map((s) => s.key);
    for (const k of [
      "clubLogo",
      "club.logo",
      "opposition.logo",
      "potm.photo",
      "sponsor1",
      "sponsor2",
      "sponsor3",
    ]) {
      expect(keys, k).toContain(k);
    }
  });
});

describe("renderPackCard full-bleed photo placement (B3)", () => {
  const PHOTO = "https://cdn.example.com/action.jpg";
  const withPhoto = (
    placement?: PackCardData["photoPlacement"],
    photoUrl: string | null = PHOTO,
  ): PackCardData => ({
    brand: { name: "Test Cricket Club", logoUrl: null },
    hashtag: "#TESTCC",
    photoUrl,
    photoPlacement: placement,
  });

  // The Player Spotlight story format frames the hero photo in a right-hand
  // column: `<div style="…width:600px;bottom:0">` directly wraps the slot.
  const CONTAINED_WRAPPER = 'width:600px;bottom:0"><img';
  const FULLBLEED_WRAPPER = 'style="position:absolute;inset:0"><img';

  it("promotes the hero photo wrapper to full-bleed geometry when chosen", () => {
    const input = sampleCardInput("player");
    const html = renderPackCard(input, "story", true, TOKENS, false, withPhoto("fullBleed"));
    // The wrapper directly around the photo <img> is now inset:0 (full card)…
    expect(html).toContain(`style="position:absolute;inset:0"><img src="${PHOTO}"`);
    // …and no longer the framed right-hand column.
    expect(html).not.toContain(CONTAINED_WRAPPER);
    // object-fit stays cover — only the geometry switched.
    expect(html).toContain("object-fit:cover");
  });

  it("keeps the framed (contained) placement by default and when 'contained'", () => {
    const input = sampleCardInput("player");
    const omitted = renderPackCard(input, "story", true, TOKENS, false, withPhoto(undefined));
    const contained = renderPackCard(input, "story", true, TOKENS, false, withPhoto("contained"));
    // Contained keeps the framed wrapper and never the full-bleed geometry.
    expect(omitted).toContain(CONTAINED_WRAPPER);
    expect(omitted).not.toContain(FULLBLEED_WRAPPER);
    // Omitted placement === explicit "contained" (byte-identical, default path).
    expect(omitted).toBe(contained);
  });

  it("leaves the contained render byte-identical to the pre-B3 output", () => {
    // A data-bearing render with a photo but no placement must match exactly
    // what an explicit "contained" render produces — the default path is inert.
    const input = sampleCardInput("player");
    for (const size of ["square", "portrait", "story"] as CardSize[]) {
      const base = renderPackCard(input, size, true, TOKENS, false, withPhoto(undefined));
      const contained = renderPackCard(input, size, true, TOKENS, false, withPhoto("contained"));
      expect(base, size).toBe(contained);
    }
  });

  it("does nothing when full-bleed is chosen but no photo is bound", () => {
    // No photo → the wrapper would otherwise stretch a placeholder chip across
    // the whole card, so the geometry switch is gated on a resolved photo.
    const input = sampleCardInput("player");
    const noPhoto = renderPackCard(input, "story", true, TOKENS, false, withPhoto("fullBleed", null));
    const contained = renderPackCard(input, "story", true, TOKENS, false, withPhoto("contained", null));
    expect(noPhoto).not.toContain(FULLBLEED_WRAPPER);
    expect(noPhoto).toBe(contained);
  });

  it("does not full-bleed the match-result POTM headshot", () => {
    // matchSummary has no hero `photo` slot — only the contained `potm.photo`
    // headshot — so full-bleed must not touch it.
    const input = sampleCardInput("matchSummary");
    const html = renderPackCard(input, "story", true, TOKENS, false, withPhoto("fullBleed"));
    // The POTM wrapper (rounded box) stays; no wrapper is rewritten to inset:0.
    expect(html).not.toContain(FULLBLEED_WRAPPER);
    expect(html).toContain(`src="${PHOTO}"`);
  });

  it("injects a full-card legibility scrim on full-bleed, none on contained", () => {
    const input = sampleCardInput("player");
    const fb = renderPackCard(input, "story", true, TOKENS, false, withPhoto("fullBleed"));
    const contained = renderPackCard(input, "story", true, TOKENS, false, withPhoto("contained"));
    // The full-bleed render carries the injected full-card scrim behind the text…
    expect(fb).toContain('data-fullbleed-scrim="1"');
    // …and it is a whole-canvas (inset:0) overlay, not a column-scoped one.
    expect(fb).toContain(
      '<div data-fullbleed-scrim="1" style="position:absolute;inset:0;pointer-events:none;',
    );
    // Contained mode never gets the scrim (byte-identical to pre-B3).
    expect(contained).not.toContain("data-fullbleed-scrim");
  });

  it("adds no scrim when full-bleed is chosen but no photo is bound", () => {
    // The scrim rides with the promoted photo; without a photo neither appears.
    const input = sampleCardInput("player");
    const noPhoto = renderPackCard(input, "story", true, TOKENS, false, withPhoto("fullBleed", null));
    expect(noPhoto).not.toContain("data-fullbleed-scrim");
  });

  it("honours the focal-point object-position on a full-bleed photo", () => {
    const input = sampleCardInput("player");
    const data: PackCardData = {
      ...withPhoto("fullBleed"),
      photoTransform: { focalX: 0.7, focalY: 0.2, zoom: 1 },
    };
    const html = renderPackCard(input, "story", true, TOKENS, false, data);
    expect(html).toContain("object-position:70% 20%");
    expect(html).toContain(`style="position:absolute;inset:0"><img src="${PHOTO}"`);
  });

  it("server still-export parity: same PackCardData yields identical html", () => {
    // The live <PackCard> preview and the server still harness both call
    // renderPackCard with the same PackCardData, so a full-bleed render must be
    // deterministic across call sites for every size.
    const input = sampleCardInput("player");
    const data = withPhoto("fullBleed");
    for (const size of ["square", "portrait", "story"] as CardSize[]) {
      const a = renderPackCard(input, size, true, TOKENS, false, data);
      const b = renderPackCard(input, size, true, TOKENS, false, data);
      expect(a, size).toBe(b);
      // Every size promotes the hero wrapper to the full-bleed geometry.
      expect(a, size).toContain(FULLBLEED_WRAPPER);
    }
  });
});
