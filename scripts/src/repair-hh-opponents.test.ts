/**
 * repair-hh-opponents.test.ts — pure planning logic for the Halls Head
 * opponent repair (plan U5). No database: the planner takes plain rows.
 */
import { describe, expect, it } from "vitest";
import {
  buildReversalRecord,
  learnClubMap,
  opposingSide,
  planRepair,
  planReversal,
  validateArgs,
  type CentralMatch,
  type NativeMatch,
  type RepairUpdate,
} from "./repair-hh-opponents";

const HH = 1;

const central = (over: Partial<CentralMatch> & { matchId: number }): CentralMatch => ({
  playhqMatchId: `guid-${over.matchId}`,
  homeClubId: HH,
  awayClubId: 7,
  homeTeam: "Halls Head A Grade",
  awayTeam: "Mandurah A Grade",
  ...over,
});

const native = (over: Partial<NativeMatch> & { id: number }): NativeMatch => ({
  sourceKey: null,
  opponent: null,
  opponentClubId: null,
  ...over,
});

/** Apply updates to in-memory rows the way the --commit transaction would. */
function apply(
  rows: NativeMatch[],
  updates: readonly { matchId: number; opponent: string | null; opponentClubId: number | null }[],
): NativeMatch[] {
  const byId = new Map(updates.map((u) => [u.matchId, u]));
  return rows.map((r) => {
    const u = byId.get(r.id);
    return u ? { ...r, opponent: u.opponent, opponentClubId: u.opponentClubId } : r;
  });
}

const toApplied = (u: RepairUpdate) => ({
  matchId: u.matchId,
  opponent: u.next.opponent,
  opponentClubId: u.next.opponentClubId,
});

describe("opposingSide", () => {
  it("takes the away side when the club is at home, and vice versa", () => {
    expect(opposingSide(central({ matchId: 1 }), HH)).toEqual({
      centralClubId: 7,
      teamName: "Mandurah A Grade",
    });
    expect(
      opposingSide(
        central({
          matchId: 2,
          homeClubId: 9,
          awayClubId: HH,
          homeTeam: "Pinjarra",
          awayTeam: "Halls Head",
        }),
        HH,
      ),
    ).toEqual({ centralClubId: 9, teamName: "Pinjarra" });
  });

  it("returns null when the club is on neither side or on both", () => {
    expect(opposingSide(central({ matchId: 1, homeClubId: 3, awayClubId: 4 }), HH)).toBeNull();
    expect(opposingSide(central({ matchId: 1, homeClubId: HH, awayClubId: HH }), HH)).toBeNull();
  });
});

describe("learnClubMap", () => {
  it("learns central club -> app club from matches that already have a club, most frequent wins", () => {
    const c = [
      central({ matchId: 1, awayClubId: 7 }),
      central({ matchId: 2, awayClubId: 7 }),
      central({ matchId: 3, awayClubId: 7 }),
      central({ matchId: 4, awayClubId: 8 }),
    ];
    const n = [
      native({ id: 10, sourceKey: "guid-1", opponentClubId: 70 }),
      native({ id: 11, sourceKey: "GUID-2", opponentClubId: 70 }), // case-insensitive join
      native({ id: 12, sourceKey: "guid-3", opponentClubId: 71 }), // stray mis-link outvoted
      native({ id: 13, sourceKey: "guid-4", opponentClubId: 80 }),
      native({ id: 14, sourceKey: "guid-4", opponentClubId: null }), // no vote
    ];
    const map = learnClubMap(n, c, HH);
    expect(map.get(7)).toEqual({ appClubId: 70, votes: 2, total: 3 });
    expect(map.get(8)).toEqual({ appClubId: 80, votes: 1, total: 1 });
  });

  it("breaks a tie deterministically on the lower app club id", () => {
    const c = [central({ matchId: 1 }), central({ matchId: 2 })];
    const n = [
      native({ id: 1, sourceKey: "guid-1", opponentClubId: 75 }),
      native({ id: 2, sourceKey: "guid-2", opponentClubId: 72 }),
    ];
    expect(learnClubMap(n, c, HH).get(7)?.appClubId).toBe(72);
  });
});

