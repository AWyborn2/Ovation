import { describe, expect, it } from "vitest";

import {
  assignMatch,
  assignMax,
  buildCentralAppearances,
  classifyPlayer,
  comparePlayer,
  detectConflicts,
  linkMatches,
  nameCompatibility,
  toCsv,
  validateArgs,
  zeroTotals,
  type CentralAppearance,
  type CentralBattingRow,
  type CentralBowlingRow,
  type LineAssignment,
  type NativeLine,
  type NativePlayer,
} from "./hh-central-crosswalk-core";

const line = (over: Partial<NativeLine> & { playerId: number }): NativeLine => ({
  matchId: 1,
  batted: false,
  battingPos: null,
  runs: null,
  balls: null,
  notOut: false,
  bowled: false,
  overs: null,
  maidens: null,
  runsConceded: null,
  wickets: null,
  catches: 0,
  stumpings: 0,
  runOuts: 0,
  ...over,
});

const bat = (
  pid: string | null,
  batOrder: number,
  runs: number | null,
  extra: Partial<CentralBattingRow> = {},
): CentralBattingRow => ({
  matchId: 100,
  innings: 1,
  batOrder,
  participantId: pid,
  playerName: null,
  runs,
  balls: null,
  dismissal: "b Somebody",
  dismissalType: "bowled",
  ...extra,
});

const bowl = (pid: string, overs: number, wickets: number, runs: number): CentralBowlingRow => ({
  matchId: 100,
  innings: 2,
  participantId: pid,
  playerName: null,
  overs,
  maidens: 0,
  runs,
  wickets,
});

function appsFor(
  batting: CentralBattingRow[],
  bowling: CentralBowlingRow[] = [],
): CentralAppearance[] {
  const idx = buildCentralAppearances({ batting, bowling, rosters: [], fielding: [] });
  return [...(idx.byMatch.get(100)?.values() ?? [])];
}

const players = new Map<number, NativePlayer>([
  [1, { id: 1, givenName: "John", surname: "Smith" }],
  [2, { id: 2, givenName: "Mark", surname: "Smith" }],
  [3, { id: 3, givenName: "Pete", surname: "Jones" }],
  [90001, { id: 90001, givenName: "Fill", surname: "In" }],
]);

