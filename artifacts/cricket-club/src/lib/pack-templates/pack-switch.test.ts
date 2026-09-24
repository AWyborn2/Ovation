import { describe, expect, it } from "vitest";
import { listPackManifests } from "./registry";
import { renderPackCard } from "../pack-render";
import { brandDefaultTokens, resolvePackTokens } from "../pack-render/tokens";
import { buildPackData } from "../pack-card-data";
import { sampleCardInput } from "../sample-card-inputs";
import type { CardSize, ShareCardInput } from "../share-card";

/**
 * U13 — switching a draft's pack. A draft is one card input plus the tenant's
 * brand; choosing another pack must re-render that SAME input in the new pack's
 * look, with the brand colours still applied. Every pack is on the shared
 * skeleton now, so this pins that each pack id selects its own treatment and
 * that none of them drops the tenant accent.
 */

const PACK_MARKERS: Record<string, string> = {
  "broadcast-dark-v1": "transform:skewX(-22deg)",
  "gold-foil-v1": "inset:2.6cqmin",
  "bold-type-v1": "-webkit-text-stroke:.35cqmin",
  "neon-night-v1": "0 0/5cqmin 5cqmin",
  "sunset-v1": "font-family:'Kaushan Script',cursive",
};

const BRAND = {
  name: "Demo Cricket Club",
  tagline: "CRICKET CLUB · EST. 1991",
  primaryColour: "#7C3AED",
};

function renderDraft(input: ShareCardInput, packId: string, size: CardSize = "square") {
  const tokens = resolvePackTokens({ brand: brandDefaultTokens(BRAND) });
  const data = buildPackData({ brand: BRAND, hashtag: "#DEMOCC" });
  return renderPackCard(input, size, true, tokens, false, data, packId);
}

describe("switching a draft's pack (U13)", () => {
  it("covers every registered pack", () => {
    expect(Object.keys(PACK_MARKERS).sort()).toEqual(
      listPackManifests()
        .map((p) => p.packId)
        .sort(),
    );
  });

  for (const kind of ["matchSummary", "milestone", "ladder"] as const) {
    it(`re-renders the same ${kind} input in each pack with the brand accent`, () => {
      const input = sampleCardInput(kind);
      const outputs = new Map<string, string>();
      for (const packId of Object.keys(PACK_MARKERS)) {
        for (const size of ["square", "landscape"] as CardSize[]) {
          const html = renderDraft(input, packId, size);
          const ctx = `${packId}/${kind}/${size}`;
          // The pack's own treatment…
          expect(html, ctx).toContain(PACK_MARKERS[packId]);
          // …and no other pack's.
          for (const [other, marker] of Object.entries(PACK_MARKERS)) {
            if (other !== packId) expect(html, `${ctx} carries ${other}`).not.toContain(marker);
          }
          // Brand colour applied, tenant identity bound.
          expect(html, ctx).toContain("--gold:#7C3AED");
          expect(html, ctx).toMatch(/Demo Cricket Club/i);
          expect(html, ctx).toContain("#DEMOCC");
          expect(html, ctx).not.toContain("pack-landscape-fallback");
          if (size === "square") outputs.set(packId, html);
        }
      }
      // Five genuinely different cards from one input.
      expect(new Set(outputs.values()).size).toBe(outputs.size);
    });
  }
});
