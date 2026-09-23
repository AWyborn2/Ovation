import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { screen, cleanup } from "@testing-library/react";
import type { HonourDisplayBundle } from "@workspace/api-client-react";
import HonoursDisplay from "@/pages/honours-display";
import { TEMPLATES, isBuiltinSkin, skinClass } from "../types";
import { renderAt } from "@/test/render";
import { installApiMock } from "@/test/mock-api";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CSS = readFileSync(
  join(__dirname, "..", "..", "..", "styles", "honour-boards.css"),
  "utf8",
).replace(/\r\n/g, "\n");

/** Every flat rule whose selector names one of the legacy skins p1–p10. */
function legacySkinRules(css: string): string[] {
  const out: string[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (/\.skin-p(10|[1-9])(?![0-9])/.test(sel)) out.push(`${sel}{${m[2]}}`);
  }
  return out;
}

describe("P11 · Ovation Broadcast honours skin (U19)", () => {
  it("leaves the .skin-p1–.skin-p10 rules byte-identical", () => {
    // Fingerprint of the 27 legacy skin rules as of the Broadcast redesign.
    // A change here means an existing kiosk skin moved — that must be deliberate.
    const rules = legacySkinRules(CSS);
    expect(rules).toHaveLength(27);
    expect(createHash("sha256").update(rules.join("\n")).digest("hex")).toBe(
      "cf34f29587aab5748b77df59081a7a4eb5a644c6207df7323b6385fb9317bc75",
    );
  });

  it("registers p11 with a label distinct from P5 · Broadcast", () => {
    const p11 = TEMPLATES.find((t) => t.id === "p11");
    const p5 = TEMPLATES.find((t) => t.id === "p5");
    expect(p11?.label).toBe("P11 · Ovation Broadcast");
    expect(p11?.label).not.toBe(p5?.label);
    expect(isBuiltinSkin("p11")).toBe(true);
    expect(skinClass("p11")).toBe("skin-p11");
    expect(CSS).toMatch(/\.skin-p11 \{[^}]*--hb-title-font: "Barlow Condensed"/);
  });

  it("an admin-authored skin still carries no built-in class", () => {
    expect(skinClass("custom:1234")).toBe("");
    expect(isBuiltinSkin("custom:1234")).toBe(false);
  });

  it("selecting p11 applies .skin-p11 to the board root", async () => {
    const bundle: HonourDisplayBundle = {
      boards: [],
      brand: {
        name: "Demo Cricket Club",
        shortName: "Demo CC",
        monogram: "DC",
        backgroundColour: "#1d4ed8",
        primaryColour: "#0f172a",
        juniorsColour: "#334155",
      },
      settings: {
        defaultTemplate: "p11",
        kioskSequence: [],
        kioskDwellMs: 3500,
        kioskScrollSpeed: 36,
        kioskEndHoldMs: 3000,
        kioskSponsorStrip: false,
        kioskSponsorSlides: false,
        kioskSponsorSlideEvery: 3,
        kioskAds: [],
        boardConfigs: {},
        composites: [],
      },
      activeSponsors: [],
    };
    installApiMock({ "/api/honour-display": bundle });
    const { container } = renderAt(<HonoursDisplay />, "/honours-display");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Digital Honour Boards" }),
    ).toBeTruthy();
    expect(container.querySelector(".hb.skin-p11")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Launch kiosk/ }).getAttribute("href")).toBe(
      "/honours-display/kiosk",
    );
  });
});