describe("assignMatch — scorecard evidence, one-to-one", () => {
  it("links an exact batting line (position + runs) as strong", () => {
    const apps = appsFor([bat("G-A", 3, 42), bat("G-B", 4, 7)]);
    const out = assignMatch(
      1,
      100,
      [line({ playerId: 3, batted: true, battingPos: 3, runs: 42 })],
      apps,
      players,
      new Map([
        ["G-A", "X Other"],
        ["G-B", "P Jones"],
      ]),
    );
    // The name points at G-B, but the figures point at G-A — figures win.
    expect(out).toHaveLength(1);
    expect(out[0]?.participantId).toBe("G-A");
    expect(out[0]?.strength).toBe("strong");
  });

  it("links a bowling-only player from exact bowling figures", () => {
    const apps = appsFor([], [bowl("G-A", 8, 3, 25), bowl("G-B", 6.3, 1, 40)]);
    const out = assignMatch(
      1,
      100,
      [line({ playerId: 3, bowled: true, overs: "6.3", wickets: 1, runsConceded: 40 })],
      apps,
      players,
      new Map(),
    );
    expect(out[0]?.participantId).toBe("G-B");
    expect(out[0]?.strength).toBe("strong");
  });

  it("separates two players with the same surname in one match by figures", () => {
    const apps = appsFor([bat("G-J", 1, 55), bat("G-M", 6, 12)]);
    const names = new Map([
      ["G-J", "J Smith"],
      ["G-M", "M Smith"],
    ]);
    const out = assignMatch(
      1,
      100,
      [
        // Deliberately cross the initials against the figures: the figures decide.
        line({ playerId: 1, batted: true, battingPos: 6, runs: 12 }),
        line({ playerId: 2, batted: true, battingPos: 1, runs: 55 }),
      ],
      apps,
      players,
      names,
    );
    const byPlayer = new Map(out.map((a) => [a.nativePlayerId, a.participantId]));
    expect(byPlayer.get(1)).toBe("G-M");
    expect(byPlayer.get(2)).toBe("G-J");
    // One-to-one: two distinct participants.
    expect(new Set(out.map((a) => a.participantId)).size).toBe(2);
  });

  it("uses the name only to break a tie between equal figure evidence", () => {
    // Both did not bat at unrecorded positions — only presence on the card.
    const idx = buildCentralAppearances({
      batting: [],
      bowling: [],
      rosters: [
        { matchId: 100, participantId: "G-J", playerName: "J Smith" },
        { matchId: 100, participantId: "G-M", playerName: "M Smith" },
      ],
      fielding: [],
    });
    const apps = [...(idx.byMatch.get(100)?.values() ?? [])];
    const out = assignMatch(
      1,
      100,
      [line({ playerId: 2 }), line({ playerId: 1 })],
      apps,
      players,
      new Map(),
    );
    const byPlayer = new Map(out.map((a) => [a.nativePlayerId, a]));
    expect(byPlayer.get(1)?.participantId).toBe("G-J");
    expect(byPlayer.get(2)?.participantId).toBe("G-M");
    expect(byPlayer.get(1)?.strength).toBe("weak");
  });

  it("never links on a name alone (contradicting figures)", () => {
    const apps = appsFor([bat("G-J", 5, 80)]);
    const out = assignMatch(
      1,
      100,
      // John Smith batted 2 for 10 natively; central J Smith batted 5 for 80 and
      // did not bowl while the native line bowled.
      [
        line({
          playerId: 1,
          batted: true,
          battingPos: 2,
          runs: 10,
          bowled: true,
          overs: "4",
          wickets: 0,
          runsConceded: 20,
        }),
      ],
      apps,
      players,
      new Map([["G-J", "J Smith"]]),
    );
    expect(out).toHaveLength(0);
  });

  it("excludes fill-ins (player_id >= 90000) from the link", () => {
    const apps = appsFor([bat("G-A", 3, 42)]);
    const out = assignMatch(
      1,
      100,
      [line({ playerId: 90001, batted: true, battingPos: 3, runs: 42 })],
      apps,
      players,
      new Map(),
    );
    expect(out).toHaveLength(0);
  });

  it("skips NULL-participant central rows (cannot be attributed)", () => {
    const idx = buildCentralAppearances({
      batting: [bat(null, 3, 42)],
      bowling: [],
      rosters: [],
      fielding: [],
    });
    expect(idx.byMatch.get(100)).toBeUndefined();
    expect(idx.nullParticipantRows).toBe(1);
  });

  it("collapses a two-innings central match to summed runs, first-innings position", () => {
    const apps = appsFor([bat("G-A", 4, 30, { innings: 1 }), bat("G-A", 2, 12, { innings: 3 })]);
    expect(apps[0]?.runs).toBe(42);
    expect(apps[0]?.batOrder).toBe(4);
    expect(apps[0]?.innings).toBe(2);
  });
});

describe("linkMatches — juniors isolation", () => {
  it("links by source_key = playhq_match_id and flags junior central grades", () => {
    const links = linkMatches(
      [
        { id: 1, sourceKey: "AAA", season: 2020, grade: "A Grade", abandoned: false },
        { id: 2, sourceKey: "bbb", season: 2020, grade: "Colts", abandoned: false },
        { id: 3, sourceKey: "CCC", season: 2020, grade: "B Grade", abandoned: false },
        { id: 4, sourceKey: null, season: 2020, grade: "B Grade", abandoned: false },
      ],
      [
        { matchId: 10, playhqMatchId: "aaa", season: "Summer 2020/21", grade: "A Grade" },
        {
          matchId: 11,
          playhqMatchId: "BBB",
          season: "Summer 2020/21",
          grade: "Under 15 Division 1",
        },
      ],
    );
    expect(links.get(1)).toMatchObject({ centralMatchId: 10, senior: true });
    expect(links.get(2)).toMatchObject({ centralMatchId: 11, senior: false });
    expect(links.get(3)).toMatchObject({ centralMatchId: null, senior: true });
    expect(links.get(4)).toMatchObject({ centralMatchId: null });
  });
});

const assignment = (
  nativePlayerId: number,
  participantId: string,
  strength: LineAssignment["strength"] = "strong",
  nativeMatchId = 1,
): LineAssignment => ({
  nativeMatchId,
  centralMatchId: nativeMatchId + 100,
  nativePlayerId,
  participantId,
  figure: 6,
  name: 3,
  strength,
  reasons: [],
});

