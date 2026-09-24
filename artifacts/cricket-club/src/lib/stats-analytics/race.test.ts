import { describe, expect, it } from "vitest";
import { careerRace, raceSeries } from "./race";
import { CAREER } from "./range";
import { bowl, inn, match, season } from "./test-fixtures";

// A: 2 pre-scorecard games / 40 runs, then 4 scorecard games of 20 runs (6 games).
const aMatches = [1, 2, 3, 4].map((r) =>
  match({ season: 2024, round: r, innings: [inn({ runs: 20 })] }),
);
const aSeasons = [season({ season: null, games: 2, runs: 40 }), season({ season: 2024, games: 4 })];
// B: 10 scorecard games of 15 runs, no baseline.
const bMatches = Array.from({ length: 10 }, (_, i) =>
  match({ season: 2023 + Math.floor(i / 5), round: (i % 5) + 1, innings: [inn({ runs: 15 })] }),
);

describe("career race", () => {
  it("cumulates by games played, starting from the baseline totals", () => {
    const s = raceSeries("a", aMatches, aSeasons, "bat", CAREER);
    expect(s.start).toEqual({ games: 2, value: 40 });
    expect(s.points.map((p) => [p.games, p.value])).toEqual([
      [2, 40],
      [3, 60],
      [4, 80],
      [5, 100],
      [6, 120],
    ]);
    expect(s.final).toEqual({ games: 6, value: 120 });
  });

  it("a bounded range cumulates from zero without the baseline", () => {
    const s = raceSeries("a", aMatches, aSeasons, "bat", { from: 2024, to: 2024 });
    expect(s.start).toEqual({ games: 0, value: 0 });
    expect(s.final).toEqual({ games: 4, value: 80 });
  });

  it("counts both innings of a two-innings match in one game", () => {
    const s = raceSeries(
      "x",
      [match({ innings: [inn({ runs: 10 }), inn({ runs: 25 })] })],
      [],
      "bat",
      CAREER,
    );
    expect(s.points.at(-1)).toMatchObject({ games: 1, value: 35 });
  });

  it('"ahead after N" uses the shortest career', () => {
    const r = careerRace(
      [
        { key: "a", matches: aMatches, seasons: aSeasons },
        { key: "b", matches: bMatches, seasons: [] },
      ],
      "bat",
      CAREER,
    );
    if (!r.ok) throw new Error(r.reason);
    // B finishes higher (150) but after 6 games A leads 120–90.
    expect(r.data.aheadAfter).toEqual({ games: 6, values: [120, 90], leader: 0 });
  });

  it("reports no leader on a tie, and races wickets in bowling mode", () => {
    const x = [match(bowl(2, 20)), match(bowl(1, 20)), match(bowl(3, 20))];
    const y = [match(bowl(3, 20)), match(bowl(3, 20)), match(bowl(0, 20))];
    const r = careerRace(
      [
        { key: "x", matches: x, seasons: [] },
        { key: "y", matches: y, seasons: [] },
      ],
      "bowl",
      CAREER,
    );
    if (!r.ok) throw new Error(r.reason);
    expect(r.data.aheadAfter).toEqual({ games: 3, values: [6, 6], leader: null });
  });

  it("is insufficient in bowling mode for non-bowlers", () => {
    const r = careerRace([{ key: "a", matches: aMatches, seasons: [] }], "bowl", CAREER);
    expect(r).toEqual({ ok: false, reason: "No bowling recorded in this range" });
  });
});
