import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Request } from "express";
import type * as DbModule from "@workspace/db";
import {
  GetWeekendCarouselSourcesResponse,
  type MatchDetail,
  type JuniorMatchDetail,
} from "@workspace/api-zod";
import { carouselContent, carouselMatchDay } from "./carousel-content";

const mocks = vi.hoisted(() => ({
  matches: vi.fn(),
  detail: vi.fn(),
  source: vi.fn(),
  juniors: vi.fn(),
  juniorDetail: vi.fn(),
}));
vi.mock("@workspace/db", async (original) => ({
  ...(await original<typeof DbModule>()),
  db: { select: () => ({ from: () => ({ where: mocks.juniors }) }) },
}));
vi.mock("@workspace/db/central-queries", () => ({ centralClubMatches: mocks.matches }));
vi.mock("./tenant", () => ({ dataSource: mocks.source }));
vi.mock("./match-detail", () => ({
  loadCentralMatchDetail: mocks.detail,
  loadMatchDetail: vi.fn(),
}));
vi.mock("./club-overlay", () => ({
  beforeBoundary: () => false,
  loadClubOverlayData: async () => ({ boundaries: [] }),
}));
vi.mock("./junior-helpers", () => ({
  getPrivateIds: async () => new Set(),
  MASK_NAME: "Private Player",
}));
vi.mock("./tenant-brand", () => ({ getTenantBrand: async () => null }));
vi.mock("./match-summary-drafter", () => ({ loadJuniorMatchDetail: mocks.juniorDetail }));

const match = {
  id: 91,
  grade: "A Grade",
  season: 2026,
  round: 1,
  matchDate: "2026-10-10",
  opponent: "Visitors",
  result: "Won by 40 runs",
  venue: "Ground",
  clubScore: "200/6",
  opponentScore: "160/10",
};
const detail = {
  ...match,
  abandoned: false,
  lines: [
    {
      id: 1,
      playerId: 22,
      givenName: "Sam",
      surname: "Batter",
      batted: true,
      bowled: true,
      battingPos: 1,
      runs: 80,
      balls: 70,
      notOut: false,
      wickets: 3,
      runsConceded: 20,
      overs: "8",
    },
  ],
} as unknown as MatchDetail;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.source.mockResolvedValue({ kind: "central", tenantId: 8, clubId: 88 });
  mocks.matches.mockResolvedValue([match]);
  mocks.detail.mockResolvedValue(detail);
  mocks.juniors.mockResolvedValue([]);
});
const load = (type: "results" | "matchSummary") =>
  carouselContent({} as Request, 8, type, [], "2026-10-09", "2026-10-11");

