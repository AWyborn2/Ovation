import { beforeEach, describe, it, expect, vi } from "vitest";

const { lineRows, playerRows } = vi.hoisted(() => ({
  lineRows: [] as unknown[][], playerRows: [] as unknown[][],
}));
vi.mock("../central", async () => {
  const schema = await vi.importActual("../central-schema");
  const builder = (queue: unknown[][]) => ({
    from() { return this; },
    innerJoin() { return this; },
    where: async () => queue.shift() ?? [],
  });
  return { ...schema, centralDb: {
    selectDistinct: () => builder(lineRows),
    select: () => builder(playerRows),
  } };
});
import { centralCurrentSeasonSquad } from "./squad-link";

beforeEach(() => { lineRows.length = 0; playerRows.length = 0; });

describe("current-season club squad source", () => {
  it("filters past seasons, excludes unmapped grades, deduplicates lines and preserves junior privacy", async () => {
    lineRows.push([
      { participantId: "senior", name: "A Example", season: "Summer 2026/27", grade: "A Grade" },
      { participantId: "old", name: "Old Player", season: "2025/26", grade: "A Grade" },
      { participantId: "junior", name: "J Junior", season: "2026/27", grade: "Under 14" },
      { participantId: "unknown", name: "Other", season: "2026/27", grade: "Charity match" },
    ], [{ participantId: "senior", name: "A Example", season: "2026/27", grade: "A Grade" }], []);
    playerRows.push([
      { participantId: "senior", displayName: "Alex Example", isPrivate: 0 },
      { participantId: "junior", displayName: "Jamie Junior", isPrivate: 1 },
    ]);
    expect(await centralCurrentSeasonSquad(42, 2026)).toEqual([
      { participantId: "senior", name: "Alex Example", section: "senior", gradeHint: "A Grade", isPrivate: false },
      { participantId: "junior", name: "Jamie Junior", section: "junior", gradeHint: "Under 14", isPrivate: true },
    ]);
  });

  it("returns no active players when the current season has no appearances", async () => {
    lineRows.push([], [], []);
    expect(await centralCurrentSeasonSquad(42, 2026)).toEqual([]);
  });
});
