import { describe, expect, it } from "vitest";

import { duePlans, matchDurationMs, type CadenceMatch, type LastRun } from "./cadence";

const ORG = "4559f1b9-86d8-eb11-a7ad-2818780da0cc";
const OPP = "3d38cd53-8ad8-eb11-a7ad-2818780da0cc";
const OTHER = "11111111-2222-3333-4444-555555555555";

/** A Perth wall-clock time ("2026-10-10 11:00") as a Date. Perth is UTC+8 all year. */
const perth = (s: string) => new Date(`${s.replace(" ", "T")}:00+08:00`);

// Round 1: Saturday 10 Oct 2026, 11:45 one-dayer.
const round1: CadenceMatch = {
  homeOrgId: OPP,
  awayOrgId: ORG,
  startAt: perth("2026-10-10 11:45"),
  status: "UPCOMING",
  matchType: "One Day",
};

const names = (now: Date, matches: CadenceMatch[] = [round1], runs: LastRun[] = []) =>
  duePlans(now, [ORG], matches, runs).map((p) => p.planName);

const ran = (planName: string, at: string): LastRun => ({
  orgId: ORG,
  planName,
  loadedAt: perth(at),
});

describe("duePlans — weekly", () => {
  it("is due from Monday 06:00 until a weekly run loads", () => {
    expect(names(perth("2026-10-05 05:59"), [], [ran("weekly", "2026-09-28 06:03")])).toEqual([]);
    expect(names(perth("2026-10-05 06:05"), [], [ran("weekly", "2026-09-28 06:03")])).toEqual([
      "weekly",
    ]);
    expect(names(perth("2026-10-05 06:05"), [], [ran("weekly", "2026-10-05 06:01")])).toEqual([]);
  });

  it("stays due after a missed 06:00 run (self-healing)", () => {
    expect(names(perth("2026-10-05 09:00"), [], [ran("weekly", "2026-09-28 06:03")])).toEqual([
      "weekly",
    ]);
  });

  it("is the only plan due out of season (no fixtures)", () => {
    expect(names(perth("2026-05-12 10:00"), [])).toEqual(["weekly"]);
  });

  it("serves last Monday's slot on any later weekday", () => {
    const [plan] = duePlans(perth("2026-10-08 13:00"), [ORG], [], []);
    expect(plan.slot).toBe(perth("2026-10-05 06:00").toISOString());
    expect(plan.plan).toEqual({
      orgId: ORG,
      seasons: "current",
      kinds: ["matches", "ladder", "gradeTeams", "rounds"],
      balls: "none",
      scorecards: "none",
    });
  });
});

describe("duePlans — before the weekend", () => {
  const weeklyDone = [ran("weekly", "2026-10-05 06:01")];

  it("is due Thursday 18:00 when the org plays within four days", () => {
    expect(names(perth("2026-10-08 17:59"), [round1], weeklyDone)).toEqual([]);
    expect(names(perth("2026-10-08 18:10"), [round1], weeklyDone)).toEqual(["preweekend"]);
  });

  it("is due again Friday 18:00 after Thursday's run", () => {
    const runs = [...weeklyDone, ran("preweekend", "2026-10-08 18:12")];
    expect(names(perth("2026-10-09 12:00"), [round1], runs)).toEqual([]);
    expect(names(perth("2026-10-09 18:05"), [round1], runs)).toEqual(["preweekend"]);
  });

  it("is not due when the org has no fixture that weekend", () => {
    expect(names(perth("2026-10-08 18:10"), [], weeklyDone)).toEqual([]);
  });
});

