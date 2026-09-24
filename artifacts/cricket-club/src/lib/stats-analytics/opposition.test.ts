import { describe, expect, it } from "vitest";
import { filterMatches, matchTotals } from "./range";
import { nemesis, normaliseBowler, oppositionTable } from "./opposition";
import { battingSplits, bowlingSplits } from "./splits";
import { bowl, inn, match } from "./test-fixtures";

const MANDURAH = 11;
const PINJARRA = 12;

/** A season mix: two-innings match, not-outs, bowling, and an unresolved opponent. */
function career() {
  return [
    match({
      season: 2023,
      round: 1,
      opponent: "Mandurah",
      opponentClubId: MANDURAH,
      isHome: true,
      battedFirst: true,
      // Two-innings match: out, then not out.
      innings: [
        inn({ runs: 34, battingPos: 3, dismissalType: "caught", dismissedBy: "nguyen" }),
        inn({ runs: 51, battingPos: 3, notOut: true }),
      ],
      ...bowl(2, 31, "10"),
    }),
    match({
      season: 2023,
      round: 2,
      opponent: "Pinjarra",
      opponentClubId: PINJARRA,
      isHome: false,
      battedFirst: false,
      innings: [inn({ runs: 7, battingPos: 1, dismissalType: "bowled", dismissedBy: "lee" })],
      ...bowl(3, 22, "8.2"),
    }),
    match({
      season: 2024,
      round: 1,
      opponent: "Mandurah CC",
      opponentClubId: MANDURAH,
      isHome: false,
      battedFirst: true,
      innings: [inn({ runs: 102, battingPos: 4, dismissalType: "lbw", dismissedBy: "hart" })],
    }),
    match({
      season: 2024,
      round: 2,
      opponent: null,
      opponentClubId: null,
      isHome: null,
      battedFirst: null,
      innings: [inn({ runs: 18, dismissalType: "other" })],
      ...bowl(1, 40, "7"),
    }),
    match({ season: 2025, round: 1, opponent: "Pinjarra", opponentClubId: PINJARRA }),
  ];
}

describe("R5: per-opponent rows sum to the per-match totals", () => {
  it.each([
    ["Career", { from: null, to: null }],
    ["2023 only (two-innings match inside)", { from: 2023, to: 2023 }],
    ["2024–2025", { from: 2024, to: 2025 }],
  ])("%s", (_label, range) => {
    const rows = filterMatches(career(), range);
    const totals = matchTotals(rows);
    const table = oppositionTable(rows);
    const sum = (k: "runs" | "outs" | "innings" | "wickets" | "runsConceded" | "matches") =>
      table.reduce((s, r) => s + r[k], 0);
    expect(sum("runs")).toBe(totals.runs);
    expect(sum("outs")).toBe(totals.outs);
    expect(sum("innings")).toBe(totals.innings);
    expect(sum("wickets")).toBe(totals.wickets);
    expect(sum("runsConceded")).toBe(totals.runsConceded);
    expect(sum("matches")).toBe(totals.matches);
  });

  it("counts both innings of the two-innings match against that opponent", () => {
    const table = oppositionTable(career());
    const mandurah = table.find((r) => r.opponentClubId === MANDURAH)!;
    expect(mandurah.innings).toBe(3);
    expect(mandurah.runs).toBe(34 + 51 + 102);
    expect(mandurah.outs).toBe(2);
    expect(mandurah.notOuts).toBe(1);
    expect(mandurah.average).toBeCloseTo(187 / 2);
    expect(mandurah.highScore).toEqual({ runs: 102, notOut: false });
    // Newest spelling wins for display.
    expect(mandurah.opponent).toBe("Mandurah CC");
  });

  it("keeps unresolved opponents in their own row, last", () => {
    const table = oppositionTable(career());
    expect(table.at(-1)).toMatchObject({ key: "unknown", opponent: "Unknown opponent", runs: 18 });
  });

  it("bowling rows carry figures and economy", () => {
    const pinjarra = oppositionTable(career()).find((r) => r.opponentClubId === PINJARRA)!;
    expect(pinjarra).toMatchObject({ wickets: 3, runsConceded: 22, ballsBowled: 50 });
    expect(pinjarra.bestBowling).toEqual({ wickets: 3, runsConceded: 22 });
    expect(pinjarra.economy).toBeCloseTo((22 / 50) * 6);
  });

  it("split rows plus unassigned sum to the same totals", () => {
    const rows = career();
    const totals = matchTotals(rows);
    const bat = battingSplits(rows);
    if (!bat.ok) throw new Error(bat.reason);
    for (const g of bat.data) {
      expect(g.rows.reduce((s, r) => s + r.innings, 0) + g.unassigned).toBe(totals.innings);
    }
    const situation = bat.data.find((g) => g.key === "situation")!;
    // The unknown-situation innings is unassigned, so assigned runs are the rest.
    expect(situation.rows.reduce((s, r) => s + r.runs, 0)).toBe(totals.runs - 18);

    const bw = bowlingSplits(rows);
    if (!bw.ok) throw new Error(bw.reason);
    for (const g of bw.data) {
      expect(g.rows.reduce((s, r) => s + r.wickets, 0)).toBeLessThanOrEqual(totals.wickets);
      expect(g.rows.reduce((s, r) => s + r.matches, 0) + g.unassigned).toBe(totals.bowlingMatches);
    }
  });
});

