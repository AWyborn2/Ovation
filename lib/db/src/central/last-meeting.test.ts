/**
 * last-meeting.test.ts — the Match Day "last meeting" read (ADR-010 P5) and
 * the ladder table pick. The rules live in pure functions, tested directly:
 * both orientations, grade family by app grade (a T20 label folds in, a junior
 * label never counts), finished matches only, `before` exclusive, lineage
 * families, unreadable dates hide the field, and the club's side of the result.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../central", async () => ({
  ...(await vi.importActual("../central-schema")),
  ...(await vi.importActual("../playhq-schema")),
  centralDb: {},
}));

import {
  centralMatchDay,
  lineageFamilies,
  pickLastMeeting,
  resultMargin,
  type LastMeetingCandidate,
} from "./last-meeting";
import { pickFixtureLadderTable, type PlayhqLadderTeam } from "./playhq-fixtures";

const CLUB = 1;
const OPP = 2;

function match(o: Partial<LastMeetingCandidate> & { matchId: number }): LastMeetingCandidate {
  return {
    grade: "A Grade",
    season: "2025/26",
    round: "Round 4",
    matchDate: "2026-01-10",
    status: "COMPLETED",
    homeClubId: CLUB,
    awayClubId: OPP,
    winnerClubId: CLUB,
    resultText: "Halls Head won by 24 runs",
    ...o,
  };
}

const opts = {
  clubFamily: [CLUB],
  opponentFamily: [OPP],
  appGrade: "A Grade",
  before: "2026-10-10",
};

describe("pickLastMeeting", () => {
  it("takes the latest finished meeting, either side at home, from the club's side", () => {
    const got = pickLastMeeting(
      [
        match({ matchId: 10, matchDate: "2025-11-01" }),
        match({
          matchId: 11,
          matchDate: "2026-02-14",
          homeClubId: OPP,
          awayClubId: CLUB,
          winnerClubId: OPP,
          resultText: "Mandurah won by 3 wickets",
        }),
      ],
      opts,
    );
    expect(got).toMatchObject({
      matchId: 11,
      date: "2026-02-14",
      outcome: "lost",
      margin: "3 wickets",
      season: "2025/26",
    });
  });

  it("compares grades by app grade: a T20 or cup label folds in, another grade does not", () => {
    const got = pickLastMeeting(
      [
        match({ matchId: 1, grade: "T20: A Grade", matchDate: "2026-03-01" }),
        match({ matchId: 2, grade: "B Grade", matchDate: "2026-04-01" }),
      ],
      opts,
    );
    expect(got?.matchId).toBe(1);
  });

  it("never counts a junior meeting", () => {
    expect(
      pickLastMeeting([match({ matchId: 1, grade: "Under 15 Boys" })], {
        ...opts,
        appGrade: "A Grade",
      }),
    ).toBeNull();
  });

  it("skips in-progress, abandoned, cancelled and forfeited matches", () => {
    const got = pickLastMeeting(
      [
        match({ matchId: 1, matchDate: "2025-12-01" }),
        match({ matchId: 2, matchDate: "2026-01-01", status: "IN_PROGRESS" }),
        match({ matchId: 3, matchDate: "2026-01-08", status: "ABANDONED" }),
        match({ matchId: 4, matchDate: "2026-01-15", status: "Cancelled" }),
        match({ matchId: 5, matchDate: "2026-01-22", status: "FORFEIT" }),
      ],
      opts,
    );
    expect(got?.matchId).toBe(1);
  });

  it("treats `before` as exclusive, so match day's own game is never its last meeting", () => {
    const got = pickLastMeeting(
      [
        match({ matchId: 1, matchDate: "2026-02-01" }),
        match({ matchId: 2, matchDate: "2026-10-10" }),
      ],
      opts,
    );
    expect(got?.matchId).toBe(1);
  });

  it("hides when a candidate's date can't be read (it might be the latest)", () => {
    expect(
      pickLastMeeting([match({ matchId: 1 }), match({ matchId: 2, matchDate: "sometime" })], opts),
    ).toBeNull();
    // A missing date is no meeting to weigh.
    expect(
      pickLastMeeting([match({ matchId: 1 }), match({ matchId: 2, matchDate: null })], opts),
    ).not.toBeNull();
  });

  it("tells a tie from no result when there is no winner", () => {
    const tie = pickLastMeeting(
      [match({ matchId: 1, winnerClubId: null, resultText: "Match tied" })],
      opts,
    );
    const none = pickLastMeeting(
      [match({ matchId: 1, winnerClubId: null, resultText: "No result" })],
      opts,
    );
    expect(tie).toMatchObject({ outcome: "tied", margin: null });
    expect(none).toMatchObject({ outcome: "noResult", margin: null });
  });

  it("counts a meeting under a lineage id, and ignores other clubs' matches", () => {
    const got = pickLastMeeting(
      [
        match({
          matchId: 1,
          homeClubId: 9,
          awayClubId: OPP,
          winnerClubId: 9,
          matchDate: "2026-03-01",
        }),
        match({ matchId: 2, homeClubId: 3, awayClubId: OPP, matchDate: "2026-04-01" }),
      ],
      { ...opts, clubFamily: [CLUB, 9] },
    );
    expect(got).toMatchObject({ matchId: 1, outcome: "won" });
  });

  it("returns null when the two sides are one family", () => {
    expect(
      pickLastMeeting([match({ matchId: 1 })], { ...opts, opponentFamily: [CLUB] }),
    ).toBeNull();
  });
});

describe("lineageFamilies", () => {
  it("joins clubs through parent links in either direction", () => {
    const familyOf = lineageFamilies([
      { clubId: 1, parentClubId: null },
      { clubId: 9, parentClubId: 1 },
      { clubId: 12, parentClubId: 9 },
      { clubId: 2, parentClubId: null },
    ]);
    expect(familyOf(12)).toEqual([1, 9, 12]);
    expect(familyOf(1)).toEqual([1, 9, 12]);
    expect(familyOf(2)).toEqual([2]);
    expect(familyOf(77)).toEqual([77]);
  });

  it("survives a parent cycle", () => {
    const familyOf = lineageFamilies([
      { clubId: 1, parentClubId: 2 },
      { clubId: 2, parentClubId: 1 },
    ]);
    expect(familyOf(1)).toEqual([1, 2]);
  });
});

describe("centralMatchDay and resultMargin", () => {
  it("reads ISO, named-month and day-first dates", () => {
    expect(centralMatchDay("2026-01-05")).toBe("2026-01-05");
    expect(centralMatchDay("2026-01-05T00:00:00Z")).toBe("2026-01-05");
    expect(centralMatchDay("5 Jan 2026")).toBe("2026-01-05");
    expect(centralMatchDay("05/01/2026")).toBe("2026-01-05");
    expect(centralMatchDay("31/02/2026")).toBeNull();
    expect(centralMatchDay("")).toBeNull();
  });

  it("takes the margin from the result text", () => {
    expect(resultMargin("Halls Head won by 24 runs")).toBe("24 runs");
    expect(resultMargin("Mandurah won by 3 wickets.")).toBe("3 wickets");
    expect(resultMargin("Match drawn")).toBeNull();
  });
});

describe("pickFixtureLadderTable", () => {
  const team = (teamId: string, rank: number): PlayhqLadderTeam =>
    ({ teamId, teamName: teamId, orgId: null, isClub: false, rank }) as PlayhqLadderTeam;

  it("picks the one table holding both teams", () => {
    const tables = [
      { name: "One Day", teams: [team("club", 1), team("x", 2)] },
      { name: "Two Day", teams: [team("club", 3), team("opp", 4)] },
    ];
    expect(pickFixtureLadderTable(tables, "club", "opp")?.name).toBe("Two Day");
  });

  it("falls back to the only table holding the club's team", () => {
    const tables = [{ name: "Ladder", teams: [team("CLUB", 1), team("x", 2)] }];
    expect(pickFixtureLadderTable(tables, "club", "opp")?.name).toBe("Ladder");
  });

  it("returns null when the choice is ambiguous or the club isn't on any table", () => {
    const both = [
      { name: "One Day", teams: [team("club", 1), team("opp", 2)] },
      { name: "Two Day", teams: [team("club", 3), team("opp", 4)] },
    ];
    expect(pickFixtureLadderTable(both, "club", "opp")).toBeNull();
    expect(
      pickFixtureLadderTable(
        [
          { name: "A", teams: [team("club", 1)] },
          { name: "B", teams: [team("club", 2)] },
        ],
        "club",
        null,
      ),
    ).toBeNull();
    expect(
      pickFixtureLadderTable([{ name: "A", teams: [team("x", 1)] }], "club", "opp"),
    ).toBeNull();
  });
});
