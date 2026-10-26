import { describe, it, expect } from "vitest";
import { partnershipsOfInnings, type InningsBatter } from "./partnerships";

const card = (...ids: string[]): InningsBatter[] =>
  ids.map((participantId, i) => ({ participantId, batOrder: i + 1 }));

describe("partnershipsOfInnings (kiosk redesign C4)", () => {
  it("pairs the batters at the crease for each wicket", () => {
    // 1 and 2 open; 1 out at 40 (3 in), 3 out at 52 (4 in), 2 out at 190.
    const rows = partnershipsOfInnings(card("a", "b", "c", "d"), [
      { wicket: 1, runs: 40, participantId: "a" },
      { wicket: 2, runs: 52, participantId: "c" },
      { wicket: 3, runs: 190, participantId: "b" },
    ]);
    expect(rows).toEqual([
      { wicket: 1, runs: 40, batters: ["a", "b"] },
      { wicket: 2, runs: 12, batters: ["b", "c"] },
      { wicket: 3, runs: 138, batters: ["b", "d"] },
    ]);
  });

  it("orders the wickets and lists the pair in batting order", () => {
    const rows = partnershipsOfInnings(
      [
        { participantId: "b", batOrder: 2 },
        { participantId: "a", batOrder: 1 },
        { participantId: "c", batOrder: 3 },
      ],
      [
        { wicket: 2, runs: 30, participantId: "c" },
        { wicket: 1, runs: 10, participantId: "b" },
      ],
    );
    expect(rows).toEqual([
      { wicket: 1, runs: 10, batters: ["a", "b"] },
      { wicket: 2, runs: 20, batters: ["a", "c"] },
    ]);
  });

  it("stops where the card can't explain a wicket", () => {
    // Wicket 2's batter was never at the crease: keep wicket 1 only.
    expect(
      partnershipsOfInnings(card("a", "b", "c"), [
        { wicket: 1, runs: 10, participantId: "a" },
        { wicket: 2, runs: 30, participantId: "z" },
        { wicket: 3, runs: 50, participantId: "b" },
      ]),
    ).toEqual([{ wicket: 1, runs: 10, batters: ["a", "b"] }]);
    // A gap in the wicket numbers stops the walk.
    expect(
      partnershipsOfInnings(card("a", "b", "c"), [{ wicket: 2, runs: 30, participantId: "a" }]),
    ).toEqual([]);
    // Totals that go backwards are bad data.
    expect(
      partnershipsOfInnings(card("a", "b", "c"), [
        { wicket: 1, runs: 30, participantId: "a" },
        { wicket: 2, runs: 20, participantId: "c" },
      ]),
    ).toEqual([{ wicket: 1, runs: 30, batters: ["a", "b"] }]);
  });

  it("needs two batters", () => {
    expect(partnershipsOfInnings(card("a"), [{ wicket: 1, runs: 5, participantId: "a" }])).toEqual(
      [],
    );
  });
});