describe("classifyPlayer / detectConflicts", () => {
  it("classifies a consistent player as CLEAN", () => {
    const a = Array.from({ length: 20 }, (_, i) => assignment(1, "G-A", "strong", i));
    const link = classifyPlayer(1, a, 20, 0);
    expect(link.status).toBe("CLEAN");
    expect(link.participantId).toBe("G-A");
    expect(link.share).toBe(1);
  });

  it("accepts a single line only with strong evidence", () => {
    expect(classifyPlayer(1, [assignment(1, "G-A", "strong")], 1, 0).status).toBe("CLEAN");
    expect(classifyPlayer(1, [assignment(1, "G-A", "medium")], 1, 0).status).toBe("AMBIGUOUS");
  });

  it("flags a native player who maps to two participants as AMBIGUOUS + a split conflict", () => {
    const a = [
      ...Array.from({ length: 6 }, (_, i) => assignment(1, "G-A", "strong", i)),
      ...Array.from({ length: 4 }, (_, i) => assignment(1, "G-B", "strong", 10 + i)),
    ];
    const link = classifyPlayer(1, a, 10, 0);
    expect(link.status).toBe("AMBIGUOUS");
    expect(link.participantId).toBe("G-A");
    const conflicts = detectConflicts([link]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      type: "NATIVE_MULTI_PARTICIPANT",
      nativePlayerId: 1,
      severe: true,
    });
  });

  it("flags one participant claimed by two native players", () => {
    const l1 = classifyPlayer(
      1,
      [assignment(1, "G-A", "strong", 1), assignment(1, "G-A", "strong", 2)],
      2,
      0,
    );
    const l2 = classifyPlayer(
      2,
      [assignment(2, "G-A", "strong", 3), assignment(2, "G-A", "strong", 4)],
      2,
      0,
    );
    const conflicts = detectConflicts([l1, l2]);
    expect(conflicts).toEqual([
      expect.objectContaining({
        type: "PARTICIPANT_MULTI_NATIVE",
        participantId: "G-A",
        severe: true,
      }),
    ]);
  });

  it("reports fill-ins, no-line and unmatched players distinctly", () => {
    expect(classifyPlayer(90001, [], 3, 0).status).toBe("EXCLUDED_FILL_IN");
    expect(classifyPlayer(5, [], 0, 0).status).toBe("NO_LINES");
    expect(classifyPlayer(5, [], 4, 0).status).toBe("UNMATCHED");
  });

  it("does not call weak-only evidence CLEAN", () => {
    const a = Array.from({ length: 5 }, (_, i) => assignment(1, "G-A", "weak", i));
    expect(classifyPlayer(1, a, 5, 0).status).toBe("AMBIGUOUS");
  });
});

describe("assignMax", () => {
  it("finds the optimal (not greedy) assignment", () => {
    // Greedy would take (0,0)=10 then (1,1)=1 → 11; optimal is 9 + 8 = 17.
    expect(
      assignMax([
        [10, 9],
        [8, 1],
      ]),
    ).toEqual([1, 0]);
  });
  it("leaves rows unassigned when every weight is non-positive", () => {
    expect(
      assignMax([
        [0, 0],
        [5, 0],
      ]),
    ).toEqual([-1, 0]);
  });
  it("handles more rows than columns", () => {
    const out = assignMax([[3], [5], [1]]);
    expect(out.filter((j) => j === 0)).toHaveLength(1);
    expect(out[1]).toBe(0);
  });
});

