import { describe, it, expect } from "vitest";
import { shapePlayerShirtNumbers, type PlayerShirtNumberRow } from "./player-shirt-numbers";

/**
 * Shaping register rows into the player profile's shirt-number fields
 * (plan U9; R14, R15, R16; AE2, AE3; KTD13). No database.
 */

const row = (season: number, number: string | null, playerId: number | null = 7) =>
  ({ season, number, playerId }) satisfies PlayerShirtNumberRow;

describe("shapePlayerShirtNumbers", () => {
  it("AE3: current season number plus history newest-first", () => {
    const out = shapePlayerShirtNumbers([row(2025, "12"), row(2026, "4")], {
      currentSeason: 2026,
      preferredPlayerId: 7,
    });
    expect(out).toEqual({
      shirtNumber: "4",
      shirtNumbers: [
        { season: 2026, number: "4" },
        { season: 2025, number: "12" },
      ],
    });
  });

  it("AE2: held (unlinked) entries never appear", () => {
    const out = shapePlayerShirtNumbers([row(2026, "23", null)], {
      currentSeason: 2026,
      preferredPlayerId: 7,
    });
    expect(out).toEqual({ shirtNumber: null, shirtNumbers: [] });
  });

  it("R15: a season with no number is left out and never fills the current slot", () => {
    const out = shapePlayerShirtNumbers([row(2026, null), row(2025, "9"), row(2024, "")], {
      currentSeason: 2026,
      preferredPlayerId: 7,
    });
    expect(out).toEqual({ shirtNumber: null, shirtNumbers: [{ season: 2025, number: "9" }] });
  });

  it("keeps leading zeros and has no current number when only past seasons exist", () => {
    const out = shapePlayerShirtNumbers([row(2023, "07")], {
      currentSeason: 2026,
      preferredPlayerId: 7,
    });
    expect(out).toEqual({ shirtNumber: null, shirtNumbers: [{ season: 2023, number: "07" }] });
  });

  it("one entry per season, preferring the presented player's own row in a merge group", () => {
    const out = shapePlayerShirtNumbers([row(2026, "3", 8), row(2026, "5", 7), row(2025, "1", 8)], {
      currentSeason: 2026,
      preferredPlayerId: 7,
    });
    expect(out).toEqual({
      shirtNumber: "5",
      shirtNumbers: [
        { season: 2026, number: "5" },
        { season: 2025, number: "1" },
      ],
    });
  });
});
