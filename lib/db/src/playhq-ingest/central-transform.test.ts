import { describe, it, expect } from "vitest";
import { tallyFielding } from "../central/scoring";
import {
  ProjectionSkip,
  centralDismissalType,
  centralScore,
  dismissalFielder,
  perthDate,
  scorecardToCentral,
  surnameFirst,
  type PlayhqMatchRow,
} from "./central-transform";

describe("builder formats", () => {
  it("scores read runs/wickets, all out when PlayHQ omits wickets", () => {
    expect(centralScore("10-166")).toBe("166/10");
    expect(centralScore("1-98")).toBe("98/1");
    expect(centralScore("97")).toBe("97/10");
    expect(centralScore("3-120d & 2-40")).toBe("120/3d & 40/2");
    expect(centralScore("")).toBeNull();
    expect(centralScore(null)).toBeNull();
  });

  it("dismissal types use the builder's lowercase vocabulary", () => {
    expect(centralDismissalType("Caught", "c: J Rudge b: B Higton")).toBe("caught");
    expect(centralDismissalType("Caught", "c&b: J Wyllie")).toBe("caught & bowled");
    expect(centralDismissalType("LBW")).toBe("lbw");
    expect(centralDismissalType("Not Out")).toBe("not out");
    expect(centralDismissalType("Run Out")).toBe("run out");
    expect(centralDismissalType("Stumped")).toBe("stumped");
    expect(centralDismissalType("Did Not Bat")).toBe("other");
    expect(centralDismissalType("Retired Hurt")).toBe("other");
  });

  it("fielders come from the dismissal text", () => {
    expect(dismissalFielder("c: J Rudge b: B Higton")).toBe("J Rudge");
    expect(dismissalFielder("c:  b: J Rogers")).toBe("");
    expect(dismissalFielder("c&b: J Wyllie")).toBe("J Wyllie");
    expect(dismissalFielder("st: R Woods b: D Abel")).toBe("R Woods");
    expect(dismissalFielder("run out (T Caine, J Little)")).toBe("T Caine, J Little");
    expect(dismissalFielder("run out ()")).toBeNull();
    expect(dismissalFielder("b: L Doyle")).toBeNull();
    expect(dismissalFielder("not out")).toBeNull();
  });

  it("match dates are Perth calendar dates", () => {
    expect(perthDate("2026-03-21T04:00:00Z")).toBe("2026-03-21");
    expect(perthDate("2026-10-03T23:30:00Z")).toBe("2026-10-04");
    expect(perthDate(null)).toBeNull();
  });

  it("display names are surname first", () => {
    expect(surnameFirst("Jacob Barnes")).toBe("Barnes, Jacob");
    expect(surnameFirst("Mary Jane Smith")).toBe("Smith, Mary Jane");
    expect(surnameFirst("Barnes, Jacob")).toBe("Barnes, Jacob");
    expect(surnameFirst("")).toBeNull();
  });
});

const row = (over: Partial<PlayhqMatchRow> = {}): PlayhqMatchRow => ({
  id: "m1",
  status: "COMPLETED",
  match_type: "One Day",
  round_name: "Round 1",
  start_at: "2026-10-04T02:00:00Z",
  venue_name: "Rec",
  surface_name: "Rec - Oval 1",
  result_text: "B won",
  home_team_id: "tA",
  away_team_id: "tB",
  home_team_name: "Team A",
  away_team_name: "Team B",
  home_org_id: "ORG-A",
  away_org_id: "org-b",
  home_score: "7-205",
  away_score: "10-166",
  grade_id: "g1",
  ...over,
});
const ctx = (orgToClub: Map<string, number>) => ({
  gradeName: "A Grade",
  centralGrade: null,
  seasonName: "Summer 2026/27",
  orgToClub,
});

