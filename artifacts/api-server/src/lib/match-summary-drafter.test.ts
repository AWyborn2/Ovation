/**
 * Tests for the match-summary auto-draft engine. These exercise the real
 * exported `shouldDraftGrade` decision logic (grade config, junior defaults,
 * settings gates). The actual card-input transformation is tested in the
 * @workspace/scorecard package; here we verify the drafter's control flow.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@workspace/db", () => ({
  db: {},
  clubsTable: {},
  socialDraftsTable: {},
  socialSettingsTable: {},
  juniorMatchesTable: {},
  juniorMatchBattingTable: {},
  juniorMatchBowlingTable: {},
  juniorMatchRostersTable: {},
}));
vi.mock("@workspace/api-zod", () => ({}));
vi.mock("@workspace/scorecard", () => ({
  matchToSummaryInput: vi.fn(),
  juniorMatchToSummaryInput: vi.fn(),
}));
vi.mock("./tenant-brand", () => ({ getTenantBrand: vi.fn() }));
vi.mock("./match-detail", () => ({ loadMatchDetail: vi.fn() }));
vi.mock("./club-brand", () => ({
  getOpponentBrandsByAppClubId: vi.fn(),
  overlayNativeOpponents: vi.fn(),
}));
vi.mock("./junior-helpers", () => ({
  loadJuniorNaming: vi.fn(),
  splitScores: vi.fn(),
}));

import { shouldDraftGrade } from "./match-summary-drafter";
import { defaultPostingPlan, type PostingPlan } from "@workspace/scorecard/posting-plan";

type SocialSettings = Parameters<typeof shouldDraftGrade>[0];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("shouldDraftGrade (Posting Plan version 2)", () => {
  const withPlan = (plan: PostingPlan) =>
    ({ postingPlan: plan }) as unknown as NonNullable<SocialSettings>;
  const plan = (mutate: (p: PostingPlan) => void = () => {}) => {
    const p = defaultPostingPlan(false);
    mutate(p);
    return withPlan(p);
  };

  it("null settings fall back to the default table: seniors draft, juniors don't", () => {
    expect(shouldDraftGrade(null, "A Grade", false)).toBe(true);
    expect(shouldDraftGrade(null, "Under 14", true)).toBe(false);
  });

  it("a central club's default posts the round carousel, so no per-match card", () => {
    expect(shouldDraftGrade(null, "A Grade", false, true)).toBe(false);
  });

  it("Match result off drafts nothing", () => {
    const s = plan((p) => (p.rows.results.enabled = false));
    expect(shouldDraftGrade(s, "A Grade", false)).toBe(false);
    expect(shouldDraftGrade(s, "Under 14", true)).toBe(false);
  });

  it("a listed junior age group drafts; an unlisted one doesn't", () => {
    const s = plan((p) => (p.rows.results.grades = { "Under 14": true }));
    expect(shouldDraftGrade(s, "Under 14", true)).toBe(true);
    expect(shouldDraftGrade(s, "Under 12", true)).toBe(false);
  });

  it("a senior grade switched off is skipped; others keep the default", () => {
    const s = plan((p) => (p.rows.results.grades = { "B Grade": false }));
    expect(shouldDraftGrade(s, "B Grade", false)).toBe(false);
    expect(shouldDraftGrade(s, "A Grade", false)).toBe(true);
  });

  it("others off with A Grade listed allows only A Grade", () => {
    const s = plan((p) => {
      p.rows.results.grades = { "A Grade": true };
      p.rows.results.others = "off";
    });
    expect(shouldDraftGrade(s, "A Grade", false)).toBe(true);
    expect(shouldDraftGrade(s, "B Grade", false)).toBe(false);
  });

  it("a stored version 1 plan is ignored in favour of the default (ADR-004)", () => {
    const s = {
      postingPlan: { version: 1, styleId: null, rows: { results: { enabled: false } } },
    } as unknown as NonNullable<SocialSettings>;
    expect(shouldDraftGrade(s, "A Grade", false)).toBe(true);
  });

  it("a null or empty grade follows the default for the match type", () => {
    expect(shouldDraftGrade(plan(), null, false)).toBe(true);
    expect(shouldDraftGrade(plan(), null, true)).toBe(false);
    expect(shouldDraftGrade(plan(), "", false)).toBe(true);
  });
});