describe("carousel completed-match sources", () => {
  it.each(["results", "matchSummary"] as const)(
    "exposes round/stage metadata for %s through response validation",
    async (type) => {
      for (const [round, stage, expected] of [
        [5, null, "Round 5"],
        [14, "Grand Final", "Grand Final"],
        [null, "Semi Final", "Semi Final"],
        [null, null, ""],
      ] as const) {
        mocks.matches.mockResolvedValue([{ ...match, round, stage }]);
        mocks.detail.mockResolvedValue({ ...detail, round, stage });
        const sources = await load(type);
        const parsed = GetWeekendCarouselSourcesResponse.parse({
          timeZone: "Australia/Perth",
          fixtures: sources.fixtures.map((f) => ({
            ...f,
            startAt: f.startAt.toISOString(),
            createdAt: f.createdAt.toISOString(),
          })),
          content: sources.content,
          photos: [],
          coverPhotos: [],
          warnings: sources.warnings,
        });
        expect(parsed.content?.[-91]).toMatchObject({ roundLabel: expected });
        expect(parsed.fixtures[0].roundLabel).toBe(expected);
      }
    },
  );
  it.each(["7", "Preliminary Final", null])(
    "exposes junior source labels independently of the title (%s)",
    async (round) => {
      mocks.matches.mockResolvedValue([]);
      const junior = {
        id: 7,
        ageGroup: "U15",
        season: "2026/27",
        round,
        matchDate: "2026-10-10",
        opponentName: "Visitors",
        hhResult: "Won",
        venue: "Oval",
      };
      mocks.juniors.mockResolvedValue([junior]);
      mocks.juniorDetail.mockResolvedValue({
        ...junior,
        innings: [],
      } as unknown as JuniorMatchDetail);
      const sources = await load("results");
      expect(sources.content[-1_000_000_007]).toMatchObject({
        roundLabel: round ?? "",
        junior: true,
      });
      expect(sources.fixtures[0].roundLabel).toBe(round ?? "");
    },
  );
  it("uses the tenant's canonical scorecard, differentiating concise results and full summaries", async () => {
    const result = await load("results");
    expect(mocks.matches).toHaveBeenCalledWith(88);
    expect(mocks.detail).toHaveBeenCalledWith({ kind: "central", tenantId: 8, clubId: 88 }, 91);
    expect(result.fixtures).toHaveLength(1);
    const r = result.content[-91];
    expect(r).toMatchObject({ kind: "matchSummary", carouselDetail: false, result: match.result });
    expect(JSON.stringify(r)).not.toContain("Sam Batter");
    const summary = await load("matchSummary");
    expect(summary.content[-91]).toMatchObject({ carouselDetail: true });
    expect(JSON.stringify(summary.content[-91])).toContain("Sam Batter");
  });
  it("deduplicates canonical matches and reports pending, undated and detail-free data", async () => {
    mocks.matches.mockResolvedValue([
      match,
      { ...match, id: 92 },
      { ...match, id: 93, matchDate: null },
      { ...match, id: 94, result: null },
      { ...match, id: 95, matchDate: "2026-10-12" },
    ]);
    const r = await load("results");
    expect(r.fixtures).toHaveLength(1);
    expect(r.warnings.join(" ")).toMatch(/undated/);
    expect(r.warnings.join(" ")).toMatch(/result is not available/);
    mocks.detail.mockResolvedValue({ ...detail, lines: [] });
    const summary = await load("matchSummary");
    expect(summary.fixtures).toHaveLength(0);
    expect(summary.warnings.join(" ")).toContain("no detailed innings");
  });
  it("gives an abandoned match a no-result card, in Results and Match summaries", async () => {
    const washedOut = {
      ...match,
      id: 96,
      result: null,
      abandoned: true,
      opponent: "Pinjarra A Grade",
    };
    mocks.matches.mockResolvedValue([washedOut]);
    mocks.detail.mockResolvedValue({ ...detail, ...washedOut, lines: [] });
    for (const type of ["results", "matchSummary"] as const) {
      const r = await load(type);
      expect(r.warnings).toEqual([]);
      expect(r.fixtures).toHaveLength(1);
      // No innings to detail: it posts as the result card, even in Match summaries.
      expect(r.content[-96]).toMatchObject({
        result: "Match abandoned",
        resultWinner: "draw",
        carouselDetail: false,
      });
    }
  });
  it("matches a fixture to its scorecard by grade and day, whatever each calls the opponent", async () => {
    mocks.matches.mockResolvedValue([
      { ...match, grade: "B Grade", opponent: "WSCC Senior Men B Grade" },
    ]);
    const fixture = (grade: string, opponentName: string) =>
      ({ id: 1, grade, opponentName, startAt: new Date("2026-10-10T01:30:00Z") }) as never;
    const r = await carouselContent(
      {} as Request,
      8,
      "results",
      [
        fixture("B Grade", "Warnbro Swans Cricket Club"),
        fixture("C Grade", "White Knights Baldivis"),
      ],
      "2026-10-09",
      "2026-10-11",
    );
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(
      /^C Grade v White Knights Baldivis: no eligible completed scorecard/,
    );
  });
  it("fails closed rather than substituting another tenant's data after a source failure", async () => {
    mocks.source.mockRejectedValue(new Error("tenant not configured"));
    await expect(load("results")).rejects.toThrow("tenant not configured");
    expect(mocks.matches).not.toHaveBeenCalled();
  });
  it("filters timestamps in Perth time and understands imported human-readable dates", () => {
    expect(carouselMatchDay("2026-10-08T16:00:00Z")).toBe("2026-10-09");
    expect(carouselMatchDay("12:20 PM, Saturday, 10 Oct 2026")).toBe("2026-10-10");
    expect(carouselMatchDay("unknown")).toBeNull();
  });
});
