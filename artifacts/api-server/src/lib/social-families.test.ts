/**
 * Social Studio automation U3 — card families and per-grade switches. Pure
 * unit tests (no DB).
 */
import { describe, it, expect } from "vitest";
import {
  CARD_KIND_FAMILY,
  SOCIAL_FAMILIES,
  familyAllows,
  familyOfKind,
  resolveFamilyConfig,
  syncFamilySettings,
} from "./social-families";
import { shouldDraftGrade } from "./match-summary-drafter";
import { defaultPostingPlan } from "@workspace/scorecard/posting-plan";

type Settings = Parameters<typeof shouldDraftGrade>[0] & object;

const legacy = (over: Partial<Settings> = {}): Settings =>
  ({
    engineMatchSummary: true,
    engineMilestone: false,
    engineRoundUp: false,
    matchSummaryGradeConfig: {},
    familyConfig: null,
    ...over,
  }) as Settings;

describe("card kind → family", () => {
  it("assigns all 25 card types to one of the four families", () => {
    expect(Object.keys(CARD_KIND_FAMILY)).toHaveLength(25);
    for (const family of Object.values(CARD_KIND_FAMILY)) {
      expect(SOCIAL_FAMILIES).toContain(family);
    }
    expect(familyOfKind("century")).toBe("achievements");
    expect(familyOfKind("matchDay")).toBe("matchday");
    expect(familyOfKind("nope")).toBeNull();
  });
});

describe("resolveFamilyConfig", () => {
  it("derives today's behaviour for a tenant that never saved family switches", () => {
    const config = resolveFamilyConfig(
      legacy({ matchSummaryGradeConfig: { "Under 15": { enabled: true } } }),
    );
    expect(config.results).toEqual({ enabled: true, grades: { "Under 15": true } });
    expect(config.achievements.enabled).toBe(false);
    expect(config.roundup.enabled).toBe(false);
    expect(config.matchday.enabled).toBe(false);
  });

  it("a saved config wins over the legacy flags; missing parts fall back", () => {
    const config = resolveFamilyConfig(
      legacy({ familyConfig: { achievements: { enabled: true, grades: {} } } }),
    );
    expect(config.achievements.enabled).toBe(true);
    expect(config.results.enabled).toBe(true);
  });

  it("no settings row means nothing drafts", () => {
    const config = resolveFamilyConfig(null);
    for (const f of SOCIAL_FAMILIES) expect(config[f].enabled).toBe(false);
  });
});

describe("familyAllows", () => {
  const config = resolveFamilyConfig(
    legacy({
      familyConfig: {
        results: { enabled: true, grades: { "Under 15": false, "B Grade": false } },
      },
    }),
  );

  it("seniors default on, juniors default off", () => {
    expect(familyAllows(config, "results", "A Grade", false)).toBe(true);
    expect(familyAllows(config, "results", "Under 13", true)).toBe(false);
  });

  it("a per-grade override wins over the default", () => {
    expect(familyAllows(config, "results", "B Grade", false)).toBe(false);
    expect(familyAllows(config, "results", "Under 15", true)).toBe(false);
  });

  it("a family that is off drafts for no grade", () => {
    expect(familyAllows(config, "achievements", "A Grade", false)).toBe(false);
  });
});

describe("AE4 — junior drafting per grade (Posting Plan version 2)", () => {
  it("Under 15s unlisted drafts nothing; listing it drafts for that age group only", () => {
    const off = { postingPlan: defaultPostingPlan(false) } as unknown as Settings;
    expect(shouldDraftGrade(off, "Under 15", true)).toBe(false);

    const plan = defaultPostingPlan(false);
    plan.rows.results.grades = { "Under 15": true };
    const on = { postingPlan: plan } as unknown as Settings;
    expect(shouldDraftGrade(on, "Under 15", true)).toBe(true);
    expect(shouldDraftGrade(on, "Under 13", true)).toBe(false);
  });
});

describe("Achievements off leaves match results alone", () => {
  it("switching Big Moments, milestones and debuts off does not stop match summaries", () => {
    const plan = defaultPostingPlan(false);
    plan.rows.bigMoments.enabled = false;
    plan.rows.milestones.enabled = false;
    plan.rows.debuts.enabled = false;
    expect(shouldDraftGrade({ postingPlan: plan } as unknown as Settings, "A Grade", false)).toBe(
      true,
    );
  });
});

describe("syncFamilySettings", () => {
  it("saving family switches mirrors the legacy engine flags and grade config", () => {
    const patch = syncFamilySettings(legacy(), {
      familyConfig: {
        achievements: { enabled: true },
        roundup: { enabled: true },
        results: { grades: { "C Grade": false } },
      },
    });
    expect(patch).toMatchObject({
      engineMatchSummary: true,
      engineMilestone: true,
      engineRoundUp: true,
      matchSummaryGradeConfig: { "C Grade": { enabled: false } },
    });
  });

  it("a legacy flag change on a saved config carries into the config", () => {
    const saved = legacy({
      familyConfig: resolveFamilyConfig(legacy()),
    });
    const patch = syncFamilySettings(saved, { engineMilestone: true });
    expect(patch.familyConfig?.achievements.enabled).toBe(true);
  });

  it("a legacy flag change on a never-saved config needs no extra write", () => {
    expect(syncFamilySettings(legacy(), { engineMilestone: true })).toEqual({});
  });
});
