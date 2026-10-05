import { describe, expect, it } from "vitest";
import { foldGradeDebuts } from "./grade-debuts";

describe("foldGradeDebuts", () => {
  const matches = [
    { matchId: 10, grade: "A Grade", season: "Summer 2025/26", matchDate: "2025-10-11" },
    { matchId: 11, grade: "A Grade", season: "Summer 2025/26", matchDate: "2025-10-04" },
    { matchId: 12, grade: "B Grade", season: "Summer 2025/26", matchDate: "2025-09-27" },
  ];

  it("gives each player's earliest A Grade match, its batting spot, and their A Grade games", () => {
    const out = foldGradeDebuts({
      matches,
      grades: ["A Grade"],
      lines: [
        { participantId: "g1", matchId: 10, batOrder: 3 },
        { participantId: "g1", matchId: 11, batOrder: 5 },
        { participantId: "g1", matchId: 11, batOrder: null }, // a bowling line, same match
        { participantId: "g1", matchId: 12, batOrder: 1 }, // B Grade: not an A Grade debut
        { participantId: "g2", matchId: 10, batOrder: null }, // roster only
        { participantId: null, matchId: 10, batOrder: 1 },
      ],
    });
    expect(out).toEqual([
      expect.objectContaining({
        participantId: "g1",
        grade: "A Grade",
        matchId: 11,
        matchDate: "2025-10-04",
        season: 2025,
        batOrder: 5,
        games: 2,
      }),
      expect.objectContaining({ participantId: "g2", matchId: 10, batOrder: null, games: 1 }),
    ]);
  });
});