describe("comparePlayer", () => {
  const app = (over: Partial<CentralAppearance>): CentralAppearance => ({
    participantId: "G-A",
    lineName: null,
    hasBattingRow: true,
    batted: true,
    batOrder: 1,
    runs: 0,
    balls: null,
    innings: 1,
    notOuts: 0,
    bowled: false,
    bowlBalls: null,
    maidens: 0,
    runsConceded: 0,
    wickets: 0,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
    onRoster: false,
    countsAsGame: true,
    ...over,
  });

  it("is EQUAL when app career == central", () => {
    const res = comparePlayer({
      nativeLines: [line({ playerId: 1, matchId: 1, batted: true, runs: 20 })],
      abandoned: new Set(),
      linkByNativeMatch: new Map([[1, 101]]),
      centralByMatch: new Map([[101, app({ runs: 20 })]]),
      nativeMatchByCentral: new Map([[101, 1]]),
      pgssSeasonal: { matches: 1, innings: 1, runs: 20, wickets: 0, catches: 0 },
      baseline: zeroTotals(),
    });
    expect(res.classes).toEqual(["EQUAL"]);
  });

  it("explains a baseline-only difference as BASELINE", () => {
    const res = comparePlayer({
      nativeLines: [line({ playerId: 1, matchId: 1, batted: true, runs: 20 })],
      abandoned: new Set(),
      linkByNativeMatch: new Map([[1, 101]]),
      centralByMatch: new Map([[101, app({ runs: 20 })]]),
      nativeMatchByCentral: new Map([[101, 1]]),
      pgssSeasonal: { matches: 1, innings: 1, runs: 20, wickets: 0, catches: 0 },
      baseline: { matches: 30, innings: 28, runs: 600, wickets: 4, catches: 9 },
    });
    expect(res.classes).toEqual(["BASELINE"]);
    expect(res.appCareer.runs).toBe(620);
  });

  it("counts central-only and native-only matches as MISSING_MATCHES", () => {
    const res = comparePlayer({
      nativeLines: [
        line({ playerId: 1, matchId: 1, batted: true, runs: 20 }),
        line({ playerId: 1, matchId: 2, batted: true, runs: 5 }), // not in central
      ],
      abandoned: new Set(),
      linkByNativeMatch: new Map([[1, 101]]),
      centralByMatch: new Map([
        [101, app({ runs: 20 })],
        [102, app({ runs: 33 })], // central-only match
      ]),
      nativeMatchByCentral: new Map([[101, 1]]),
      pgssSeasonal: { matches: 2, innings: 2, runs: 25, wickets: 0, catches: 0 },
      baseline: zeroTotals(),
    });
    expect(res.classes).toEqual(["MISSING_MATCHES"]);
    expect(res.coverage).toMatchObject({
      both: 1,
      nativeMatchNotInCentral: 1,
      centralMatchNotInNative: 1,
    });
  });

  it("flags same matches with different figures as FIGURES_DIFFER", () => {
    const res = comparePlayer({
      nativeLines: [line({ playerId: 1, matchId: 1, batted: true, runs: 20 })],
      abandoned: new Set(),
      linkByNativeMatch: new Map([[1, 101]]),
      centralByMatch: new Map([[101, app({ runs: 24 })]]),
      nativeMatchByCentral: new Map([[101, 1]]),
      pgssSeasonal: { matches: 1, innings: 1, runs: 20, wickets: 0, catches: 0 },
      baseline: zeroTotals(),
    });
    expect(res.classes).toEqual(["FIGURES_DIFFER"]);
  });

  it("keeps abandoned native matches out of native totals", () => {
    const res = comparePlayer({
      nativeLines: [line({ playerId: 1, matchId: 1, batted: true, runs: 20 })],
      abandoned: new Set([1]),
      linkByNativeMatch: new Map([[1, 101]]),
      centralByMatch: new Map([[101, app({ runs: 20 })]]),
      nativeMatchByCentral: new Map([[101, 1]]),
      pgssSeasonal: zeroTotals(),
      baseline: zeroTotals(),
    });
    expect(res.nativeScorecard.matches).toBe(0);
    expect(res.coverage.centralOnlyNativeAbandoned).toBe(1);
  });
});

describe("helpers", () => {
  it("nameCompatibility: surname then initial, never initial alone", () => {
    expect(nameCompatibility({ givenName: "John", surname: "Smith" }, "J Smith")).toBe(3);
    expect(nameCompatibility({ givenName: "John", surname: "Smith" }, "M Smith")).toBe(2);
    expect(nameCompatibility({ givenName: "John", surname: "Smith" }, "J Jones")).toBe(0);
    expect(nameCompatibility({ givenName: "Sean", surname: "O'Brien" }, "S O'Brien")).toBe(3);
  });

  it("toCsv escapes commas, quotes and newlines", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"']])).toBe('a,b\n"x,y","say ""hi"""\n');
  });

  it("validateArgs refuses anything that implies a write", () => {
    expect(validateArgs([])).toBeNull();
    expect(validateArgs(["--out=/tmp/x"])).toBeNull();
    for (const bad of [
      "--write",
      "--apply",
      "--commit",
      "--backfill",
      "--yes",
      "--fix",
      "--save-map",
    ]) {
      expect(validateArgs([bad])).toMatch(/READ-ONLY/);
    }
    expect(validateArgs(["--tenant=2"])).toMatch(/Unknown flag/);
    expect(validateArgs(["stray"])).toMatch(/positional/);
  });
});
