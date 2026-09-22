import { describe, expect, it } from "vitest";

import { diffFixture, oversToBalls, rowsFromDump, upsertSql, type Dump } from "./playhq-load";

// Shapes below mirror what play.cricket.com.au returned on 22 Sep 2026 (see
// .claude/skills/playcricket-stats-scraper/references/endpoints.md).
const ORG = "4559f1b9-86d8-eb11-a7ad-2818780da0cc";
const PCAI = "c65c0bb8-87d8-eb11-a7ad-2818780da0cc";
const GRADE = "1afe6794-5675-4123-ae59-b7a03e5a03f9";
const SEASON = "a826b403-b813-4318-9805-5bbe4cf7f238";
const MATCH = "36034fa2-724e-40d8-9c40-2a45d0ecb74e";
const INNINGS = "ab3f9756-45d4-4c57-a17e-9c1f22d2aabf";
const HH_TEAM = "7e4a9418-4b7b-4a4a-ac88-687b9f344dfd";
const MCC_TEAM = "11f2fd23-2ab1-4927-a3bc-6dffea033578";
const MANUEL = "e571c273-88b7-46f8-a3e3-ec8fc5013d75";

function dump(): Dump {
  const at = "2026-09-22T05:15:40.000Z";
  return {
    version: "2.0.0",
    exportedAt: "2026-09-22T05:20:00.000Z",
    records: [
      {
        key: "plan:x",
        kind: "plan",
        id: "2026-09-22T05:15:36.365Z",
        meta: { orgId: ORG },
        fetchedAt: at,
        data: { orgId: ORG, seasons: ["Summer 2025/26"] },
      },
      {
        key: `grade:${GRADE}`,
        kind: "grade",
        id: GRADE,
        meta: { gradeId: GRADE, seasonId: SEASON },
        fetchedAt: at,
        data: {
          gradeId: GRADE,
          gradeName: "A Grade Wyllie Cup",
          seasonId: SEASON,
          seasonName: "Summer 2025/26",
          ownerOrgId: PCAI,
          ownerOrgName: "Peel Cricket Association Inc.",
          ownerOrgShort: "PCAI",
          teamIds: [HH_TEAM],
          teamNames: ["A Grade"],
          viaTeams: true,
        },
      },
      {
        key: `matches:${GRADE}`,
        kind: "matches",
        id: GRADE,
        meta: { gradeId: GRADE },
        fetchedAt: at,
        data: {
          matches: [
            {
              id: MATCH,
              status: "COMPLETED",
              statusId: 3,
              matchType: "One Day",
              matchTypeId: 2,
              resultText: "MCC Senior Men A Grade won by 6 wickets",
              round: { id: "r1", name: "Round 2", shortName: "R2" },
              matchSchedule: [{ matchDay: 1, startDateTime: "2025-10-11T12:00:00.0000000+08:00" }],
              venue: {
                name: "Peelwood Reserve",
                suburb: "HALLS HEAD",
                stateName: "WA",
                postCode: "6210",
                playingSurface: { name: "Oval 1 - Turf", latitude: -32.5, longitude: 115.7 },
              },
              teams: [
                {
                  id: HH_TEAM,
                  displayName: "Halls Head A Grade",
                  isHome: true,
                  isWinner: false,
                  scoreText: "189",
                  oversBowled: 43.3,
                  owningOrganisation: {
                    id: ORG,
                    name: "Halls Head Cricket Club",
                    shortName: "HHCC",
                  },
                },
                {
                  id: MCC_TEAM,
                  displayName: "MCC Senior Men A Grade",
                  isHome: false,
                  isWinner: true,
                  scoreText: "4-190",
                  oversBowled: 38,
                  owningOrganisation: {
                    id: "634939ca-87d8-eb11-a7ad-2818780da0cc",
                    name: "Mandurah Cricket Club",
                    shortName: "MCC",
                  },
                },
              ],
            },
          ],
        },
      },
      {
        key: `ladder:${GRADE}`,
        kind: "ladder",
        id: GRADE,
        meta: { gradeId: GRADE },
        fetchedAt: at,
        data: {
          grade: {
            id: GRADE,
            name: "A Grade Wyllie Cup",
            organisation: { id: PCAI, name: "Peel Cricket Association Inc.", shortName: "PCAI" },
          },
          ladders: [
            {
              name: "One Day",
              pools: [
                {
                  teams: [
                    {
                      id: HH_TEAM,
                      displayName: "Halls Head A Grade",
                      rank: 3,
                      includesAdjustments: false,
                      includesUnofficial: false,
                      owningOrganisation: { id: ORG },
                      ladderData: [
                        { id: "played", val: 18 },
                        { id: "competitionPoints", val: 84 },
                        { id: "netRunRate", val: 0.512 },
                        { id: "won", val: 11 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        key: `batting:${GRADE}`,
        kind: "batting",
        id: GRADE,
        meta: { gradeId: GRADE },
        fetchedAt: at,
        data: [
          {
            id: MANUEL,
            name: "Manuel, Jack",
            shortName: "J Manuel",
            organisation: { id: ORG, name: "Halls Head Cricket Club" },
            statistics: { matches: 20, battingAggregate: 790 },
          },
        ],
      },
      {
        key: `fielding:${GRADE}`,
        kind: "fielding",
        id: GRADE,
        meta: { gradeId: GRADE },
        fetchedAt: at,
        data: [
          {
            id: MANUEL,
            name: "Manuel, Jack",
            shortName: "J Manuel",
            organisation: { id: ORG, name: "Halls Head Cricket Club" },
            statistics: { matches: 20, fieldingTotalCatches: 9 },
          },
        ],
      },
      {
        key: `scorecard:${MATCH}`,
        kind: "scorecard",
        id: MATCH,
        meta: { gradeId: GRADE },
        fetchedAt: at,
        data: {
          id: MATCH,
          status: "COMPLETED",
          isBallByBall: true,
          grade: { id: GRADE, name: "A Grade Wyllie Cup" },
          matchSummary: { resultText: "MCC Senior Men A Grade won by 6 wickets", teams: [] },
          teams: [{ id: HH_TEAM, name: "A Grade" }],
          innings: [
            {
              id: INNINGS,
              name: "1st Innings - Halls Head A Grade",
              inningsNumber: 1,
              inningsOrder: 1,
              battingTeamId: HH_TEAM,
              runsScored: 189,
              numberOfWicketsFallen: 10,
              oversBowled: 43.3,
              isDeclared: false,
              inningsCloseType: "All Out",
              totalExtras: 19,
              batting: [
                {
                  participantId: MANUEL,
                  playerShortName: "J Manuel",
                  batInstance: 1,
                  batOrder: 2,
                  runsScored: 72,
                  ballsFaced: 60,
                  foursScored: 3,
                  sixesScored: 5,
                  strikeRate: "120.00",
                  dismissalText: "c: B Brittain",
                  dismissalType: "Caught",
                  dismissalTypeId: 2,
                },
              ],
              bowling: [
                {
                  participantId: "bowler-1",
                  playerShortName: "B Brittain",
                  bowlOrder: 1,
                  oversBowled: 8.4,
                  maidensBowled: 1,
                  runsConceded: 30,
                  wicketsTaken: 2,
                  economy: "3.46",
                  wideBalls: 2,
                  noBalls: 0,
                },
              ],
              fielding: [
                {
                  participantId: "bowler-1",
                  playerShortName: "B Brittain",
                  catches: 1,
                  wicketKeeperCatches: 0,
                  totalCatches: 1,
                  stumpings: 0,
                  runOuts: 0,
                  assistedRunOuts: 0,
                  unassistedRunOuts: 0,
                },
              ],
              fallOfWickets: [
                { order: 1, participantId: MANUEL, playerShortName: "J Manuel", runs: 72 },
              ],
            },
          ],
        },
      },
      {
        key: `balls:${MATCH}`,
        kind: "balls",
        id: MATCH,
        meta: { gradeId: GRADE },
        fetchedAt: at,
        data: {
          teams: [
            { id: HH_TEAM, displayName: "Halls Head A Grade", owningOrganisation: { id: ORG } },
          ],
          innings: [
            {
              id: INNINGS,
              inningsNumber: 1,
              battingTeamId: HH_TEAM,
              balls: [
                {
                  id: "ball-1",
                  overNumber: 0,
                  ballNumber: 1,
                  ballDisplayNumber: 1,
                  strikerParticipantId: MANUEL,
                  bowlerParticipantId: "bowler-1",
                  runsBat: 4,
                  wides: 0,
                  progressRuns: 4,
                  progressWickets: 0,
                  progressScore: "0-4",
                  shortDescription: "4",
                },
                {
                  id: "ball-2",
                  overNumber: 9,
                  ballNumber: 4,
                  ballDisplayNumber: 4,
                  strikerParticipantId: MANUEL,
                  bowlerParticipantId: "bowler-1",
                  runsBat: 0,
                  dismissedParticipantId: MANUEL,
                  dismissalType: "Caught",
                  dismissalTypeId: 2,
                  fielderParticipantId: "bowler-1",
                  progressRuns: 72,
                  progressWickets: 1,
                  progressScore: "1-72",
                  shortDescription: "W",
                  highlight: { highlightUrl: "https://highlights.example/x.m3u8" },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

describe("oversToBalls", () => {
  it("reads cricket notation, not decimals", () => {
    expect(oversToBalls(43.3)).toBe(261);
    expect(oversToBalls("8.4")).toBe(52);
    expect(oversToBalls(7)).toBe(42);
    expect(oversToBalls(null)).toBeNull();
    expect(oversToBalls("abc")).toBeNull();
  });
});

describe("rowsFromDump", () => {
  const rows = rowsFromDump(dump(), "test.json");

  it("collects organisations from every payload that names one", () => {
    const ids = rows.organisations.map((o) => o.id).sort();
    expect(ids).toEqual([ORG, "634939ca-87d8-eb11-a7ad-2818780da0cc", PCAI].sort());
    expect(rows.organisations.find((o) => o.id === PCAI)?.short_name).toBe("PCAI");
  });

  it("builds a grade with its season, owner and junior flag", () => {
    expect(rows.grades).toHaveLength(1);
    expect(rows.grades[0]).toMatchObject({
      id: GRADE,
      season_id: SEASON,
      owner_org_id: PCAI,
      source_org_id: ORG,
      is_junior: false,
    });
    expect(rows.seasons).toEqual([
      { id: SEASON, org_id: ORG, name: "Summer 2025/26", start_date: null, is_current: null },
    ]);
  });

  it("flattens a match into home/away columns with UTC timestamps", () => {
    expect(rows.matches).toHaveLength(1);
    const m = rows.matches[0];
    expect(m).toMatchObject({
      id: MATCH,
      grade_id: GRADE,
      status: "COMPLETED",
      home_team_id: HH_TEAM,
      away_team_id: MCC_TEAM,
      winner_team_id: MCC_TEAM,
      home_score: "189",
      away_score: "4-190",
      surface_name: "Oval 1 - Turf",
      latitude: -32.5,
    });
    expect(m.start_at).toBe("2025-10-11T04:00:00.000Z");
    expect(m.match_days).toBe(1);
  });

  it("pivots ladderData into columns", () => {
    expect(rows.ladders).toHaveLength(1);
    expect(rows.ladders[0]).toMatchObject({
      grade_id: GRADE,
      ladder_name: "One Day",
      team_id: HH_TEAM,
      rank: 3,
      played: 18,
      competition_points: 84,
      net_run_rate: 0.512,
      won: 11,
      lost: null,
    });
  });

  it("unions batting/bowling/fielding reports per participant and derives players", () => {
    expect(rows.player_grade_stats).toHaveLength(1);
    const s = rows.player_grade_stats[0];
    expect(s).toMatchObject({
      grade_id: GRADE,
      participant_id: MANUEL,
      full_name: "Manuel, Jack",
      matches: 20,
    });
    expect(s.batting).toEqual({ matches: 20, battingAggregate: 790 });
    expect(s.fielding).toEqual({ matches: 20, fieldingTotalCatches: 9 });
    expect(s.bowling).toBeNull();
    expect(rows.players).toEqual([
      {
        participant_id: MANUEL,
        full_name: "Manuel, Jack",
        short_name: "J Manuel",
        last_org_id: ORG,
        last_org_name: "Halls Head Cricket Club",
      },
    ]);
  });

  it("normalises a scorecard into innings and line tables", () => {
    expect(rows.scorecards[0]).toMatchObject({
      match_id: MATCH,
      grade_id: GRADE,
      is_ball_by_ball: true,
    });
    expect(rows.match_innings[0]).toMatchObject({
      innings_id: INNINGS,
      match_id: MATCH,
      runs: 189,
      wickets: 10,
      overs_text: "43.3",
      balls_bowled: 261,
      close_type: "All Out",
    });
    expect(rows.match_batting[0]).toMatchObject({
      innings_id: INNINGS,
      participant_id: MANUEL,
      bat_instance: 1,
      runs: 72,
      strike_rate: 120,
      dismissal_type_id: 2,
    });
    expect(rows.match_bowling[0]).toMatchObject({
      innings_id: INNINGS,
      participant_id: "bowler-1",
      overs_text: "8.4",
      balls_bowled: 52,
      economy: 3.46,
    });
    expect(rows.match_fielding[0]).toMatchObject({
      innings_id: INNINGS,
      participant_id: "bowler-1",
      total_catches: 1,
    });
    expect(rows.fall_of_wickets[0]).toEqual({
      innings_id: INNINGS,
      wicket: 1,
      participant_id: MANUEL,
      short_name: "J Manuel",
      runs: 72,
    });
  });

  it("keeps ball order via seq and flags wickets", () => {
    expect(rows.balls).toHaveLength(2);
    expect(rows.balls[0]).toMatchObject({
      ball_id: "ball-1",
      match_id: MATCH,
      innings_id: INNINGS,
      seq: 0,
      is_wicket: false,
      runs_bat: 4,
    });
    expect(rows.balls[1]).toMatchObject({
      ball_id: "ball-2",
      seq: 1,
      is_wicket: true,
      dismissal_type: "Caught",
      dismissed_id: MANUEL,
      fielder_id: "bowler-1",
      highlight_url: "https://highlights.example/x.m3u8",
    });
  });

  it("records the plan as a scrape run", () => {
    expect(rows.runs).toHaveLength(1);
    expect(rows.runs[0]).toMatchObject({
      source_file: "test.json",
      org_id: ORG,
      exported_at: "2026-09-22T05:20:00.000Z",
    });
  });

  it("registers teams from grade discovery, matches, ladders and scorecards", () => {
    const ids = rows.teams.map((t) => t.id).sort();
    expect(ids).toEqual([HH_TEAM, MCC_TEAM].sort());
    expect(rows.teams.find((t) => t.id === HH_TEAM)).toMatchObject({
      grade_id: GRADE,
      name: "A Grade",
      display_name: "Halls Head A Grade",
      org_id: ORG,
    });
  });
});

describe("diffFixture", () => {
  it("reports only fixture-facing fields that changed, normalising Dates", () => {
    const existing = {
      id: MATCH,
      grade_id: GRADE,
      status: "UPCOMING",
      start_at: new Date("2026-10-10T03:45:00.000Z"),
      venue_name: "Stan Twight Reserve",
      raw: { ignored: true },
    };
    const incoming = {
      id: MATCH,
      grade_id: GRADE,
      status: "UPCOMING",
      start_at: "2026-10-10T04:00:00.000Z",
      venue_name: "Stan Twight Reserve",
      raw: { ignored: false },
    };
    expect(diffFixture(existing, incoming)).toEqual([
      {
        match_id: MATCH,
        grade_id: GRADE,
        field: "start_at",
        old_value: "2026-10-10T03:45:00.000Z",
        new_value: "2026-10-10T04:00:00.000Z",
      },
    ]);
    expect(diffFixture(incoming, incoming)).toEqual([]);
  });
});

describe("upsertSql", () => {
  it("casts jsonb columns and updates every non-key column", () => {
    const sql = upsertSql("playhq.matches", ["id", "status", "raw"], ["id"], 2, ["first_seen_at"]);
    expect(sql).toBe(
      "insert into playhq.matches (id,status,raw) values ($1,$2,$3::jsonb),($4,$5,$6::jsonb) on conflict (id) do update set status = excluded.status, raw = excluded.raw",
    );
  });
  it("uses do nothing when only key columns exist, and no conflict clause for append-only tables", () => {
    expect(upsertSql("t", ["a", "b"], ["a", "b"], 1)).toContain("do nothing");
    expect(upsertSql("t", ["a"], [], 1)).toBe("insert into t (a) values ($1) ");
  });
});
