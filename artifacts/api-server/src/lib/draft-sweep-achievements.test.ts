/**
 * The drafting sweep's achievement wiring, with every engine mocked:
 *   - a central-data club's scheduled sweep drafts achievement cards for the
 *     same recent matches it drafts results for, then advances the watermark;
 *   - an achievement failure never blocks the watermark or the other engines;
 *   - the native club is unchanged: its imports still run the native
 *     post-commit engines, and its scheduled sweep never reads central
 *     achievements;
 *   - backfill drafts achievements only when asked, and never moves the
 *     watermark.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => {
  const settings: Record<string, unknown> = { tenantId: 7, centralSweepWatermark: 100 };
  const updates: Record<string, unknown>[] = [];
  const chain = () => {
    const q = {
      from: () => q,
      where: () => q,
      orderBy: () => q,
      then: (ok: (v: unknown[]) => unknown) => Promise.resolve([]).then(ok),
    };
    return q;
  };
  return {
    settings,
    updates,
    isCentral: true,
    db: {
      select: () => chain(),
      update: () => ({
        set: (v: Record<string, unknown>) => ({
          where: async () => {
            updates.push(v);
          },
        }),
      }),
    },
    runPostCommitSocial: vi.fn(async () => {}),
    runBatchPostCommitSocial: vi.fn(async () => {}),
    generateMatchSummaryDrafts: vi.fn(async () => ({ drafted: 1, skipped: 0, errors: [] })),
    draftCentralAchievements: vi.fn(async () => ({ drafted: 3, skipped: 0 })),
    centralClubMatchesAfter: vi.fn(),
    centralClubMatches: vi.fn(),
  };
});

vi.mock("@workspace/db", () => ({
  db: h.db,
  matchesTable: { season: {}, grade: {}, id: {} },
  socialSettingsTable: { tenantId: {} },
}));
vi.mock("@workspace/db/central-queries", () => ({
  centralClubMaxMatchId: async () => 100,
  centralClubMatchesAfter: h.centralClubMatchesAfter,
  centralClubMatches: h.centralClubMatches,
}));
vi.mock("./grades-helpers", () => ({ notEmptyFixture: {} }));
vi.mock("./post-commit-social", () => ({
  runPostCommitSocial: h.runPostCommitSocial,
  runBatchPostCommitSocial: h.runBatchPostCommitSocial,
}));
vi.mock("./match-summary-drafter", () => ({
  generateMatchSummaryDrafts: h.generateMatchSummaryDrafts,
}));
vi.mock("./engines/match-day", () => ({ generateMatchDayDrafts: async () => ({ drafted: 0 }) }));
vi.mock("./engines/team-list", () => ({ generateTeamListDrafts: async () => ({ drafted: 0 }) }));
vi.mock("./social-cards-helpers", () => ({ ensureSettings: async () => h.settings }));
vi.mock("./roundup", () => ({ generateRoundUpDrafts: async () => [] }));
vi.mock("./tenant", () => ({
  tenantIsCentral: async () => h.isCentral,
  getTenantCentralClubId: async () => 77,
  NATIVE_STATS_TENANT_ID: 1,
}));
vi.mock("./effective-draft-state", () => ({
  loadAutoPost: async () => ({ enabled: false }),
  persistDueDrafts: async () => [],
}));
vi.mock("./draft-notifications", () => ({ notifyDraftsReady: async () => {} }));
vi.mock("./draft-enrich", () => ({ fillMissingDraftPhotos: async () => {} }));
vi.mock("./central-achievements", () => ({
  draftCentralAchievements: h.draftCentralAchievements,
}));

import { backfillMatchDrafts, runDraftSweep } from "./draft-sweep";

const NOW = new Date("2026-11-20T10:00:00Z");
const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn() };

beforeEach(() => {
  h.isCentral = true;
  h.settings.centralSweepWatermark = 100;
  h.updates.length = 0;
  vi.clearAllMocks();
  h.centralClubMatchesAfter.mockResolvedValue({
    matches: [
      { matchId: 101, grade: "A Grade", season: 2026, matchDate: "2026-11-15" },
      // History past the watermark (a reload): outside the recent window.
      { matchId: 102, grade: "A Grade", season: 2019, matchDate: "2019-01-12" },
    ],
    lastSeenId: 103,
  });
  h.centralClubMatches.mockResolvedValue([{ id: 101 }, { id: 99 }]);
});

describe("scheduled sweep: central-data club", () => {
  it("drafts achievements for the recent matches, then advances the watermark", async () => {
    const summary = await runDraftSweep(7, { kind: "scheduled", now: NOW }, log);
    expect(h.draftCentralAchievements).toHaveBeenCalledWith(7, 77, [101], NOW);
    expect(summary).toMatchObject({ centralMatches: 2, matchSummaries: 1, achievements: 3 });
    expect(h.updates).toContainEqual({ centralSweepWatermark: 103 });
  });

  it("an achievement failure still advances the watermark", async () => {
    h.draftCentralAchievements.mockRejectedValueOnce(new Error("central down"));
    const summary = await runDraftSweep(7, { kind: "scheduled", now: NOW }, log);
    expect(summary.achievements).toBe(0);
    expect(summary.matchSummaries).toBe(1);
    expect(h.updates).toContainEqual({ centralSweepWatermark: 103 });
    expect(log.error).toHaveBeenCalledWith(expect.anything(), "central achievement drafts failed");
  });

  it("the first sweep only records the watermark", async () => {
    h.settings.centralSweepWatermark = null;
    await runDraftSweep(7, { kind: "scheduled", now: NOW }, log);
    expect(h.draftCentralAchievements).not.toHaveBeenCalled();
  });
});

describe("native club unchanged", () => {
  beforeEach(() => {
    h.isCentral = false;
  });

  it("an import runs the native post-commit engines, never the central achievements", async () => {
    await runDraftSweep(
      1,
      {
        kind: "import",
        importId: 5,
        affectedGrades: ["A Grade"],
        season: 2026,
        beforeMap: new Map(),
      },
      log,
    );
    expect(h.runPostCommitSocial).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 1, importId: 5 }),
    );
    expect(h.draftCentralAchievements).not.toHaveBeenCalled();
  });

  it("a scheduled sweep never reads central achievements", async () => {
    const summary = await runDraftSweep(1, { kind: "scheduled", now: NOW }, log);
    expect(h.draftCentralAchievements).not.toHaveBeenCalled();
    expect(h.centralClubMatchesAfter).not.toHaveBeenCalled();
    expect(summary.achievements).toBe(0);
  });

  it("backfill with achievements drafts none for the native club", async () => {
    const r = await backfillMatchDrafts(1, { season: 2026, include: ["results", "achievements"] });
    expect(r.achievements).toBe(0);
    expect(h.draftCentralAchievements).not.toHaveBeenCalled();
  });
});

describe("backfill", () => {
  it("defaults to results only", async () => {
    const r = await backfillMatchDrafts(7, { season: 2026 }, NOW);
    expect(r.achievements).toBeUndefined();
    expect(h.generateMatchSummaryDrafts).toHaveBeenCalled();
    expect(h.draftCentralAchievements).not.toHaveBeenCalled();
  });

  it("drafts achievements for the chosen matches without moving the watermark", async () => {
    const r = await backfillMatchDrafts(
      7,
      { season: 2026, matchIds: [101, 555], include: ["results", "achievements"] },
      NOW,
    );
    expect(h.draftCentralAchievements).toHaveBeenCalledWith(7, 77, [101], NOW);
    expect(r).toMatchObject({ considered: 1, drafted: 1, achievements: 3 });
    expect(h.updates).toEqual([]);
  });

  it("achievements only skips the Match Result cards", async () => {
    const r = await backfillMatchDrafts(7, { season: 2026, include: ["achievements"] }, NOW);
    expect(h.generateMatchSummaryDrafts).not.toHaveBeenCalled();
    expect(r).toMatchObject({ considered: 2, drafted: 0, achievements: 3 });
  });
});
