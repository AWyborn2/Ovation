/**
 * The Posting Plan's new round carousels (plan 2026-10-07-001 U4, U5): club
 * leaderboards and ladders. Central reads, the tenant and drafting are faked;
 * the drafting gates and card builders are real.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  findPostingStyle,
  planFromStyle,
  type PostingPlan,
} from "@workspace/scorecard/posting-plan";
import { planCardSet, type SetInput } from "@workspace/scorecard";

const h = vi.hoisted(() => {
  const state: { settings: Record<string, unknown> | null } = { settings: null };
  const chain = () => {
    const q = {
      from: () => q,
      where: () => q,
      then: (ok: (v: unknown[]) => unknown) =>
        Promise.resolve(state.settings ? [state.settings] : []).then(ok),
    };
    return q;
  };
  return {
    state,
    isCentral: true,
    orgId: "org-club" as string | null,
    db: { select: () => chain() },
    upserts: [] as { sourceKey: string; cardInput: Record<string, unknown> }[],
    centralClubMatches: vi.fn(),
    centralClubTotalsBySeason: vi.fn(),
    playhqGradeIdsForCentralMatches: vi.fn(),
    playhqGradeLadderUncached: vi.fn(),
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  fixturesTable: {},
  teamListsTable: {},
  socialSettingsTable: { tenantId: {} },
}));
vi.mock("@workspace/db/central-queries", () => ({
  centralClubMatches: h.centralClubMatches,
  centralClubTotalsBySeason: h.centralClubTotalsBySeason,
  playhqGradeIdsForCentralMatches: h.playhqGradeIdsForCentralMatches,
  playhqGradeLadderUncached: h.playhqGradeLadderUncached,
}));
vi.mock("../tenant", () => ({
  tenantIsCentral: async () => h.isCentral,
  getTenantCentralClubId: async () => 77,
  getTenantPlayhqOrgId: async () => h.orgId,
}));
vi.mock("../club-overlay", () => ({ loadClubIdentity: async () => ({ merges: [] }) }));
vi.mock("../club-grade-order", () => ({
  inClubGradeOrder: async <T>(_t: number, rows: T[]) => rows,
}));
vi.mock("../match-detail", () => ({ loadCentralMatchDetail: async () => null }));
vi.mock("../draft-upsert", () => ({
  upsertDraftByKey: async (args: { sourceKey: string; cardInput: Record<string, unknown> }) => {
    const seen = h.upserts.some((u) => u.sourceKey === args.sourceKey);
    h.upserts.push(args);
    return { action: seen ? "refreshed" : "inserted" };
  },
}));
vi.mock("./match-day", () => ({ formatFixtureTime: () => "" }));
vi.mock("./team-list", () => ({
  loadAutoDebuts: async () => new Map(),
  teamListSeasonOf: () => 2026,
  teamListShirtNumberLoader: () => async () => new Map(),
  teamListToCardInput: () => ({}),
}));

import { generateClubLeaderboardDrafts, generateLadderDrafts } from "./round-sets";

// Sunday 22 Nov 2026, 8pm Perth: just after the default weekend-wrap time.
const NOW = new Date("2026-11-22T12:00:00Z");

function withPlan(mutate: (p: PostingPlan) => void = () => {}) {
  const plan = planFromStyle(findPostingStyle("round-carousels")!);
  mutate(plan);
  h.state.settings = { tenantId: 7, postingPlan: plan, roundSchedules: null };
}

const match = (
  id: number,
  grade: string,
  matchDate: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  grade,
  season: 2026,
  round: id >= 10 ? 5 : 4,
  matchDate,
  abandoned: false,
  result: "won",
  ...extra,
});

const leaders = (runs: string | null, catches: string | null) => ({
  gradeLabel: "A Grade",
  topRunScorer: runs ? { playerName: runs, value: 312 } : null,
  topWicketTaker: { playerName: "Bowler", value: 17 },
  topCatches: catches ? { playerName: catches, value: 6 } : null,
  topDismissals: null,
});

const team = (teamName: string, rank: number, played: number, isClub = false) => ({
  teamId: teamName,
  teamName,
  orgId: isClub ? "org-club" : "x",
  isClub,
  rank,
  played,
  won: 1,
  lost: 1,
  points: 12,
});

beforeEach(() => {
  h.upserts.length = 0;
  h.isCentral = true;
  h.orgId = "org-club";
  withPlan();
  vi.clearAllMocks();
  h.centralClubMatches.mockResolvedValue([
    match(1, "A Grade", "2026-11-14"),
    match(2, "B Grade", "2026-11-14"),
    match(10, "A Grade", "2026-11-21"),
    match(11, "B Grade", "2026-11-21"),
  ]);
  h.centralClubTotalsBySeason.mockResolvedValue([leaders("Runner", "Catcher")]);
  h.playhqGradeIdsForCentralMatches.mockResolvedValue(
    new Map([
      [1, "g-a"],
      [10, "g-a"],
      [2, "g-b"],
      [11, "g-b"],
    ]),
  );
  h.playhqGradeLadderUncached.mockImplementation(async (gradeId: string) => ({
    gradeId,
    gradeName: gradeId,
    season: "2026/27",
    ladders: [{ name: "Ladder", teams: [team("Rivals", 1, 2), team("Club", 2, 2, true)] }],
  }));
});

describe("club leaderboards round carousel", () => {
  it("drafts one carousel with a slide per category that has a leader", async () => {
    const r = await generateClubLeaderboardDrafts(7, NOW);
    expect(r.drafted).toBe(1);
    const [u] = h.upserts;
    expect(u.sourceKey).toBe("clubleaderboard-round:2026:5");
    const slides = planCardSet(u.cardInput as SetInput).map((s) => s.input);
    expect(slides.map((s) => s.category)).toEqual(["Runs", "Wickets", "Catches"]);
    expect(slides.every((s) => s.kind === "clubLeaderboard")).toBe(true);
  });

  it("omits a category nobody leads yet, and drafts nothing when none has a leader", async () => {
    h.centralClubTotalsBySeason.mockResolvedValue([leaders("Runner", null)]);
    await generateClubLeaderboardDrafts(7, NOW);
    const cats = planCardSet(h.upserts[0].cardInput as SetInput).map((s) => s.input.category);
    expect(cats).toEqual(["Runs", "Wickets"]);

    h.upserts.length = 0;
    h.centralClubTotalsBySeason.mockResolvedValue([]);
    expect((await generateClubLeaderboardDrafts(7, NOW)).drafted).toBe(0);
    expect(h.upserts).toHaveLength(0);
  });

  it("refreshes rather than duplicates on a second sweep", async () => {
    await generateClubLeaderboardDrafts(7, NOW);
    const again = await generateClubLeaderboardDrafts(7, NOW);
    expect(again).toEqual({ drafted: 0, refreshed: 1 });
  });

  it("drafts nothing with the row off, or before a plan is saved", async () => {
    withPlan((p) => (p.rows.clubLeaderboards.enabled = false));
    expect((await generateClubLeaderboardDrafts(7, NOW)).drafted).toBe(0);
    h.state.settings = { tenantId: 7, postingPlan: null };
    expect((await generateClubLeaderboardDrafts(7, NOW)).drafted).toBe(0);
  });
});

describe("ladders round carousel", () => {
  it("drafts a ladder slide per grade played this round, club row flagged", async () => {
    const r = await generateLadderDrafts(7, NOW);
    expect(r.drafted).toBe(1);
    const [u] = h.upserts;
    expect(u.sourceKey).toBe("ladder-round:2026:5");
    const slides = planCardSet(u.cardInput as SetInput).map((s) => s.input);
    expect(slides.map((s) => s.gradeLabel)).toEqual(["A GRADE", "B GRADE"]);
    expect(slides[0].asOfLabel).toBe("AFTER ROUND 5");
    const rows = slides[0].rows as { team: string; isClub?: boolean }[];
    expect(rows.find((x) => x.isClub)?.team).toBe("Club");
  });

  it("labels each table when a grade publishes several", async () => {
    h.playhqGradeLadderUncached.mockImplementation(async (gradeId: string) => ({
      gradeId,
      gradeName: gradeId,
      season: null,
      ladders: [
        { name: "One Day", teams: [team("Club", 1, 2, true)] },
        { name: "Two Day", teams: [team("Club", 3, 2, true)] },
      ],
    }));
    await generateLadderDrafts(7, NOW);
    const names = planCardSet(h.upserts[0].cardInput as SetInput).map(
      (s) => s.input.competitionName,
    );
    expect(names).toEqual([
      "A GRADE · ONE DAY",
      "A GRADE · TWO DAY",
      "B GRADE · ONE DAY",
      "B GRADE · TWO DAY",
    ]);
  });

  it("skips a ladder that hasn't caught up with the club's finished games", async () => {
    h.playhqGradeLadderUncached.mockImplementation(async (gradeId: string) => ({
      gradeId,
      gradeName: gradeId,
      season: null,
      // B Grade's ladder still shows one game played: scraped before PlayHQ recalculated.
      ladders: [{ name: "L", teams: [team("Club", 1, gradeId === "g-b" ? 1 : 2, true)] }],
    }));
    await generateLadderDrafts(7, NOW);
    const grades = planCardSet(h.upserts[0].cardInput as SetInput).map((s) => s.input.gradeLabel);
    expect(grades).toEqual(["A GRADE"]);
  });

  it("drafts nothing when every ladder is stale or unpublished", async () => {
    h.playhqGradeLadderUncached.mockResolvedValue(null);
    expect((await generateLadderDrafts(7, NOW)).drafted).toBe(0);
  });

  it("drafts nothing for a club with no PlayHQ organisation", async () => {
    h.orgId = null;
    expect((await generateLadderDrafts(7, NOW)).drafted).toBe(0);
  });

  it("follows the row's grade choice", async () => {
    withPlan((p) => {
      p.rows.ladders.grades = { "B Grade": false };
    });
    await generateLadderDrafts(7, NOW);
    const grades = planCardSet(h.upserts[0].cardInput as SetInput).map((s) => s.input.gradeLabel);
    expect(grades).toEqual(["A GRADE"]);
  });

  it("refreshes rather than duplicates on a second sweep", async () => {
    await generateLadderDrafts(7, NOW);
    expect(await generateLadderDrafts(7, NOW)).toEqual({ drafted: 0, refreshed: 1 });
  });

  it("never includes a junior grade, even one the row ticks", async () => {
    withPlan((p) => {
      p.rows.ladders.grades = { "Under 16": true };
    });
    h.centralClubMatches.mockResolvedValue([
      match(10, "A Grade", "2026-11-21"),
      match(12, "Under 16", "2026-11-21"),
    ]);
    h.playhqGradeIdsForCentralMatches.mockResolvedValue(
      new Map([
        [10, "g-a"],
        [12, "g-u16"],
      ]),
    );
    await generateLadderDrafts(7, NOW);
    const grades = planCardSet(h.upserts[0].cardInput as SetInput).map((s) => s.input.gradeLabel);
    expect(grades).toEqual(["A GRADE"]);
    expect(h.playhqGradeLadderUncached).not.toHaveBeenCalledWith("g-u16", expect.anything());
  });
});
