import { describe, it, expect } from "vitest";
import { ACCENT_HEX } from "@workspace/scorecard";
import {
  buildBrandSavePayload,
  contrastRatio,
  contrastWarningMessage,
  hasLowContrast,
  seedColourState,
  seedPersistedFromTenant,
  suggestionFromPalette,
  LIGHT_SURFACE_HEX,
  DARK_SURFACE_HEX,
  type PersistedBrandFields,
} from "./branding-card";

/** A tenant that has been branded before — every persisted slot filled. */
const PERSISTED: PersistedBrandFields = {
  name: "Pinjarra Cricket Club",
  shortName: "PCC",
  logoUrl: "/api/storage/objects/pinjarra/logo.png",
  faviconUrl: "/api/storage/objects/pinjarra/favicon.png",
  primaryColour: "#333F48",
  secondaryColour: "#FBAC27", // snaps to amber
  tertiaryColour: "#42342B",
};

const FIELD_EDITS = {
  name: " Pinjarra CC ",
  shortName: "PCC",
  logoUrl: "/api/storage/objects/pinjarra/logo.png",
  faviconUrl: "",
};

describe("buildBrandSavePayload", () => {
  it("token mode sends the token's canonical hex in the accent slot with primary/tertiary passthrough (KTD4)", () => {
    const payload = buildBrandSavePayload({
      persisted: PERSISTED,
      ...FIELD_EDITS,
      colourMode: "token",
      colours: {
        accent: "blue",
        // Stale hex edits from a prior visit to the other mode must not leak.
        hexPrimary: "#111111",
        hexSecondary: "#222222",
        hexTertiary: "#333333",
      },
    });
    expect(payload).toEqual({
      name: "Pinjarra CC",
      shortName: "PCC",
      logoUrl: "/api/storage/objects/pinjarra/logo.png",
      faviconUrl: null,
      primaryColour: "#333F48",
      secondaryColour: ACCENT_HEX.blue,
      tertiaryColour: "#42342B",
    });
  });

  it("hex mode sends all three chosen hex values", () => {
    const payload = buildBrandSavePayload({
      persisted: PERSISTED,
      ...FIELD_EDITS,
      colourMode: "hex",
      colours: {
        accent: "blue", // ignored in hex mode
        hexPrimary: "#1A3350",
        hexSecondary: "#C8102E",
        hexTertiary: "#F5F7FA",
      },
    });
    expect(payload.primaryColour).toBe("#1A3350");
    expect(payload.secondaryColour).toBe("#C8102E");
    expect(payload.tertiaryColour).toBe("#F5F7FA");
    expect(payload.name).toBe("Pinjarra CC");
  });
});

