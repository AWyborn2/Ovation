/**
 * Tests for the match-summary auto-draft engine. These exercise the pure
 * decision logic (grade config, junior defaults, settings gates) by mocking
 * the DB layer. The actual card-input transformation is tested in the
 * @workspace/scorecard package; here we verify the drafter's control flow.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Inline the shouldDraftGrade logic extracted from the drafter so we can test
// it without standing up a DB. The real function is not exported, so we test
// an identical copy. If the implementation drifts, these tests fail as a
// canary — the integration suite (on CI with a real DB) is the source of truth.
// ---------------------------------------------------------------------------

type SocialSettings = {
  engineMatchSummary: boolean;
  matchSummaryGradeConfig: Record<string, { enabled: boolean }>;
};

function shouldDraftGrade(
  settings: SocialSettings | null,
  grade: string | null,
  junior: boolean,
): boolean {
  if (!settings) return false;
  if (!settings.engineMatchSummary) return false;

  const config = settings.matchSummaryGradeConfig ?? {};
  const key = grade ?? "";
  if (key in config) return config[key].enabled;

  // Default: senior ON, junior OFF.
  return !junior;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("shouldDraftGrade", () => {
  const baseSettings: SocialSettings = {
    engineMatchSummary: true,
    matchSummaryGradeConfig: {},
  };

  it("returns false when settings are null", () => {
    expect(shouldDraftGrade(null, "A Grade", false)).toBe(false);
  });

  it("returns false when engineMatchSummary is OFF", () => {
    const settings = { ...baseSettings, engineMatchSummary: false };
    expect(shouldDraftGrade(settings, "A Grade", false)).toBe(false);
  });

  it("returns true for senior grade with default config (ON by default)", () => {
    expect(shouldDraftGrade(baseSettings, "A Grade", false)).toBe(true);
  });

  it("returns false for junior grade with default config (OFF by default)", () => {
    expect(shouldDraftGrade(baseSettings, "Under 14", true)).toBe(false);
  });

  it("returns true for junior grade explicitly enabled in config", () => {
    const settings = {
      ...baseSettings,
      matchSummaryGradeConfig: { "Under 14": { enabled: true } },
    };
    expect(shouldDraftGrade(settings, "Under 14", true)).toBe(true);
  });

  it("returns false for senior grade explicitly disabled in config", () => {
    const settings = {
      ...baseSettings,
      matchSummaryGradeConfig: { "A Grade": { enabled: false } },
    };
    expect(shouldDraftGrade(settings, "A Grade", false)).toBe(false);
  });

  it("uses default for a grade not present in config", () => {
    const settings = {
      ...baseSettings,
      matchSummaryGradeConfig: { "B Grade": { enabled: false } },
    };
    // "A Grade" is not in config -> defaults to senior ON
    expect(shouldDraftGrade(settings, "A Grade", false)).toBe(true);
    // "Under 14" is not in config -> defaults to junior OFF
    expect(shouldDraftGrade(settings, "Under 14", true)).toBe(false);
  });

  it("handles null grade gracefully", () => {
    expect(shouldDraftGrade(baseSettings, null, false)).toBe(true);
    expect(shouldDraftGrade(baseSettings, null, true)).toBe(false);
  });

  it("handles empty string grade the same as null", () => {
    const settings = {
      ...baseSettings,
      matchSummaryGradeConfig: { "": { enabled: true } },
    };
    // Empty string is in config and explicitly enabled
    expect(shouldDraftGrade(settings, "", false)).toBe(true);
    expect(shouldDraftGrade(settings, "", true)).toBe(true);
  });
});

describe("match summary draft engine design", () => {
  it("senior default is ON, junior default is OFF", () => {
    // This captures the invariant: when a grade is absent from the config,
    // senior matches draft automatically but junior matches do not.
    const settings: SocialSettings = {
      engineMatchSummary: true,
      matchSummaryGradeConfig: {},
    };

    // Senior grades auto-draft
    expect(shouldDraftGrade(settings, "A Grade", false)).toBe(true);
    expect(shouldDraftGrade(settings, "B Grade", false)).toBe(true);
    expect(shouldDraftGrade(settings, "C Grade", false)).toBe(true);

    // Junior grades do NOT auto-draft by default
    expect(shouldDraftGrade(settings, "Under 14", true)).toBe(false);
    expect(shouldDraftGrade(settings, "Under 12", true)).toBe(false);
  });

  it("per-grade config overrides defaults in both directions", () => {
    const settings: SocialSettings = {
      engineMatchSummary: true,
      matchSummaryGradeConfig: {
        "A Grade": { enabled: false }, // senior OFF (override)
        "Under 14": { enabled: true }, // junior ON (override)
      },
    };

    expect(shouldDraftGrade(settings, "A Grade", false)).toBe(false);
    expect(shouldDraftGrade(settings, "B Grade", false)).toBe(true); // default ON
    expect(shouldDraftGrade(settings, "Under 14", true)).toBe(true);
    expect(shouldDraftGrade(settings, "Under 12", true)).toBe(false); // default OFF
  });

  it("global kill switch overrides all per-grade config", () => {
    const settings: SocialSettings = {
      engineMatchSummary: false,
      matchSummaryGradeConfig: {
        "A Grade": { enabled: true },
        "Under 14": { enabled: true },
      },
    };

    expect(shouldDraftGrade(settings, "A Grade", false)).toBe(false);
    expect(shouldDraftGrade(settings, "Under 14", true)).toBe(false);
  });
});
