/**
 * Carry-over equivalence (plan 2026-10-07-001 U3, R14 / AE5).
 *
 * The oracle below is a frozen copy of the drafting rules as they were in
 * each engine before the Posting Plan (familyAllows + round-schedule modes).
 * It must not be "updated" to follow new code: it is the definition of
 * today's behaviour.
 */
import { describe, it, expect } from "vitest";
import type { SocialSettingsRow } from "@workspace/db";
import { draftingGates, postingPlanWrite, type DraftingGates } from "./posting-plan";

type Fam = { enabled: boolean; grades: Record<string, boolean> };
type Mode = "off" | "perFixture" | "perRound" | "both";

function oracle(
  families: Record<"results" | "achievements" | "roundup" | "matchday", Fam>,
  modes: Record<"gameDay" | "teamLists" | "weekendWrap", Mode>,
) {
  const allows = (f: Fam, g: string | null, j: boolean) => {
    if (!f.enabled) return false;
    const v = f.grades[g ?? ""];
    return v !== undefined ? v : !j;
  };
  return {
    resultsAny: () => families.results.enabled,
    resultsMatch: (g: string | null, j: boolean) => allows(families.results, g, j),
    resultsPerMatchCentral: () => modes.weekendWrap !== "perRound",
    resultsCarousel: () =>
      families.roundup.enabled &&
      (modes.weekendWrap === "perRound" || modes.weekendWrap === "both"),
    achievementsAny: () => families.achievements.enabled,
    achievement: (g: string | null) => allows(families.achievements, g, false),
    gradeLeadersAny: () => families.roundup.enabled,
    gradeLeaders: (g: string) => allows(families.roundup, g, false),
    gameDayIndividual: () => families.matchday.enabled && modes.gameDay === "perFixture",
    gameDayRound: () => families.matchday.enabled && modes.gameDay === "perRound",
    teamListsIndividual: () => families.matchday.enabled && modes.teamLists === "perFixture",
    teamListsRound: () => families.matchday.enabled && modes.teamLists === "perRound",
    matchdayGrade: (g: string | null, j: boolean) => allows(families.matchday, g, j),
  };
}

const GRADES: [string | null, boolean][] = [
  ["A Grade", false],
  ["B Grade", false],
  ["Under 16s", true],
  [null, false],
];
const GRADE_SETS: Record<string, boolean>[] = [{}, { "B Grade": false }, { "Under 16s": true }];
const MODES: Mode[] = ["off", "perFixture", "perRound", "both"];

function* matrix() {
  for (const r of [false, true])
    for (const u of [false, true])
      for (const a of [false, true])
        for (const m of [false, true])
          for (const grades of GRADE_SETS)
            for (const ww of MODES)
              for (const gd of ["off", "perFixture", "perRound"] as Mode[])
                for (const tl of ["off", "perFixture", "perRound"] as Mode[]) {
                  const families = {
                    results: { enabled: r, grades },
                    achievements: { enabled: a, grades },
                    roundup: { enabled: u, grades },
                    matchday: { enabled: m, grades },
                  };
                  yield { families, modes: { gameDay: gd, teamLists: tl, weekendWrap: ww } };
                }
}

function settingsFor(c: ReturnType<typeof matrix> extends Generator<infer T> ? T : never) {
  return {
    engineMatchSummary: c.families.results.enabled,
    engineMilestone: c.families.achievements.enabled,
    engineRoundUp: c.families.roundup.enabled,
    matchSummaryGradeConfig: {},
    familyConfig: c.families,
    roundSchedules: {
      gameDay: { mode: c.modes.gameDay, day: 4, hour: 18 },
      teamLists: { mode: c.modes.teamLists, day: 5, hour: 12 },
      weekendWrap: { mode: c.modes.weekendWrap, day: 0, hour: 19 },
    },
    postingPlan: null,
  } as unknown as SocialSettingsRow;
}