describe("nemesis", () => {
  const outBy = (by: string, clubId = MANDURAH, opponent = "Mandurah") =>
    match({
      opponent,
      opponentClubId: clubId,
      innings: [inn({ runs: 10, dismissalType: "bowled", dismissedBy: by })],
    });

  it("normalises initials away", () => {
    expect(normaliseBowler("J Nguyen")).toBe("nguyen");
    expect(normaliseBowler("J. Nguyen")).toBe("nguyen");
    expect(normaliseBowler("nguyen")).toBe("nguyen");
    expect(normaliseBowler("van der merwe")).toBe("van der merwe");
    expect(normaliseBowler("****")).toBeNull();
    expect(normaliseBowler(null)).toBeNull();
  });

  it('groups "b Nguyen" and "b J Nguyen" from the same club', () => {
    const r = nemesis([outBy("nguyen"), outBy("J Nguyen"), outBy("nguyen")]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.top).toMatchObject({ bowler: "Nguyen", dismissals: 3, opponent: "Mandurah" });
  });

  it("keys on the opponent club too (same surname, different club)", () => {
    const r = nemesis([outBy("nguyen"), outBy("nguyen"), outBy("nguyen", PINJARRA, "Pinjarra")]);
    expect(r.ok).toBe(false);
  });

  it("needs at least 3 dismissals", () => {
    const r = nemesis([outBy("nguyen"), outBy("nguyen")]);
    expect(r).toEqual({ ok: false, reason: "No bowler has taken this wicket 3 times" });
  });

  it("breaks ties by fewest innings against that club", () => {
    const vsMandurah = [outBy("nguyen"), outBy("nguyen"), outBy("nguyen")];
    // Pinjarra's bowler also has 3, but over more innings against Pinjarra.
    const vsPinjarra = [
      outBy("lee", PINJARRA, "Pinjarra"),
      outBy("lee", PINJARRA, "Pinjarra"),
      outBy("lee", PINJARRA, "Pinjarra"),
      match({
        opponent: "Pinjarra",
        opponentClubId: PINJARRA,
        innings: [inn({ runs: 60, notOut: true })],
      }),
    ];
    const r = nemesis([...vsPinjarra, ...vsMandurah]);
    if (!r.ok) throw new Error(r.reason);
    expect(r.data.top.bowler).toBe("Nguyen");
    expect(r.data.top.inningsVsOpponent).toBe(3);
    expect(r.data.candidates[1]).toMatchObject({ bowler: "Lee", inningsVsOpponent: 4 });
  });

  it("says not recorded when no dismissal names a bowler", () => {
    const r = nemesis([match({ innings: [inn({ runs: 4, dismissalType: "runOut" })] })]);
    expect(r).toEqual({ ok: false, reason: "Dismissal detail not recorded" });
  });
});
