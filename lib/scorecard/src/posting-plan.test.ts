import { describe, it, expect } from "vitest";
import {
  DEFAULT_STYLE_ID,
  POSTING_ROWS,
  defaultPostingPlan,
  findPostingStyle,
  invalidPostingPlan,
  matchingStyle,
  normalizePostingPlan,
  planFromStyle,
  postingPlanToLegacy,
  postingStyles,
  rowAllows,
  rowHasJuniors,
  rowIndividual,
  rowJuniorPackaging,
  rowRound,
  type PostingPlan,
} from "./posting-plan";

const style = (id: string, central = true) => planFromStyle(findPostingStyle(id, central)!);

describe("defaultPostingPlan (R13)", () => {
  it("is the round-carousels style for a central club", () => {
    const plan = defaultPostingPlan(true);
    expect(plan.version).toBe(2);
    expect(plan.styleId).toBe(DEFAULT_STYLE_ID);
    expect(rowRound(plan.rows.results)).toBe(true);
    expect(rowIndividual(plan.rows.bigMoments)).toBe(true);
    expect(rowAllows(plan.rows.bigMoments, "C Grade", false)).toBe(true);
    expect(rowIndividual(plan.rows.milestones)).toBe(true);
    expect(rowRound(plan.rows.teamLists)).toBe(true);
    expect(rowRound(plan.rows.gameDay)).toBe(true);
    expect(plan.rows.ladders.enabled).toBe(false);
    expect(plan.rows.clubLeaderboards.enabled).toBe(false);
    expect(plan.bigMoments.juniorRunsBar).toBe(100);
  });

  it("limits debuts to A Grade", () => {
    const d = defaultPostingPlan(true).rows.debuts;
    expect(rowAllows(d, "A Grade", false)).toBe(true);
    expect(rowAllows(d, "Female A Grade", false)).toBe(true);
    expect(rowAllows(d, "B Grade", false)).toBe(false);
  });

  it("posts each match on its own for a non-central club and validates", () => {
    const plan = defaultPostingPlan(false);
    expect(rowIndividual(plan.rows.results)).toBe(true);
    expect(rowRound(plan.rows.results)).toBe(false);
    expect(invalidPostingPlan(plan, { central: false })).toBeNull();
  });

  it("lists only rows an engine can draft", () => {
    expect([...POSTING_ROWS]).toEqual([
      "results",
      "bigMoments",
      "milestones",
      "debuts",
      "gameDay",
      "teamLists",
      "clubLeaderboards",
      "ladders",
    ]);
  });
});

describe("rowAllows", () => {
  const base = style("every-match").rows.results;
  it("drafts unlisted seniors but not unlisted juniors on every row", () => {
    const plan = defaultPostingPlan(true);
    for (const id of POSTING_ROWS) {
      expect(rowAllows(plan.rows[id], "Under 14", true)).toBe(false);
    }
    expect(rowAllows(base, "C Grade", false)).toBe(true);
  });
  it("drafts an explicitly listed junior grade", () => {
    const r = { ...base, grades: { "Under 14": true } };
    expect(rowAllows(r, "Under 14", true)).toBe(true);
    expect(rowHasJuniors(r)).toBe(true);
    // Juniors get their own set unless the club chose combined.
    expect(rowJuniorPackaging(r)).toBe("separate");
    expect(rowJuniorPackaging({ ...r, juniors: "combined" })).toBe("combined");
  });
  it("others off with A Grade listed allows only A Grade", () => {
    const r = { ...base, grades: { "A Grade": true }, others: "off" as const };
    expect(rowAllows(r, "A Grade", false)).toBe(true);
    expect(rowAllows(r, "B Grade", false)).toBe(false);
    expect(rowAllows(r, "Under 16s", true)).toBe(false);
  });
});

