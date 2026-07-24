import { describe, expect, it } from "vitest";
import { CARD_KINDS } from "@/lib/share-card";
import { renderPackCard, type PackTokens } from "@/lib/pack-render";
import {
  initialCardState,
  buildCardInput,
  JUNIOR_CAPABLE,
  ROW_CAPS,
} from "./logic";
import {
  ladderRowsToState,
  teamListPlayersToState,
  clubSeasonTotalsToState,
  weekendWrapToState,
  fixtureToMatchDayState,
} from "./prefill";
import type {
  LadderCardRow,
  ClubSeasonGradeLeaders,
  WeekendWrap,
  TeamListPlayer as TeamListPlayerDto,
  Fixture,
} from "@workspace/api-client-react";

const TOKENS: PackTokens = {
  accent: "#FBAC27",
  panel: "#42342B",
  ink: "#101216",
  textLight: "#F5F2E8",
  displayFont: "anton",
};

const SIZES = ["square", "portrait", "story"] as const;
const hasUnresolved = (html: string) => /\{\{/.test(html);

describe("card-forms: every kind builds a renderable input", () => {
  for (const kind of CARD_KINDS) {
    it(`${kind}: initial state → valid input, renders every size with no unresolved fields`, () => {
      const state = initialCardState(kind);
      const input = buildCardInput(kind, state, false);
      expect(input.kind).toBe(kind);
      for (const size of SIZES) {
        const html = renderPackCard(input, size, true, TOKENS, false);
        expect(html.length).toBeGreaterThan(0);
        expect(hasUnresolved(html)).toBe(false);
      }
    });
  }
});

describe("card-forms: editing a field flows into the built input + preview", () => {
  it("century runs/name edits reach the input and the rendered card", () => {
    const state = {
      ...initialCardState("century"),
      runs: 150,
      playerName: "Edited Name",
    };
    const input = buildCardInput("century", state, false) as Extract<
      ReturnType<typeof buildCardInput>,
      { kind: "century" }
    >;
    expect(input.runs).toBe(150);
    expect(input.playerName).toBe("Edited Name");
    const html = renderPackCard(input, "square", true, TOKENS, false);
    expect(html).toContain("Edited Name");
  });

  it("a prefilled ladder field stays editable after prefill", () => {
    const patch = ladderRowsToState("A Grade", [
      { pos: 1, team: "Halls Head", played: 8, won: 7, lost: 1, points: 42, isClub: true },
    ]);
    // Simulate the admin editing the prefilled team name.
    const edited = {
      ...patch,
      rows: (patch.rows ?? []).map((r) => ({ ...r, team: "Renamed" })),
    };
    expect(edited.rows[0].team).toBe("Renamed");
    const input = buildCardInput("ladder", { ...initialCardState("ladder"), ...edited }, false);
    const html = renderPackCard(input, "square", true, TOKENS, false);
    expect(html).toContain("Renamed");
  });
});

describe("card-forms: junior forces junior:true only for capable kinds", () => {
  it("teamList (junior-capable) gets junior:true", () => {
    const input = buildCardInput("teamList", initialCardState("teamList"), true) as {
      junior?: boolean;
    };
    expect(input.junior).toBe(true);
    expect(JUNIOR_CAPABLE.has("teamList")).toBe(true);
  });

  it("century (not junior-capable) never carries a junior flag", () => {
    const input = buildCardInput("century", initialCardState("century"), true) as {
      junior?: boolean;
    };
    expect(input.junior).toBeUndefined();
    expect(JUNIOR_CAPABLE.has("century")).toBe(false);
  });
});

describe("card-forms: repeat-row editors respect template row caps", () => {
  it("ladder caps at 7 rows", () => {
    const rows: LadderCardRow[] = Array.from({ length: 12 }, (_, i) => ({
      pos: i + 1,
      team: `Team ${i + 1}`,
      played: 8,
      won: 4,
      lost: 4,
      points: 24,
      isClub: false,
    }));
    const state = { ...initialCardState("ladder"), rows };
    const input = buildCardInput("ladder", state, false) as { rows: unknown[] };
    expect(input.rows).toHaveLength(7);
    expect(ROW_CAPS.ladder?.cap).toBe(7);
  });

  it("teamList caps at 12 players", () => {
    const players = Array.from({ length: 15 }, (_, i) => ({
      order: i + 1,
      surname: `PLAYER${i + 1}`,
    }));
    const state = { ...initialCardState("teamList"), players };
    const input = buildCardInput("teamList", state, false) as { players: unknown[] };
    expect(input.players).toHaveLength(12);
    expect(ROW_CAPS.teamList?.cap).toBe(12);
  });

  it("clubLeaderboard caps at 4 leaders", () => {
    const leaders = Array.from({ length: 6 }, (_, i) => ({
      gradeLabel: `G${i + 1}`,
      playerName: `P${i + 1}`,
      value: String(i),
    }));
    const state = { ...initialCardState("clubLeaderboard"), leaders };
    const input = buildCardInput("clubLeaderboard", state, false) as { leaders: unknown[] };
    expect(input.leaders).toHaveLength(4);
    expect(ROW_CAPS.clubLeaderboard?.cap).toBe(4);
  });

  it("weekendWrap caps at 4 matches", () => {
    const matches = Array.from({ length: 6 }, (_, i) => ({
      gradeLabel: `G${i + 1}`,
      resultLine: "won",
      performers: "",
      outcome: "won" as const,
    }));
    const state = { ...initialCardState("weekendWrap"), matches };
    const input = buildCardInput("weekendWrap", state, false) as { matches: unknown[] };
    expect(input.matches).toHaveLength(4);
    expect(ROW_CAPS.weekendWrap?.cap).toBe(4);
  });
});

describe("card-forms: prefill mappers", () => {
  it("clubSeasonTotalsToState picks the category leader per grade", () => {
    const grades: ClubSeasonGradeLeaders[] = [
      {
        gradeLabel: "A Grade",
        topRunScorer: { playerName: "Jack Manuel", value: 428 },
        topWicketTaker: { playerName: "Tom Burrage", value: 24 },
      },
      { gradeLabel: "B Grade", topRunScorer: null, topWicketTaker: null },
    ];
    const runs = clubSeasonTotalsToState(2024, "Runs", grades);
    expect(runs.category).toBe("Runs");
    expect(runs.season).toBe("2024/25");
    expect(runs.leaders?.[0]).toMatchObject({ gradeLabel: "A GRADE", playerName: "Jack Manuel", value: "428" });
    const wickets = clubSeasonTotalsToState(2024, "Wickets", grades);
    expect(wickets.leaders?.[0]).toMatchObject({ playerName: "Tom Burrage", value: "24" });
    // Empty grade renders as a blank-but-present row (still editable).
    expect(wickets.leaders?.[1]).toMatchObject({ gradeLabel: "B GRADE", playerName: "", value: "" });
  });

  it("teamListPlayersToState excludes fill-in ids (>= 90000)", () => {
    const dto: TeamListPlayerDto[] = [
      { order: 1, displayName: "Jack Manuel", playerId: 12 },
      { order: 2, displayName: "Sam Rudge", playerId: 90001 },
      { order: 3, displayName: "Free Text", role: "C" },
    ];
    const patch = teamListPlayersToState(dto);
    // The fill-in id (90001, "Sam Rudge") is dropped; surnames use the bundle's upper-case style.
    expect(patch.players).toHaveLength(2);
    expect(patch.players?.map((p) => p.surname)).toEqual(["MANUEL", "TEXT"]);
    expect(patch.players?.[1].role).toBe("C");
  });

  it("weekendWrapToState maps the outcome enum to the card union", () => {
    const wrap: WeekendWrap = {
      roundLabel: "ROUND 8 WRAP",
      dateRange: "13–14 DEC",
      matches: [
        { gradeLabel: "A", resultLine: "won", performers: "", outcome: "WON" },
        { gradeLabel: "B", resultLine: "lost", performers: "", outcome: "LOST" },
        { gradeLabel: "C", resultLine: "drew", performers: "", outcome: "" },
      ],
    };
    const patch = weekendWrapToState(wrap);
    expect(patch.roundLabel).toBe("ROUND 8 WRAP");
    expect(patch.matches?.map((m) => m.outcome)).toEqual(["won", "lost", "draw"]);
  });

  it("fixtureToMatchDayState derives home/away and opposition", () => {
    const fixture: Fixture = {
      id: 1,
      grade: "A Grade",
      roundLabel: "ROUND 8",
      opponentName: "Baldivis",
      opponentLogoUrl: "https://logo",
      venue: "Sample Oval",
      startAt: "2024-12-14T04:00:00.000Z",
      isHome: true,
      source: "manual",
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const patch = fixtureToMatchDayState(fixture);
    expect(patch.oppositionName).toBe("Baldivis");
    expect(patch.homeAway).toBe("HOME");
    expect(patch.roundLabel).toBe("ROUND 8");
    expect(patch.oppositionLogoUrl).toBe("https://logo");
  });
});