describe("planRepair", () => {
  const centralMatches = [
    central({ matchId: 1, awayClubId: 7, awayTeam: "Mandurah A Grade" }),
    central({ matchId: 2, awayClubId: 7, awayTeam: "Mandurah A Grade" }),
    central({ matchId: 3, awayClubId: 9, awayTeam: "Pinjarra B Grade" }),
    central({ matchId: 4, homeClubId: 7, awayClubId: HH, homeTeam: "Mandurah A Grade" }),
  ];
  const centralClubNames = new Map([
    [7, "Mandurah Cricket Club"],
    [9, "Pinjarra Cricket Club"],
  ]);

  it("gives a competition-named match the central opponent's name and the mapped club id", () => {
    const plan = planRepair({
      native: [
        native({ id: 100, sourceKey: "guid-1", opponent: "Mandurah", opponentClubId: 70 }),
        native({ id: 101, sourceKey: "guid-2", opponent: "PCA A Grade One Day" }),
      ],
      central: centralMatches,
      centralClubNames,
      clubId: HH,
    });
    expect(plan.updates).toEqual([
      {
        matchId: 101,
        sourceKey: "guid-2",
        centralMatchId: 2,
        centralClubId: 7,
        previous: { opponent: "PCA A Grade One Day", opponentClubId: null },
        next: { opponent: "Mandurah A Grade", opponentClubId: 70 },
      },
    ]);
    expect(plan.counts.withClub).toBe(1);
    expect(plan.counts.nameOnly).toBe(0);
  });

  it("sets only the name when the central club has no learned mapping, and reports it unresolved", () => {
    const plan = planRepair({
      native: [native({ id: 102, sourceKey: "guid-3", opponent: "B Grade" })],
      central: centralMatches,
      centralClubNames,
      clubId: HH,
    });
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].next).toEqual({ opponent: "Pinjarra B Grade", opponentClubId: null });
    expect(plan.counts.nameOnly).toBe(1);
    expect(plan.unresolvedClubs).toEqual([
      { centralClubId: 9, name: "Pinjarra Cricket Club", matches: 1 },
    ]);
  });

  it("never touches a match that already has an opponent_club_id", () => {
    const plan = planRepair({
      native: [
        native({ id: 100, sourceKey: "guid-1", opponent: "A Grade", opponentClubId: 70 }),
        native({ id: 103, sourceKey: "guid-3", opponent: "Wrong Name", opponentClubId: 55 }),
      ],
      central: centralMatches,
      centralClubNames,
      clubId: HH,
    });
    expect(plan.updates).toEqual([]);
    expect(plan.counts.alreadyLinked).toBe(2);
  });

  it("reports and skips a match with no central counterpart, and an upload with no source key", () => {
    const plan = planRepair({
      native: [
        native({ id: 104, sourceKey: "guid-missing", opponent: "A Grade" }),
        native({ id: 105, sourceKey: null, opponent: "A Grade" }),
      ],
      central: centralMatches,
      centralClubNames,
      clubId: HH,
    });
    expect(plan.updates).toEqual([]);
    expect(plan.skipped).toEqual([
      { matchId: 104, sourceKey: "guid-missing", reason: "no_central_match" },
      { matchId: 105, sourceKey: null, reason: "no_source_key" },
    ]);
  });

  it("skips a central match the club does not play in", () => {
    const plan = planRepair({
      native: [native({ id: 106, sourceKey: "guid-50" })],
      central: [central({ matchId: 50, homeClubId: 3, awayClubId: 4 })],
      centralClubNames,
      clubId: HH,
    });
    expect(plan.skipped).toEqual([
      { matchId: 106, sourceKey: "guid-50", reason: "club_not_in_match" },
    ]);
  });

  it("falls back to the central club name when the team name is blank, and skips when both are blank", () => {
    const plan = planRepair({
      native: [
        native({ id: 107, sourceKey: "guid-60" }),
        native({ id: 108, sourceKey: "guid-61" }),
      ],
      central: [
        central({ matchId: 60, awayClubId: 9, awayTeam: "  " }),
        central({ matchId: 61, awayClubId: 99, awayTeam: null }),
      ],
      centralClubNames,
      clubId: HH,
    });
    expect(plan.updates.map((u) => u.next.opponent)).toEqual(["Pinjarra Cricket Club"]);
    expect(plan.skipped).toEqual([
      { matchId: 108, sourceKey: "guid-61", reason: "no_opponent_name" },
    ]);
  });

  it("counts a match already carrying the right name and no mapping as unchanged", () => {
    const plan = planRepair({
      native: [native({ id: 109, sourceKey: "guid-3", opponent: "Pinjarra B Grade" })],
      central: centralMatches,
      centralClubNames,
      clubId: HH,
    });
    expect(plan.updates).toEqual([]);
    expect(plan.counts.unchanged).toBe(1);
  });

  it("breaks the result down per central club", () => {
    const plan = planRepair({
      native: [
        native({ id: 100, sourceKey: "guid-1", opponentClubId: 70 }),
        native({ id: 101, sourceKey: "guid-2" }),
        native({ id: 110, sourceKey: "guid-4" }),
        native({ id: 102, sourceKey: "guid-3" }),
      ],
      central: centralMatches,
      centralClubNames,
      clubId: HH,
    });
    expect(plan.perClub).toEqual([
      { centralClubId: 7, name: "Mandurah Cricket Club", appClubId: 70, matches: 2 },
      { centralClubId: 9, name: "Pinjarra Cricket Club", appClubId: null, matches: 1 },
    ]);
    expect(plan.counts).toMatchObject({
      native: 4,
      candidates: 3,
      toUpdate: 3,
      withClub: 2,
      nameOnly: 1,
    });
  });
});

