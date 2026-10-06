/**
 * Whole-round drafts (game day, team lists, weekend wrap) caption themselves
 * from a pool of variations, one per round. Mocked unit test (no database).
 */
import { describe, it, expect, vi } from "vitest";
import { renderCaption } from "@workspace/scorecard";

vi.mock("@workspace/db", () => ({ db: {} }));
vi.mock("./photo-store", () => ({ objectUrl: (p: string) => `/api/storage${p}` }));

import { pickCaptionVariation } from "./draft-enrich";
import { ROUND_SET_CAPTIONS } from "./social-cards-helpers";

const ctx = { clubUrl: "club.example", hashtag: "#GoClub", appLink: "club.example/fixtures" };

const inputs: Record<string, { kind: string } & Record<string, unknown>> = {
  "gameday-round": {
    kind: "roundFixtures",
    roundLabel: "ROUND 5",
    date: "SATURDAY 14 FEB",
    fixtures: [{}, {}, {}, {}],
  },
  "teamlists-round": {
    kind: "teamListRound",
    roundLabel: "ROUND 5",
    date: "SATURDAY 14 FEB",
    teams: [{}, {}, {}],
  },
  "weekendwrap-round": {
    kind: "weekendWrap",
    roundLabel: "ROUND 5",
    dateRange: "14–15 FEB",
    matches: [{ outcome: "lost" }, { outcome: "draw" }],
  },
};

describe("ROUND_SET_CAPTIONS", () => {
  it("covers each whole-round engine with several variations", () => {
    expect(Object.keys(ROUND_SET_CAPTIONS).sort()).toEqual(Object.keys(inputs).sort());
    for (const variations of Object.values(ROUND_SET_CAPTIONS)) {
      expect(variations.length).toBeGreaterThanOrEqual(3);
      expect(new Set(variations).size).toBe(variations.length);
    }
  });

  it.each(Object.keys(inputs))("%s: every variation fills its tokens", (engine) => {
    for (const template of ROUND_SET_CAPTIONS[engine]!) {
      const caption = renderCaption(template, inputs[engine]!, ctx);
      expect(caption).not.toMatch(/\{[\w.]+\}/);
      expect(caption).toContain("ROUND 5");
      expect(caption).toContain("#GoClub");
      expect(caption.length).toBeLessThanOrEqual(2200);
    }
  });

  it("never quotes the weekend wrap's win count (a winless round)", () => {
    for (const template of ROUND_SET_CAPTIONS["weekendwrap-round"]!) {
      expect(template).not.toContain("{stat.value}");
    }
  });
});

describe("pickCaptionVariation", () => {
  const pool = ["a", "b", "c", "d", "e"];

  it("keeps a round's caption across refreshes", () => {
    for (const seed of ["gameday-round:2026-02-14:ROUND 5:senior", "weekendwrap-round:2025:5"]) {
      expect(pickCaptionVariation(pool, seed)).toBe(pickCaptionVariation(pool, seed));
    }
  });

  it("varies the caption from round to round", () => {
    const picked = new Set(
      Array.from({ length: 20 }, (_, i) =>
        pickCaptionVariation(pool, `teamlists-round:2026-02-14:ROUND ${i + 1}:senior`),
      ),
    );
    expect(picked.size).toBeGreaterThan(2);
  });

  it("takes the first variation with no seed", () => {
    expect(pickCaptionVariation(pool, null)).toBe("a");
  });
});