describe("mode switching (KTD4 — mode at save time wins)", () => {
  it("re-seeds colour state from persisted values, discarding unsaved edits from the other mode", () => {
    // The concierge fiddles with exact hexes, then flips back to token mode:
    // the component calls seedColourState(persisted), so the edits vanish.
    const reseeded = seedColourState(PERSISTED);
    expect(reseeded).toEqual({
      accent: "amber", // #FBAC27 snaps to amber
      hexPrimary: "#333F48",
      hexSecondary: "#FBAC27",
      hexTertiary: "#42342B",
    });

    // Saving in token mode after the re-seed carries no trace of the
    // abandoned hex edits — the payload is derived purely from persisted
    // values plus the chosen token.
    const payload = buildBrandSavePayload({
      persisted: PERSISTED,
      ...FIELD_EDITS,
      colourMode: "token",
      colours: reseeded,
    });
    expect(payload.primaryColour).toBe(PERSISTED.primaryColour);
    expect(payload.secondaryColour).toBe(ACCENT_HEX.amber);
    expect(payload.tertiaryColour).toBe(PERSISTED.tertiaryColour);
  });

  it("seeds neutral defaults when the tenant has never been branded (detail response carries no brand fields)", () => {
    const persisted = seedPersistedFromTenant({ name: "Fresh Club" });
    expect(persisted).toEqual({
      name: "Fresh Club",
      shortName: null,
      logoUrl: null,
      faviconUrl: null,
      primaryColour: null,
      secondaryColour: null,
      tertiaryColour: null,
    });
    const colours = seedColourState(persisted);
    expect(colours.accent).toBe("amber"); // platform default
    // Colour inputs still get valid hex values so <input type="color"> works.
    expect(colours.hexPrimary).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(colours.hexSecondary).toBe(ACCENT_HEX.amber);
    expect(colours.hexTertiary).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe("contrast warning (R7, AE3)", () => {
  it("flags near-white against the light surface (ratio below 4.5)", () => {
    const ratio = contrastRatio("#feffff", LIGHT_SURFACE_HEX);
    expect(ratio).not.toBeNull();
    expect(ratio!).toBeLessThan(4.5);
    expect(hasLowContrast("#feffff", LIGHT_SURFACE_HEX)).toBe(true);
    expect(contrastWarningMessage(["#feffff"], "light")).toBe(
      "Low contrast against light surfaces.",
    );
  });

  it("does not flag a strong colour against the light surface", () => {
    expect(hasLowContrast("#1a3350", LIGHT_SURFACE_HEX)).toBe(false);
    expect(contrastWarningMessage(["#1a3350"], "light")).toBeNull();
  });

  it("flags a dark colour against the dark surface", () => {
    expect(hasLowContrast("#1a3350", DARK_SURFACE_HEX)).toBe(true);
    expect(contrastWarningMessage(["#1a3350"], "dark")).toBe(
      "Low contrast against dark surfaces.",
    );
  });

  it("returns null when every colour passes on the previewed surface", () => {
    // The design system's amber accent reads well on the dark navy surface
    // (near-white passes there too — accents are fills with dark text).
    expect(
      contrastWarningMessage([ACCENT_HEX.amber, null, undefined], "dark"),
    ).toBeNull();
  });

  it("is advisory only — a low-contrast choice still produces a full save payload", () => {
    // The warning is a string (or null), never a blocking flag, and the
    // payload builder is contrast-oblivious: saving stays possible (AE3).
    const warning = contrastWarningMessage(["#feffff"], "light");
    expect(typeof warning).toBe("string");
    const payload = buildBrandSavePayload({
      persisted: PERSISTED,
      ...FIELD_EDITS,
      colourMode: "hex",
      colours: {
        accent: "amber",
        hexPrimary: "#feffff",
        hexSecondary: "#feffff",
        hexTertiary: "#feffff",
      },
    });
    expect(payload.primaryColour).toBe("#feffff");
    expect(payload.secondaryColour).toBe("#feffff");
    expect(payload.tertiaryColour).toBe("#feffff");
  });

  it("ignores unparseable values rather than warning on them", () => {
    expect(contrastRatio("not-a-colour", LIGHT_SURFACE_HEX)).toBeNull();
    expect(contrastWarningMessage(["not-a-colour"], "light")).toBeNull();
  });
});

describe("suggestionFromPalette (R5)", () => {
  it("snaps the extracted colour to the nearest accent token", () => {
    const suggestion = suggestionFromPalette({
      primaryColour: "#123B8A",
      secondaryColour: null,
      tertiaryColour: null,
    });
    expect(suggestion.accent).toBe("blue");
    expect(suggestion.note).toContain("blue");
  });

  it("prefers the secondary (accent-slot) colour when both are present", () => {
    const suggestion = suggestionFromPalette({
      primaryColour: "#123B8A",
      secondaryColour: "#FBAC27",
      tertiaryColour: null,
    });
    expect(suggestion.accent).toBe("amber");
  });

  it("degrades an all-null extraction to a couldn't-detect note with pickers untouched", () => {
    const suggestion = suggestionFromPalette({
      primaryColour: null,
      secondaryColour: null,
      tertiaryColour: null,
    });
    expect(suggestion.accent).toBeNull();
    expect(suggestion.note).toContain("Couldn't detect");
    // The pickers stay usable: colour state seeding is independent of the
    // failed extraction, so the concierge can still pick manually.
    const colours = seedColourState(seedPersistedFromTenant({ name: "Club" }));
    expect(colours.accent).toBe("amber");
  });
});
