import { describe, expect, it } from "vitest";
import { SUNSET_PACK } from "./sunset";
import { describeSkeletonPack, PURPLE } from "./skeleton-contract";
import { renderPackCard } from "../pack-render";
import { sampleCardInput } from "../sample-card-inputs";

/**
 * U13 — Sunset on the shared card skeleton: the common skeleton contract, plus
 * the frosted panel, the script word and the sun in the tenant accent.
 */

describeSkeletonPack(SUNSET_PACK, {
  accentLiterals: /#FFB547|#FFD580/i,
  // A full-colour photo layer: the treated wrapper with no filter at all.
  photoMarker:
    'style="position:absolute;pointer-events:none;inset:0"><div style="position:absolute;inset:0"><img',
  signature: [
    // The wash, the frosted body panel and the script word.
    "rgba(255,122,69,.55) 0%,rgba(194,24,91,.5) 50%,rgba(42,16,54,.92) 100%",
    "backdrop-filter:blur(18px)",
    "font-family:'Kaushan Script',cursive",
  ],
});

describe("Sunset details (U13)", () => {
  const render = (kind: Parameters<typeof sampleCardInput>[0]) =>
    renderPackCard(sampleCardInput(kind), "square", true, PURPLE, false, null, SUNSET_PACK.packId);

  it("sets the sun in the tenant accent", () => {
    const html = render("milestone");
    expect(html).toContain("--gold:#7C3AED");
    expect(html).toContain("color-mix(in srgb, var(--gold,#FFB547) 25%, transparent) 45%");
  });

  it("writes a script word per kind above the body", () => {
    expect(render("matchSummary")).toContain(">Full time</div>");
    expect(render("matchDay")).toContain(">Game day</div>");
    expect(render("teamList")).toContain(">Selected</div>");
  });
});
