import { describe, expect, it } from "vitest";
import { NEON_NIGHT_PACK } from "./neon-night";
import { describeSkeletonPack, PURPLE } from "./skeleton-contract";
import { renderPackCard } from "../pack-render";
import { sampleCardInput } from "../sample-card-inputs";

/**
 * U13 — Neon Night on the shared card skeleton: the common skeleton contract,
 * plus the glows reading the tenant accent.
 */

describeSkeletonPack(NEON_NIGHT_PACK, {
  // The handoff cyan and the legacy pack's floodlight cyan.
  accentLiterals: /#22D3EE|#37CFE6|rgba\(55,\s*207,\s*230/i,
  photoMarker: "grayscale(1) contrast(1.3);mix-blend-mode:screen",
  signature: [
    // 5% grid, glowing horizon, pill chip and glowing numerals.
    "0 0/5cqmin 5cqmin",
    "box-shadow:0 0 2cqmin var(--gold,#22D3EE)",
    "--sk-chip-radius:99cqmin",
    "--sk-num-glow:0 0 1.2cqmin",
  ],
});

describe("Neon Night lights are the tenant's accent (U13)", () => {
  it("draws the glows, grid and horizon from var(--gold)", () => {
    const html = renderPackCard(
      sampleCardInput("ladder"),
      "square",
      true,
      PURPLE,
      false,
      null,
      NEON_NIGHT_PACK.packId,
    );
    expect(html).toContain("--gold:#7C3AED");
    expect(html).toContain(
      "radial-gradient(circle at 85% 15%,color-mix(in srgb, var(--gold,#22D3EE) 35%",
    );
    expect(html).toContain(
      "linear-gradient(color-mix(in srgb, var(--gold,#22D3EE) 9%, transparent) 1px",
    );
    // The pink second light is the pack's own, fixed.
    expect(html).toContain("rgba(236,72,153,.28)");
  });
});
