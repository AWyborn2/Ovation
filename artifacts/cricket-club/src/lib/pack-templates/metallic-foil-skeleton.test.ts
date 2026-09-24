import { describe, expect, it } from "vitest";
import { GOLD_FOIL_PACK } from "./gold-foil";
import { describeSkeletonPack, PURPLE } from "./skeleton-contract";
import { renderPackCard } from "../pack-render";
import { sampleCardInput } from "../sample-card-inputs";

/**
 * U13 — Metallic Foil (`gold-foil-v1`) on the shared card skeleton: the common
 * skeleton contract, plus the foil-specific tenant-colour behaviour.
 */

describeSkeletonPack(GOLD_FOIL_PACK, {
  // The handoff's foil gold, the legacy pack golds and Halls Head's gold.
  accentLiterals: /#E8B94A|#D9A441|#FBAC27|#F5B21A/i,
  photoMarker: "sepia(.8)",
  signature: [
    // Gold pinstripe and the double foil frame.
    "repeating-linear-gradient(135deg",
    "inset:2.6cqmin",
    "inset:3.6cqmin",
    // Foil-gradient numerals and the square outline chip.
    "--sk-num-bg:linear-gradient(180deg",
    "--sk-chip-radius:0",
  ],
});

describe("Metallic Foil metal is the tenant's accent (U13)", () => {
  it("mixes every ramp stop from var(--gold), so a purple club gets purple foil", () => {
    const html = renderPackCard(
      sampleCardInput("milestone"),
      "square",
      true,
      PURPLE,
      false,
      null,
      GOLD_FOIL_PACK.packId,
    );
    expect(html).toContain("--gold:#7C3AED");
    const ramp = /--sk-num-bg:(linear-gradient\(180deg,.*?\)) *;--sk-num-color/.exec(html)?.[1];
    expect(ramp).toBeDefined();
    expect(ramp!.match(/color-mix\(in srgb, var\(--gold,#E8B94A\)/g)?.length).toBe(5);
  });
});