describe("duePlans — match day", () => {
  const before = [ran("weekly", "2026-10-05 06:01"), ran("preweekend", "2026-10-09 18:04")];

  it("runs the match-morning plan at 07:00", () => {
    expect(names(perth("2026-10-10 06:59"), [round1], before)).toEqual([]);
    expect(names(perth("2026-10-10 07:02"), [round1], before)).toEqual(["matchmorn"]);
  });

  it("is due hourly from two hours before the start until two hours after the end", () => {
    const runs = [...before, ran("matchmorn", "2026-10-10 07:01")];
    expect(names(perth("2026-10-10 09:40"), [round1], runs)).toEqual([]);
    expect(names(perth("2026-10-10 09:50"), [round1], runs)).toEqual(["matchday"]);
    // One-dayer: 11:45 + 7h = 18:45, +2h = 20:45.
    expect(names(perth("2026-10-10 20:40"), [round1], runs)).toEqual(["matchday"]);
    expect(names(perth("2026-10-10 20:50"), [round1], runs)).toEqual([]);
  });

  it("serves each hour once, keyed to the top of the hour", () => {
    const runs = [
      ...before,
      ran("matchmorn", "2026-10-10 07:01"),
      ran("matchday", "2026-10-10 13:02"),
    ];
    expect(names(perth("2026-10-10 13:40"), [round1], runs)).toEqual([]);
    const [plan] = duePlans(perth("2026-10-10 14:03"), [ORG], [round1], runs);
    expect(plan.planName).toBe("matchday");
    expect(plan.slot).toBe(perth("2026-10-10 14:00").toISOString());
    expect(plan.plan).toMatchObject({ scorecards: "since", since: "2026-10-10" });
  });

  it("uses a shorter window for T20s", () => {
    expect(matchDurationMs("Twenty20")).toBeLessThan(matchDurationMs("One Day"));
    const t20 = { ...round1, startAt: perth("2026-10-10 15:00"), matchType: "T20" };
    const runs = [...before, ran("matchmorn", "2026-10-10 07:01")];
    // 15:00 + 3.5h + 2h = 20:30.
    expect(names(perth("2026-10-10 20:20"), [t20], runs)).toEqual(["matchday"]);
    expect(names(perth("2026-10-10 20:40"), [t20], runs)).toEqual([]);
  });
});

describe("duePlans — after the match", () => {
  const done = [
    ran("weekly", "2026-10-05 06:01"),
    ran("preweekend", "2026-10-09 18:04"),
    ran("matchmorn", "2026-10-10 07:01"),
    ran("matchday", "2026-10-10 20:01"),
  ];

  it("runs the day-after plan at 08:00 and 18:00 for yesterday's match day", () => {
    expect(names(perth("2026-10-11 07:50"), [round1], done)).toEqual([]);
    const [am] = duePlans(perth("2026-10-11 08:05"), [ORG], [round1], done);
    expect(am).toMatchObject({ planName: "dayafter", plan: { since: "2026-10-10", resume: true } });
    const runs = [...done, ran("dayafter", "2026-10-11 08:06")];
    expect(names(perth("2026-10-11 17:00"), [round1], runs)).toEqual([]);
    expect(names(perth("2026-10-11 18:01"), [round1], runs)).toEqual(["dayafter"]);
  });

  it("catches up on day +3 only while a fixture from that day is unresolved", () => {
    // Tue 13 Oct: the 12 Oct weekly has run; only the catch-up remains.
    const runs = [...done, ran("dayafter", "2026-10-11 18:02"), ran("weekly", "2026-10-12 06:02")];
    expect(names(perth("2026-10-13 08:05"), [round1], runs)).toEqual(["catchup"]);
    const completed = { ...round1, status: "COMPLETED" };
    expect(names(perth("2026-10-13 08:05"), [completed], runs)).toEqual([]);
  });
});

describe("duePlans — organisations", () => {
  it("plans each organisation independently and only for its own fixtures", () => {
    const now = perth("2026-10-10 07:05");
    const runs = [ran("weekly", "2026-10-05 06:01"), ran("preweekend", "2026-10-09 18:04")];
    const plans = duePlans(now, [ORG, OTHER], [round1], runs);
    // Sorted by organisation id.
    expect(plans.map((p) => [p.orgId, p.planName])).toEqual([
      [OTHER, "weekly"],
      [ORG, "matchmorn"],
    ]);
  });

  it("dedupes and lower-cases organisation ids", () => {
    const plans = duePlans(perth("2026-10-05 06:05"), [ORG.toUpperCase(), ORG], [], []);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.orgId).toBe(ORG);
  });

  it("does not count a run of another plan, or another org's run", () => {
    const runs: LastRun[] = [
      { orgId: OTHER, planName: "weekly", loadedAt: perth("2026-10-05 06:01") },
      ran("preweekend", "2026-10-05 06:30"),
    ];
    expect(names(perth("2026-10-05 07:00"), [], runs)).toEqual(["weekly"]);
  });
});
