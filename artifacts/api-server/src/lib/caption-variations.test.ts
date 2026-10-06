/**
 * Game day, team list and weekend wrap drafts, per match and per whole round,
 * caption themselves from a pool of variations, one per draft. Mocked unit
 * test (no database).
 */
import { describe, it, expect, vi } from "vitest";
import { renderCaption } from "@workspace/scorecard";

vi.mock("@workspace/db", () => ({ db: {} }));
vi.mock("./photo-store", () => ({ objectUrl: (p: string) => `/api/storage${p}` }));

import { pickCaptionVariation } from "./draft-enrich";
import { CAPTION_VARIATIONS } from "./social-cards-helpers";

const ctx = { clubUrl: "club.example", hashtag: "#GoClub", appLink: "club.example/fixtures" };

// Shaped like the engines' card inputs (fixtureToMatchDayInput, teamListToCardInput, round-sets).
const inputs: Record<string, { kind: string } & Record<string, unknown>> = {
  matchday: {
    kind: "matchDay",
    roundLabel: "ROUND 5",
    oppositionName: "Rivals CC",
    homeAway: "HOME",
    venue: "Home Oval",
    date: "SAT 14 FEB",
    startTime: "12:30pm",
    grade: "A Grade",
  },
  teamlist: {
    kind: "teamList",
    gradeRound: "A GRADE — ROUND 5",
    competitionLine: "A Grade",
    venueDateTime: "Home Oval • SAT 14 FEB • 12:30pm",
    players: new Array(11).fill({}),
    grade: "A Grade",
  },
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

/** What every variation of an engine must show, so no draft loses its key detail. */
const mustShow: Record<string, string> = {
  matchday: "Rivals CC",
  teamlist: "A GRADE",
  "gameday-round": "ROUND 5",
  "teamlists-round": "ROUND 5",
  "weekendwrap-round": "ROUND 5",
};

describe("CAPTION_VARIATIONS", () => {
  it("covers each game day, team list and wrap engine with several variations", () => {
    expect(Object.keys(CAPTION_VARIATIONS).sort()).toEqual(Object.keys(inputs).sort());
    for (const variations of Object.values(CAPTION_VARIATIONS)) {
      expect(variations.length).toBeGreaterThanOrEqual(3);
      expect(new Set(variations).size).toBe(variations.length);
    }
  });

  it.each(Object.keys(inputs))("%s: every variation fills its tokens", (engine) => {
    for (const template of CAPTION_VARIATIONS[engine]!) {
      const caption = renderCaption(template, inputs[engine]!, ctx);
      expect(caption).not.toMatch(/\{[\w.]+\}/);
      expect(caption).toContain(mustShow[engine]);
      expect(caption).toContain("#GoClub");
      expect(caption.length).toBeLessThanOrEqual(2200);
    }
  });

  it("never quotes the weekend wrap's win count (a winless round)", () => {
    for (const template of CAPTION_VARIATIONS["weekendwrap-round"]!) {
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
