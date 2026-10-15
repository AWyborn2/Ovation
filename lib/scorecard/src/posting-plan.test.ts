import { describe, it, expect } from "vitest";
import {
  derivePostingPlan,
  findPostingStyle,
  invalidPostingPlan,
  matchingStyle,
  normalizePostingPlan,
  planFromStyle,
  postingPlanToLegacy,
  rowAllows,
  rowIndividual,
  rowRound,
  type LegacyPostingInput,
  type PostingPlan,
} from "./posting-plan";

const fam = (enabled: boolean, grades: Record<string, boolean> = {}) => ({ enabled, grades });

function legacy(over: Partial<LegacyPostingInput> = {}): LegacyPostingInput {
  return {
    families: {
      results: fam(true),
      achievements: fam(false),
      roundup: fam(false),
      matchday: fam(false),
    },
    modes: { gameDay: "perFixture", teamLists: "perFixture", weekendWrap: "off" },
    central: true,
    ...over,
  };
}

const style = (id: string) => planFromStyle(findPostingStyle(id)!);

describe("derivePostingPlan", () => {
  it("reproduces a club on default settings", () => {
    const plan = derivePostingPlan(legacy());
    expect(rowIndividual(plan.rows.results)).toBe(true);
    expect(rowRound(plan.rows.results)).toBe(false);
    expect(plan.rows.milestones.enabled).toBe(false);
    expect(plan.rows.gameDay.enabled).toBe(false);
    expect(plan.rows.clubLeaderboards.enabled).toBe(false);
    expect(plan.rows.ladders.enabled).toBe(false);
    expect(plan.styleId).toBeNull();
  });

  it("maps the weekend-wrap mode onto results packaging when round-up is on", () => {
    const on = (weekendWrap: LegacyPostingInput["modes"]["weekendWrap"]) =>
      derivePostingPlan(
        legacy({
          families: { ...legacy().families, roundup: fam(true) },
          modes: { gameDay: "perFixture", teamLists: "perFixture", weekendWrap },
        }),
      ).rows.results;
    expect(on("perRound")).toMatchObject({ enabled: true, packaging: "round" });
    expect(on("both")).toMatchObject({ enabled: true, packaging: "both" });
    expect(on("perFixture")).toMatchObject({ enabled: true, packaging: "individual" });
  });

  it("derives no results at all with round-up off and carousel-only mode, as today", () => {
    const r = derivePostingPlan(
      legacy({ modes: { gameDay: "perFixture", teamLists: "perFixture", weekendWrap: "perRound" } }),
    ).rows.results;
    expect(rowIndividual(r)).toBe(false);
    expect(rowRound(r)).toBe(false);
  });

  it("drafts no results carousel for a non-central club", () => {
    const r = derivePostingPlan(
      legacy({
        central: false,
        families: { ...legacy().families, roundup: fam(true) },
        modes: { gameDay: "perFixture", teamLists: "perFixture", weekendWrap: "perRound" },
      }),
    ).rows.results;
    expect(rowRound(r)).toBe(false);
    // The native import path never read the mode, so per-match cards continue.
    expect(rowIndividual(r)).toBe(true);
  });

  it("keeps a results grade override for per-match posts", () => {
    const r = derivePostingPlan(
      legacy({ families: { ...legacy().families, results: fam(true, { "B Grade": false }) } }),
    ).rows.results;
    expect(rowAllows(r, "B Grade", false)).toBe(false);
    expect(rowAllows(r, "A Grade", false)).toBe(true);
  });

  it("game day and team lists follow the match-day family and their own mode", () => {
    const p = derivePostingPlan(
      legacy({
        families: { ...legacy().families, matchday: fam(true) },
        modes: { gameDay: "perRound", teamLists: "off", weekendWrap: "off" },
      }),
    );
    expect(p.rows.gameDay).toMatchObject({ enabled: true, packaging: "round" });
    expect(p.rows.teamLists.enabled).toBe(false);
  });
});

describe("rowAllows", () => {
  const base = style("every-match").rows.results;
  it("drafts unlisted seniors but not unlisted juniors", () => {
    expect(rowAllows(base, "C Grade", false)).toBe(true);
    expect(rowAllows(base, "Under 16s", true)).toBe(false);
  });
  it("drafts an explicitly listed junior grade", () => {
    expect(rowAllows({ ...base, grades: { "Under 16s": true } }, "Under 16s", true)).toBe(true);
  });
  it("others off with A Grade listed allows only A Grade", () => {
    const r = { ...base, grades: { "A Grade": true }, others: "off" as const };
    expect(rowAllows(r, "A Grade", false)).toBe(true);
    expect(rowAllows(r, "B Grade", false)).toBe(false);
    expect(rowAllows(r, "Under 16s", true)).toBe(false);
  });
});

