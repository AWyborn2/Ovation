import { describe, expect, it } from "vitest";
import { applyPackData, bindInput } from "./bind";
import { BLANK_PACK_ID, renderPackCard } from "./render";
import { brandDefaultTokens, resolvePackTokens } from "@/lib/pack-render";
import type { ShareCardInput } from "../share-card";

/**
 * S5: a player's card without a headline of its own never prints the pack's
 * sample tribute ("…thanks for every one, Milesy."). A sweep's career
 * milestone carries no headline, and Ash saw Milesy's line on Zachary
 * Dreckow's 100-games card.
 */
const tokens = resolvePackTokens({ brand: brandDefaultTokens(null), theme: null, junior: false });

const milestone = {
  kind: "milestone",
  tierLabel: "CENTURION",
  currentValue: 100,
  milestoneLabel: "GAMES",
  playerName: "Zachary Dreckow",
} as unknown as ShareCardInput;

const headlineDoc = {
  formatVersion: 2,
  pages: {
    card: {
      layers: [
        {
          id: "headline",
          kind: "text",
          content: "{{headline}}",
          geometry: { portrait: { x: 6, y: 80, w: 88, h: 6 } },
        },
      ],
    },
  },
};

describe("sample headlines on real cards", () => {
  it("binds an empty headline on player-centred kinds when the input has none", () => {
    for (const kind of ["milestone", "player", "newSigning"]) {
      const bound = bindInput({ ...milestone, kind } as ShareCardInput, null);
      applyPackData(bound, {}, kind);
      expect(bound.values["headline"]).toBe("");
    }
  });

  it("keeps a headline the card has", () => {
    const bound = bindInput({ ...milestone, headline: "100 games, Zac!" } as ShareCardInput, null);
    applyPackData(bound, {}, "milestone");
    expect(bound.values["headline"]).toBe("100 games, Zac!");
  });

  it("never prints Milesy on a real milestone card, pack or library template", () => {
    const data = { brand: { name: "Halls Head Cricket Club" } } as never;
    const pack = renderPackCard(
      milestone,
      "portrait",
      true,
      tokens,
      false,
      data,
      "broadcast-dark-v1",
    );
    expect(pack).not.toContain("Milesy");
    const layered = renderPackCard(
      milestone,
      "portrait",
      true,
      tokens,
      false,
      data,
      BLANK_PACK_ID,
      headlineDoc as never,
    );
    expect(layered).not.toContain("Milesy");
  });

  it("still shows the sample on a design preview (no club data)", () => {
    const html = renderPackCard(
      milestone,
      "portrait",
      true,
      tokens,
      false,
      null,
      "broadcast-dark-v1",
    );
    expect(html).toContain("Milesy");
  });
});
