import { describe, expect, it } from "vitest";
import { BOLD_TYPE_PACK } from "./bold-type";
import { describeSkeletonPack, PURPLE } from "./skeleton-contract";
import { renderPackCard } from "../pack-render";
import { sampleCardInput } from "../sample-card-inputs";

/**
 * U13 — Bold Type on the shared card skeleton: the common skeleton contract,
 * plus the poster's own tenant mapping (the stage IS the accent).
 */

describeSkeletonPack(BOLD_TYPE_PACK, {
  accentLiterals: /#FBAC27|#F5B21A/i,
  // The slate wedge's clip, only emitted around a bound photo.
  photoMarker: "clip-path:polygon(18% 0,100% 0,100% 100%,0 100%)",
  signature: [
    // The accent stage, the giant outline word and the inverted chip.
    'background:var(--gold,#FBAC27)"',
    "-webkit-text-stroke:.35cqmin",
    "--sk-chip-bg:var(--accent-ink,#10151B)",
  ],
});

describe("Bold Type poster colours (U13)", () => {
  const render = (tokens = PURPLE) =>
    renderPackCard(
      sampleCardInput("clubLeaderboard"),
      "square",
      true,
      tokens,
      false,
      null,
      BOLD_TYPE_PACK.packId,
    );

  it("sets the stage in the tenant accent and the type in its readable ink", () => {
    const html = render();
    expect(html).toContain("--gold:#7C3AED");
    // White ink on the purple stage — the renderer's accent-ink contract.
    expect(html).toContain("--accent-ink:#FFFFFF");
    expect(html).toContain("color:var(--accent-ink,#10151B);--sk-text:var(--accent-ink,#10151B)");
  });

  it("inverts chips and pills: ink fill, accent type", () => {
    const html = render();
    expect(html).toContain("--sk-chip-ink:var(--gold,#FBAC27)");
    expect(html).toContain("--sk-acc:var(--accent-ink,#10151B)");
    expect(html).toContain("--sk-acc-ink:var(--gold,#FBAC27)");
  });

  it("uses a different giant word per kind", () => {
    const word = (kind: Parameters<typeof sampleCardInput>[0]) =>
      /-webkit-text-stroke:[^"]*">([^<]+)</.exec(
        renderPackCard(sampleCardInput(kind), "square", true, PURPLE, false, null, "bold-type-v1"),
      )?.[1];
    expect(word("teamList")).toBe("XI");
    expect(word("ladder")).toBe("TABLE");
  });
});