describe("reversal", () => {
  const centralMatches = [
    central({ matchId: 1, awayClubId: 7 }),
    central({ matchId: 2, awayClubId: 7 }),
    central({ matchId: 3, awayClubId: 9, awayTeam: "Pinjarra B Grade" }),
  ];
  const before = [
    native({ id: 1, sourceKey: "guid-1", opponent: "Mandurah", opponentClubId: 70 }),
    native({ id: 2, sourceKey: "guid-2", opponent: "PCA A Grade" }),
    native({ id: 3, sourceKey: "guid-3", opponent: null }),
  ];

  it("restores the previous values exactly", () => {
    const plan = planRepair({
      native: before,
      central: centralMatches,
      centralClubNames: new Map(),
      clubId: HH,
    });
    const after = apply(before, plan.updates.map(toApplied));
    expect(after).not.toEqual(before);

    const record = buildReversalRecord(plan, { tenantId: 1, clubId: HH, createdAt: "t" });
    expect(record.rows).toHaveLength(2);
    // Round-trips through JSON (the file on disk).
    const reloaded = JSON.parse(JSON.stringify(record));
    const rev = planReversal(reloaded, after);
    expect(rev.conflicts).toEqual([]);
    expect(apply(after, rev.restores)).toEqual(before);
  });

  it("refuses to overwrite a row that changed after the repair", () => {
    const plan = planRepair({
      native: before,
      central: centralMatches,
      centralClubNames: new Map(),
      clubId: HH,
    });
    const after = apply(before, plan.updates.map(toApplied)).map((r) =>
      r.id === 2 ? { ...r, opponent: "Edited by an admin" } : r,
    );
    const rev = planReversal(
      buildReversalRecord(plan, { tenantId: 1, clubId: HH, createdAt: "t" }),
      after,
    );
    expect(rev.restores.map((r) => r.matchId)).toEqual([3]);
    expect(rev.conflicts).toEqual([{ matchId: 2, reason: "changed_since_repair" }]);
  });

  it("reports a row that no longer exists", () => {
    const plan = planRepair({
      native: before,
      central: centralMatches,
      centralClubNames: new Map(),
      clubId: HH,
    });
    const after = apply(before, plan.updates.map(toApplied)).filter((r) => r.id !== 3);
    const rev = planReversal(
      buildReversalRecord(plan, { tenantId: 1, clubId: HH, createdAt: "t" }),
      after,
    );
    expect(rev.conflicts).toEqual([{ matchId: 3, reason: "missing" }]);
  });
});

describe("validateArgs", () => {
  it("requires --tenant and only accepts Halls Head (tenant 1)", () => {
    expect(validateArgs([])).toMatch(/--tenant/);
    expect(validateArgs(["--tenant=2"])).toMatch(/tenant 1/);
    expect(validateArgs(["--tenant=1"])).toBeNull();
  });

  it("requires --out when committing or reverting, and rejects unknown flags", () => {
    expect(validateArgs(["--tenant=1", "--commit"])).toMatch(/--out/);
    expect(validateArgs(["--tenant=1", "--commit", "--out=/tmp/x"])).toBeNull();
    expect(validateArgs(["--tenant=1", "--revert=/tmp/r.json"])).toBeNull();
    expect(validateArgs(["--tenant=1", "--bogus"])).toMatch(/Unknown flag/);
  });
});