describe("styles", () => {
  it("round carousels + highlights is Ash's setup", () => {
    const p = style("round-carousels");
    expect(p.rows.results.packaging).toBe("round");
    expect(p.rows.teamLists.packaging).toBe("round");
    expect(rowRound(p.rows.ladders)).toBe(true);
    expect(rowRound(p.rows.clubLeaderboards)).toBe(true);
    expect(p.rows.milestones.packaging).toBe("individual");
    expect(rowAllows(p.rows.debuts, "A Grade", false)).toBe(true);
    expect(rowAllows(p.rows.debuts, "B Grade", false)).toBe(false);
  });

  it("a plan built from a style matches it until a row changes", () => {
    const p = style("round-carousels");
    expect(matchingStyle(p)?.id).toBe("round-carousels");
    const edited: PostingPlan = {
      ...p,
      rows: { ...p.rows, milestones: { ...p.rows.milestones, enabled: false } },
    };
    expect(matchingStyle(edited)).toBeNull();
  });
});

describe("invalidPostingPlan", () => {
  const p = style("every-match");
  it("rejects a round carousel for milestones", () => {
    const bad = { ...p, rows: { ...p.rows, milestones: { ...p.rows.milestones, packaging: "round" as const } } };
    expect(invalidPostingPlan(bad, { central: true })).toMatch(/Milestones/);
  });
  it("rejects both for team lists", () => {
    const bad = { ...p, rows: { ...p.rows, teamLists: { ...p.rows.teamLists, packaging: "both" as const } } };
    expect(invalidPostingPlan(bad, { central: true })).toMatch(/Team lists/);
  });
  it("only allows results, ladder and leaderboard carousels for central clubs", () => {
    expect(invalidPostingPlan(style("round-carousels"), { central: false })).toMatch(/association/);
    const teamListsRound = { ...p, rows: { ...p.rows, teamLists: { ...p.rows.teamLists, packaging: "round" as const } } };
    expect(invalidPostingPlan(teamListsRound, { central: false })).toBeNull();
  });
});

describe("postingPlanToLegacy", () => {
  it("collapses shared families widest-wins", () => {
    const p = style("every-match");
    p.rows.feats = { ...p.rows.feats, enabled: false };
    p.rows.gameDay = { ...p.rows.gameDay, grades: { "C Grade": false } };
    p.rows.teamLists = { ...p.rows.teamLists, grades: { "C Grade": true } };
    const out = postingPlanToLegacy(p);
    expect(out.families.achievements.enabled).toBe(true);
    expect(out.families.matchday.grades["C Grade"]).toBe(true);
  });

  it("keeps round-up on when the results carousel is on", () => {
    const out = postingPlanToLegacy(style("round-carousels"));
    expect(out.families.roundup.enabled).toBe(true);
    expect(out.modes.weekendWrap).toBe("perRound");
    expect(out.modes.teamLists).toBe("perRound");
    expect(out.modes.gameDay).toBe("perFixture");
  });

  it("round-trips through derive for legacy-expressible plans", () => {
    const input = legacy({
      families: {
        results: fam(true, { "B Grade": false }),
        achievements: fam(true),
        roundup: fam(true),
        matchday: fam(true, { "Under 16s": true }),
      },
      modes: { gameDay: "perRound", teamLists: "perFixture", weekendWrap: "both" },
    });
    const plan = derivePostingPlan(input);
    const back = postingPlanToLegacy(plan);
    expect(derivePostingPlan({ ...back, central: true }).rows).toEqual(plan.rows);
  });
});

describe("normalizePostingPlan", () => {
  it("fills missing rows from the base and keeps submitted packaging for validation", () => {
    const base = style("every-match");
    const out = normalizePostingPlan({ rows: { milestones: { packaging: "round" } } }, base);
    expect(out.rows.results).toEqual(base.rows.results);
    expect(out.rows.milestones.packaging).toBe("round");
    expect(out.rows.milestones.enabled).toBe(true);
  });
});
