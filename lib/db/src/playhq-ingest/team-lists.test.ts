import { describe, expect, it } from "vitest";
import { lineupEntries, lineupToTeamList, sameTeamList } from "./team-lists";

const A = "AAAAAAAA-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";

describe("lineupEntries", () => {
  it("reads PlayHQ's named side in order, with captain and keeper from roles", () => {
    const e = lineupEntries([
      { participantId: A, name: "Cam Skipper", shortName: "C Skipper", roles: ["Captain"] },
      { participantId: B, name: "", shortName: "W Gloves", roles: ["Wicket Keeper"] },
      { participantId: C, name: "Vic Deputy", roles: ["Vice Captain"] },
    ]);
    expect(e).toEqual([
      {
        participantId: A,
        name: "Cam Skipper",
        position: 1,
        isCaptain: true,
        isWicketKeeper: false,
      },
      { participantId: B, name: "W Gloves", position: 2, isCaptain: false, isWicketKeeper: true },
      {
        participantId: C,
        name: "Vic Deputy",
        position: 3,
        isCaptain: false,
        isWicketKeeper: false,
      },
    ]);
    expect(lineupEntries(null)).toEqual([]);
  });
});

describe("lineupToTeamList", () => {
  it("links known players, keeps unknown names, drops duplicates and never links a fill-in", () => {
    const list = lineupToTeamList(
      [
        {
          participantId: A,
          name: "Cam Skipper",
          position: 1,
          isCaptain: true,
          isWicketKeeper: true,
        },
        { participantId: B, name: "Fill In", position: 2, isCaptain: false, isWicketKeeper: false },
        {
          participantId: A.toLowerCase(),
          name: "Cam Again",
          position: 3,
          isCaptain: false,
          isWicketKeeper: false,
        },
        {
          participantId: C,
          name: "New Face",
          position: 4,
          isCaptain: false,
          isWicketKeeper: false,
        },
      ],
      new Map([
        [A.toLowerCase(), 12],
        [B, 90004],
      ]),
    );
    expect(list).toEqual([
      { order: 1, playerId: 12, displayName: "Cam Skipper", role: "C/WK" },
      { order: 2, displayName: "Fill In" },
      { order: 3, displayName: "New Face" },
    ]);
    expect(sameTeamList(list, [...list])).toBe(true);
    expect(sameTeamList(list, list.slice(1))).toBe(false);
  });
});