function compare(
  gates: DraftingGates,
  o: ReturnType<typeof oracle>,
  skip: Set<string> = new Set(),
) {
  const out: Record<string, unknown> = {};
  const want: Record<string, unknown> = {};
  const put = (k: string, a: unknown, b: unknown) => {
    if (skip.has(k)) return;
    out[k] = a;
    want[k] = b;
  };
  put("resultsAny", gates.resultsAny(), o.resultsAny());
  put(
    "resultsPerMatchCentral",
    gates.resultsPerMatchCentral() && gates.resultsAny(),
    o.resultsPerMatchCentral() && o.resultsAny(),
  );
  put("resultsCarousel", gates.resultsCarousel(), o.resultsCarousel());
  put("achievementsAny", gates.achievementsAny(), o.achievementsAny());
  put("gradeLeadersAny", gates.gradeLeadersAny(), o.gradeLeadersAny());
  put("gameDayIndividual", gates.gameDayIndividual(), o.gameDayIndividual());
  put("gameDayRound", gates.gameDayRound(), o.gameDayRound());
  put("teamListsIndividual", gates.teamListsIndividual(), o.teamListsIndividual());
  put("teamListsRound", gates.teamListsRound(), o.teamListsRound());
  for (const [g, j] of GRADES) {
    // Grade rules are only consulted once the row's switch let the engine run.
    if (o.resultsAny()) put(`resultsMatch:${g}`, gates.resultsMatch(g, j), o.resultsMatch(g, j));
    if (o.achievementsAny())
      for (const k of ["milestone", "century", "fiveFor", "debut"] as const)
        if (g !== null) put(`achievement:${k}:${g}`, gates.achievement(k, g), o.achievement(g));
    if (g && o.gradeLeadersAny())
      put(`gradeLeaders:${g}`, gates.gradeLeaders(g), o.gradeLeaders(g));
    if (o.gameDayIndividual() || o.gameDayRound())
      put(`gameDayGrade:${g}`, gates.gameDayGrade(g, j), o.matchdayGrade(g, j));
    if (o.teamListsIndividual() || o.teamListsRound())
      put(`teamListsGrade:${g}`, gates.teamListsGrade(g, j), o.matchdayGrade(g, j));
  }
  expect(out).toEqual(want);
}

describe("unsaved plan: today's rules exactly", () => {
  it("matches the frozen oracle for every settings combination", () => {
    let n = 0;
    for (const c of matrix()) {
      for (const central of [true, false]) {
        compare(draftingGates(settingsFor(c), central), oracle(c.families, c.modes));
        n++;
      }
    }
    expect(n).toBeGreaterThan(1000);
  });

  it("drafts nothing new until a plan is saved", () => {
    const g = draftingGates(null, true);
    expect(g.clubLeaderboards()).toBe(false);
    expect(g.ladders()).toBe(false);
  });
});

describe('saving the derived plan unchanged ("Keep my current settings")', () => {
  it("keeps every gate for central clubs, except carousel-only stumps", () => {
    for (const c of matrix()) {
      const before = settingsFor(c);
      const written = postingPlanWrite(before, undefined, true);
      if ("error" in written) throw new Error(written.error);
      const after = { ...before, ...written.columns } as SocialSettingsRow;
      // Known, accepted difference: with results carousel-only, "Stumps, Day 1"
      // (an individual card) and the junior manual sweep followed the bare
      // results switch before; a saved plan ties them to individual posts.
      // A results switch left on with the carousel's round-up switch off drew
      // no result cards on the central sweep either way.
      const carouselOnly = c.modes.weekendWrap === "perRound";
      const skip = new Set(carouselOnly ? ["resultsAny"] : []);
      if (carouselOnly) for (const [g] of GRADES) skip.add(`resultsMatch:${g}`);
      compare(draftingGates(after, true), oracle(c.families, c.modes), skip);
    }
  });
});
