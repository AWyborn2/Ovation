import { describe, expect, it } from "vitest";

import { assessHealth, graceMs, type RunSummary } from "./health";
import type { DuePlan } from "./cadence";

const ORG = "4559f1b9-86d8-eb11-a7ad-2818780da0cc";
const OTHER = "11111111-2222-3333-4444-555555555555";
const H = 3_600_000;
const NOW = new Date("2026-10-10T12:00:00Z");

const due = (planName: DuePlan["planName"], agoH: number, orgId = ORG): DuePlan => ({
  orgId,
  planName,
  slot: new Date(NOW.getTime() - agoH * H).toISOString(),
  plan: { orgId, seasons: "current", kinds: ["matches"], balls: "none", scorecards: "none" },
});
const run = (status: string, agoH: number, orgId = ORG): RunSummary => ({
  orgId,
  lastRunAt: new Date(NOW.getTime() - agoH * H),
  lastRunStatus: status,
  lastRunPlan: "matchday",
  lastRunCollector: "gha-headless",
  lastSuccessAt: status === "failed" ? null : new Date(NOW.getTime() - agoH * H),
});

describe("assessHealth", () => {
  it("is ok when nothing is due and the last run succeeded", () => {
    const [h] = assessHealth(NOW, [ORG], [], [run("ok", 1)]);
    expect(h).toMatchObject({ orgId: ORG, state: "ok", reasons: [] });
  });

  it("tolerates a plan that has only just become due", () => {
    const [h] = assessHealth(NOW, [ORG], [due("matchday", 0.5), due("weekly", 20)], [run("ok", 1)]);
    expect(h!.state).toBe("ok");
    expect(h!.due).toHaveLength(2);
  });

  it("is overdue when a match-calendar plan waits more than 3 h", () => {
    const [h] = assessHealth(NOW, [ORG], [due("matchday", 3.5)], [run("ok", 4)]);
    expect(h!.state).toBe("overdue");
    expect(h!.reasons[0]).toMatch(/^matchday due for 3.5 h/);
  });

  it("gives the weekly plan 26 h (a dead runner for a day pages; a late cron does not)", () => {
    expect(graceMs("weekly")).toBe(26 * H);
    expect(assessHealth(NOW, [ORG], [due("weekly", 25)], [])[0]!.state).toBe("ok");
    expect(assessHealth(NOW, [ORG], [due("weekly", 27)], [])[0]!.state).toBe("overdue");
  });

  it("is failed when the latest run failed, even with nothing overdue", () => {
    const [h] = assessHealth(NOW, [ORG], [], [run("failed", 0.2)]);
    expect(h!.state).toBe("failed");
    expect(h!.reasons[0]).toMatch(/failed at/);
  });

  it("counts a partial run as a success, not a failure", () => {
    expect(assessHealth(NOW, [ORG], [], [run("partial", 0.2)])[0]!.state).toBe("ok");
  });

  it("reports failed ahead of overdue but keeps both reasons", () => {
    const [h] = assessHealth(NOW, [ORG], [due("matchday", 5)], [run("failed", 0.2)]);
    expect(h!.state).toBe("failed");
    expect(h!.reasons).toHaveLength(2);
  });

  it("assesses each organisation on its own plans and runs (never-synced = no run yet)", () => {
    const out = assessHealth(NOW, [ORG, OTHER], [due("weekly", 30, OTHER)], [run("ok", 1)]);
    expect(out.map((h) => [h.orgId, h.state])).toEqual([
      [OTHER, "overdue"],
      [ORG, "ok"],
    ]);
    expect(out[0]!.lastRunAt).toBeNull();
  });
});