describe("scorecardToCentral", () => {
  it("puts the lower central club at home and maps orgs case-insensitively", () => {
    const p = scorecardToCentral(
      row(),
      null,
      ctx(
        new Map([
          ["org-a", 17],
          ["org-b", 1],
        ]),
      ),
    );
    expect(p.match).toMatchObject({
      home_club_id: 1,
      home_team: "Team B",
      home_score: "166/10",
      away_club_id: 17,
      away_score: "205/7",
      grade: "A Grade",
      season: "Summer 2026/27",
      comp_type: "One Day",
    });
  });

  it("an unresolved side is away and its lines carry no participant ids", () => {
    const raw = {
      id: "m1",
      teams: [{ id: "tA", players: [{ name: "X Y", shortName: "X Y", participantId: "pA" }] }],
      innings: [
        {
          inningsOrder: 1,
          battingTeamId: "tA",
          batting: [
            {
              participantId: "pA",
              playerShortName: "X Y",
              runsScored: 5,
              dismissalType: "Bowled",
              dismissalText: "b: Q",
            },
          ],
        },
      ],
    };
    const p = scorecardToCentral(row(), raw, ctx(new Map([["org-b", 3]])));
    expect(p.match).toMatchObject({ home_club_id: 3, away_club_id: null, away_team: "Team A" });
    expect(p.batting[0]).toMatchObject({ club_id: null, participant_id: null, player_name: "X Y" });
    expect(p.rosters[0]).toMatchObject({ club_id: null, participant_id: null });
    expect(p.players).toEqual([]);
  });

  it("refuses a match where neither club is known", () => {
    expect(() => scorecardToCentral(row(), null, ctx(new Map()))).toThrow(ProjectionSkip);
  });

  it("a match with no scorecard is a result row with no lines; multi-day comp type is null", () => {
    const p = scorecardToCentral(
      row({ status: "ABANDONED", match_type: "Two Day" }),
      null,
      ctx(new Map([["org-a", 1]])),
    );
    expect(p.match).toMatchObject({ status: "ABANDONED", comp_type: null });
    expect(p.batting).toEqual([]);
    expect(p.fielding).toEqual([]);
  });

  it("expands PlayHQ fielding counts into one row per dismissal", () => {
    const raw = {
      id: "m1",
      innings: [
        {
          inningsOrder: 1,
          battingTeamId: "tB",
          fielding: [
            {
              participantId: "p1",
              playerShortName: "K Keeper",
              totalCatches: 2,
              stumpings: 1,
              runOuts: 0,
            },
            {
              participantId: "p2",
              playerShortName: "F Field",
              catches: 1,
              wicketKeeperCatches: 0,
              runOuts: 1,
            },
          ],
        },
      ],
    };
    const p = scorecardToCentral(
      row(),
      raw,
      ctx(
        new Map([
          ["org-a", 1],
          ["org-b", 2],
        ]),
      ),
    );
    expect(p.fielding.map((f) => [f.club_id, f.participant_id, f.kind])).toEqual([
      [1, "p1", "catch"],
      [1, "p1", "catch"],
      [1, "p1", "stumping"],
      [1, "p2", "catch"],
      [1, "p2", "run out"],
    ]);
  });
  it("R6 (PlayHQ scorecard catches): the reads count exactly the catches PlayHQ credits", () => {
    // Ash chose PlayHQ scorecard catches on 4 Oct 2026 (hybrid stats plan U15). A keeper's
    // catches are catches; stumpings and run-outs never are.
    const raw = {
      id: "m1",
      innings: [
        {
          inningsOrder: 1,
          battingTeamId: "tB",
          fielding: [
            { participantId: "wk", catches: 1, wicketKeeperCatches: 2, stumpings: 1 },
            { participantId: "f", totalCatches: 3, runOuts: 1 },
          ],
        },
      ],
    };
    const p = scorecardToCentral(
      row(),
      raw,
      ctx(
        new Map([
          ["org-a", 1],
          ["org-b", 2],
        ]),
      ),
    );
    const tally = tallyFielding(
      p.fielding.map((f) => ({ participantId: f.participant_id, kind: f.kind })),
    );
    expect(Object.fromEntries(tally)).toEqual({
      wk: { catches: 3, stumpings: 1, runOuts: 0 },
      f: { catches: 3, stumpings: 0, runOuts: 1 },
    });
  });
});