describe("normalizePostingPlan (ADR-004)", () => {
  const base = defaultPostingPlan(true);
  it("replaces a version 1 plan, a null plan and a malformed plan with the default", () => {
    const v1 = { version: 1, styleId: "every-match", rows: { results: { enabled: false } } };
    expect(normalizePostingPlan(v1, base)).toEqual(base);
    expect(normalizePostingPlan(null, base)).toEqual(base);
    expect(normalizePostingPlan("nonsense", base)).toEqual(base);
    expect(normalizePostingPlan({ version: 2, rows: 7 }, base).rows).toEqual(base.rows);
  });

  it("keeps a version 2 plan's rows, juniors option and runs bar", () => {
    const out = normalizePostingPlan(
      {
        version: 2,
        styleId: null,
        rows: {
          results: {
            enabled: true,
            packaging: "round",
            grades: { "Under 14": true },
            juniors: "separate",
          },
          bigMoments: {
            enabled: true,
            packaging: "individual",
            grades: { "Under 14": true },
            juniors: "separate",
          },
        },
        bigMoments: { juniorRunsBar: 50 },
      },
      base,
    );
    expect(out.rows.results.juniors).toBe("separate");
    expect(out.rows.bigMoments.juniors).toBeUndefined(); // only meaningful on a carousel
    expect(out.bigMoments.juniorRunsBar).toBe(50);
    expect(out.styleId).toBeNull();
    expect(out.rows.milestones).toEqual(base.rows.milestones);
  });

  it("returns a copy, not the base object", () => {
    const out = normalizePostingPlan(null, base);
    out.rows.results.enabled = false;
    expect(base.rows.results.enabled).toBe(true);
  });
});

describe("invalidPostingPlan", () => {
  const base = defaultPostingPlan(true);
  const withRow = (
    id: (typeof POSTING_ROWS)[number],
    patch: Partial<PostingPlan["rows"][typeof id]>,
  ): PostingPlan => ({
    ...base,
    rows: { ...base.rows, [id]: { ...base.rows[id], ...patch } },
  });

  it("rejects juniors on milestones and accepts them on Big Moment", () => {
    expect(
      invalidPostingPlan(withRow("milestones", { grades: { "Under 14": true } }), {
        central: true,
      }),
    ).toMatch(/junior/);
    expect(
      invalidPostingPlan(withRow("bigMoments", { grades: { "Under 14": true } }), {
        central: true,
      }),
    ).toBeNull();
  });

  it("rejects 'both' and other unknown packaging", () => {
    const plan = withRow("results", { packaging: "both" as never });
    expect(invalidPostingPlan(plan, { central: true })).toMatch(/can't be posted/);
  });

  it("rejects a results round carousel for a non-central club", () => {
    expect(invalidPostingPlan(base, { central: false })).toMatch(/association database/);
  });

  it("rejects a junior runs bar other than 50 or 100", () => {
    const bad = { ...base, bigMoments: { juniorRunsBar: 75 as never } };
    expect(invalidPostingPlan(bad, { central: true })).toMatch(/50 or 100/);
    expect(
      invalidPostingPlan({ ...base, bigMoments: { juniorRunsBar: 50 } }, { central: true }),
    ).toBeNull();
    expect(
      invalidPostingPlan({ ...base, bigMoments: { juniorRunsBar: 100 } }, { central: true }),
    ).toBeNull();
  });
});

describe("postingPlanToLegacy", () => {
  it("turns the achievements family on when only Big Moment is on", () => {
    const plan = style("results-only");
    plan.rows.bigMoments.enabled = true;
    const legacy = postingPlanToLegacy(plan);
    expect(legacy.families.achievements.enabled).toBe(true);
    expect(legacy.families.results.enabled).toBe(true);
    expect(legacy.families.roundup.enabled).toBe(false);
    expect(legacy.modes.weekendWrap).toBe("perFixture");
  });

  it("maps the results carousel onto the round-up family and carousel mode", () => {
    const legacy = postingPlanToLegacy(defaultPostingPlan(true));
    expect(legacy.families.roundup.enabled).toBe(true);
    expect(legacy.families.results.enabled).toBe(false);
    expect(legacy.modes.weekendWrap).toBe("perRound");
    expect(legacy.modes.teamLists).toBe("perRound");
    expect(legacy.modes.gameDay).toBe("perRound");
  });
});

describe("styles", () => {
  it("every style validates for the data source it was built for", () => {
    for (const central of [true, false]) {
      for (const s of postingStyles(central)) {
        expect(invalidPostingPlan(planFromStyle(s), { central })).toBeNull();
      }
    }
  });

  it("matchingStyle recognises the default and a hand-built plan as custom", () => {
    expect(matchingStyle(defaultPostingPlan(true), true)?.id).toBe(DEFAULT_STYLE_ID);
    expect(matchingStyle(defaultPostingPlan(false), false)?.id).toBe(DEFAULT_STYLE_ID);
    const custom = defaultPostingPlan(true);
    custom.rows.results.grades = { "Under 14": true };
    expect(matchingStyle(custom, true)).toBeNull();
  });
});
