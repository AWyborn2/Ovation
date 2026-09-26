/**
 * Milestone moments: a club debut that was also the A Grade debut is one
 * combined moment carrying the cap; a later A Grade debut is its own dated
 * moment; an A Grade debut from before the scorecards keeps the undated cap.
 */
import { describe, it, expect } from "vitest";
import { milestoneEvents, versus } from "./milestones";
import { match, season } from "@/lib/stats-analytics/test-fixtures";
import type { MilestoneTiers } from "@/lib/stats-analytics";

const tiers = { games: [], runs: [], wickets: [] } as unknown as MilestoneTiers;
const events = (p: Partial<Parameters<typeof milestoneEvents>[0]>) =>
  milestoneEvents({
    matches: [],
    seasons: [],
    tiers,
    capNumber: null,
    premierships: [],
    awards: [],
    ...p,
  });

describe("A Grade debut and the cap", () => {
  it("club and A Grade debut in the same game: one combined moment with the cap", () => {
    const out = events({
      matches: [
        match({ grade: "A Grade", season: 2015, round: 1, opponent: "Waroona" }),
        match({ grade: "A Grade", season: 2015, round: 2 }),
      ],
      capNumber: 195,
    });
    const debuts = out.filter((e) => e.kind === "debut" || e.kind === "aGradeDebut");
    expect(debuts).toHaveLength(1);
    expect(debuts[0]).toMatchObject({
      kind: "debut",
      title: "Debut · Cap 195",
      sub: "Club & A Grade debut · 2015/16 · v Waroona",
      season: 2015,
      major: true,
      aGrade: true,
    });
    expect(out.some((e) => e.kind === "cap")).toBe(false);
  });

  it("a later A Grade debut is its own moment, dated where the cap was earned", () => {
    const out = events({
      matches: [
        match({ grade: "C Grade", season: 2013, round: 1, opponent: "Pinjarra" }),
        match({ grade: "A Grade", season: 2015, round: 4, opponent: "Waroona" }),
      ],
      capNumber: 195,
    });
    const debut = out.find((e) => e.kind === "debut")!;
    expect(debut).toMatchObject({ title: "Debut", season: 2013 });
    expect(debut.aGrade).toBeUndefined();
    expect(out.find((e) => e.kind === "aGradeDebut")).toMatchObject({
      title: "A Grade debut · Cap 195",
      sub: "2015/16 · v Waroona",
      season: 2015,
      major: true,
    });
    expect(out.some((e) => e.kind === "cap")).toBe(false);
    // In order: the club debut sits before the A Grade debut.
    const order = out.map((e) => e.kind);
    expect(order.indexOf("debut")).toBeLessThan(order.indexOf("aGradeDebut"));
  });

  it("A Grade games before the scorecards keep the undated cap", () => {
    const out = events({
      matches: [match({ grade: "A Grade", season: 2010 })],
      seasons: [season({ season: null, grade: "A Grade", games: 40 })],
      capNumber: 53,
    });
    expect(out.find((e) => e.kind === "cap")).toMatchObject({ title: "Cap 53", season: null });
    expect(out.some((e) => e.kind === "aGradeDebut")).toBe(false);
  });

  it("without a cap number the A Grade debut still shows, uncapped", () => {
    const out = events({
      matches: [
        match({ grade: "B Grade", season: 2019, round: 1 }),
        match({ grade: "A Grade", season: 2021, round: 3, opponent: "Rivals" }),
      ],
    });
    expect(out.find((e) => e.kind === "aGradeDebut")).toMatchObject({ title: "A Grade debut" });
  });
});

describe("versus", () => {
  it("prefixes a real opponent and shows a competition label on its own", () => {
    expect(versus("Waroona Cricket Club")).toBe("v Waroona Cricket Club");
    expect(versus("A Grade: Wyllie Cup")).toBe("Wyllie Cup");
    expect(versus("  ")).toBeNull();
    expect(versus(null)).toBeNull();
  });
});
