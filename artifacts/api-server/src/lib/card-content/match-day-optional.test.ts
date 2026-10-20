/**
 * ADR-010 P5 wiring: `buildMatchDayContent` loads an optional data field only
 * when it is asked for (visible), never for a junior fixture, and a field
 * whose data is missing or whose read throws is left off the content (the
 * slide hides it; never "TBC") with one warning per field. The reads
 * themselves are faked here; `optional-data.db.test.ts` runs them for real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FixtureRow } from "@workspace/db";

const h = vi.hoisted(() => ({
  ladder: vi.fn(),
  lastMeeting: vi.fn(),
  watchLoader: vi.fn(),
  sides: vi.fn(),
}));

vi.mock("./names", () => ({ loadCardNames: async () => ({}) }));
vi.mock("../tenant", () => ({
  getTenantPlayhqOrgId: async () => "org",
  tenantCentralClubIdOrNull: async () => 1,
}));
vi.mock("./optional-data", () => ({
  loadFixtureLadder: h.ladder,
  loadLastMeeting: h.lastMeeting,
  milestoneWatchLoader: h.watchLoader,
  publishedSides: h.sides,
}));

import { OPTIONAL_FIELD_WARNING, buildMatchDayContent } from "./match-day";

const fixture = (id: number, grade: string): FixtureRow =>
  ({
    id,
    tenantId: 5,
    grade,
    roundLabel: "Round 3",
    opponentName: "Mandurah",
    opponentClubId: null,
    opponentLogoUrl: null,
    venue: "Oval",
    startAt: new Date("2026-10-10T02:00:00Z"),
    isHome: true,
    playhqMatchId: "phq",
    competitionName: null,
  }) as unknown as FixtureRow;

const ALL = new Set(["fixture.ladder", "fixture.lastMeeting", "fixture.milestoneWatch"] as const);
const SENIOR = fixture(1, "A Grade");
const JUNIOR = fixture(2, "Under 13 Blue");

beforeEach(() => {
  vi.clearAllMocks();
  h.ladder.mockResolvedValue({
    teams: 8,
    tableName: null,
    club: { rank: 3 },
    opposition: { rank: 5 },
  });
  h.lastMeeting.mockResolvedValue({
    outcome: "won",
    margin: "24 runs",
    date: "2026-01-10",
    season: "2025/26",
  });
  h.sides.mockResolvedValue(new Map([[1, [{ order: 1, displayName: "Jack Smith" }]]]));
  h.watchLoader.mockResolvedValue(() => ({
    playerName: "Jack Smith",
    stat: "runs",
    tier: 1000,
    gap: 12,
  }));
});

describe("buildMatchDayContent optional data", () => {
  it("asks for nothing when no data field is visible (the sweep's call)", async () => {
    const out = await buildMatchDayContent(5, [SENIOR]);
    expect(h.ladder).not.toHaveBeenCalled();
    expect(h.lastMeeting).not.toHaveBeenCalled();
    expect(h.watchLoader).not.toHaveBeenCalled();
    const c = out.get(1)!;
    expect(c).not.toHaveProperty("ladder");
    expect(c).not.toHaveProperty("lastMeeting");
    expect(c).not.toHaveProperty("milestoneWatch");
  });

  it("loads the visible fields, display-ready", async () => {
    const out = await buildMatchDayContent(5, [SENIOR], { fields: ALL });
    expect(out.get(1)).toMatchObject({
      ladder: { club: "3RD", opposition: "5TH", teams: 8, tableName: null },
      lastMeeting: { outcome: "won", line: "Won by 24 runs · 2025/26" },
      milestoneWatch: { line: "J. Smith needs 12 for 1,000 club runs" },
    });
    // The last meeting is bounded by the fixture's own club-time day.
    expect(h.lastMeeting).toHaveBeenCalledWith(expect.anything(), SENIOR, "2026-10-10");
  });

  it("loads only the fields asked for", async () => {
    const out = await buildMatchDayContent(5, [SENIOR], { fields: new Set(["fixture.ladder"]) });
    expect(h.lastMeeting).not.toHaveBeenCalled();
    expect(h.watchLoader).not.toHaveBeenCalled();
    expect(out.get(1)).toHaveProperty("ladder");
    expect(out.get(1)).not.toHaveProperty("lastMeeting");
  });

  it("never reads optional data for a junior fixture", async () => {
    const out = await buildMatchDayContent(5, [JUNIOR], { fields: ALL });
    expect(out.get(2)?.junior).toBe(true);
    expect(h.ladder).not.toHaveBeenCalled();
    expect(h.lastMeeting).not.toHaveBeenCalled();
    expect(h.watchLoader).not.toHaveBeenCalled();
    expect(out.get(2)).not.toHaveProperty("ladder");
  });

  it("hides a field whose data is missing, with no warning", async () => {
    h.ladder.mockResolvedValue(null);
    h.lastMeeting.mockResolvedValue(null);
    h.sides.mockResolvedValue(new Map());
    const onOptionalError = vi.fn();
    const out = await buildMatchDayContent(5, [SENIOR], { fields: ALL, onOptionalError });
    expect(out.get(1)).not.toHaveProperty("ladder");
    expect(out.get(1)).not.toHaveProperty("lastMeeting");
    expect(out.get(1)).not.toHaveProperty("milestoneWatch");
    expect(onOptionalError).not.toHaveBeenCalled();
  });

  it("a failed read hides that field only, warning once per field", async () => {
    h.ladder.mockRejectedValue(new Error("central down"));
    const onOptionalError = vi.fn();
    const out = await buildMatchDayContent(5, [SENIOR, fixture(3, "B Grade")], {
      fields: ALL,
      onOptionalError,
    });
    expect(onOptionalError).toHaveBeenCalledTimes(1);
    expect(onOptionalError).toHaveBeenCalledWith("fixture.ladder", expect.any(Error));
    for (const id of [1, 3]) {
      expect(out.get(id)).not.toHaveProperty("ladder");
      expect(out.get(id)).toHaveProperty("lastMeeting");
    }
    expect(OPTIONAL_FIELD_WARNING["fixture.ladder"]).not.toMatch(/TBC/);
  });

  it("a failed milestone read hides milestone watch and keeps the rest", async () => {
    h.watchLoader.mockRejectedValue(new Error("overlay failed"));
    const onOptionalError = vi.fn();
    const out = await buildMatchDayContent(5, [SENIOR], { fields: ALL, onOptionalError });
    expect(onOptionalError).toHaveBeenCalledWith("fixture.milestoneWatch", expect.any(Error));
    expect(out.get(1)).not.toHaveProperty("milestoneWatch");
    expect(out.get(1)).toHaveProperty("ladder");
  });
});
