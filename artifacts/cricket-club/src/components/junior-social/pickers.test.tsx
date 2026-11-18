/**
 * The junior match picker names a match by PlayHQ's round label, which
 * already says "Round" (retest 5 nit: "Round Round 5").
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@workspace/api-client-react", () => ({
  useListJuniorMatches: () => ({
    data: [
      { id: 1, season: "2026/27", ageGroup: "U13", round: "Round 5", opponentName: "Mandurah" },
      { id: 2, season: "2026/27", ageGroup: "U13", round: "6", opponentName: "Pinjarra" },
      { id: 3, season: "2026/27", ageGroup: "U13", round: "Semi Final", opponentName: "Baldivis" },
      { id: 4, season: "2026/27", ageGroup: "U13", round: null, opponentName: "Falcon" },
    ],
    isLoading: false,
    isError: false,
  }),
  useGetJuniorMatch: () => ({ data: undefined, isLoading: false }),
  getGetJuniorMatchQueryKey: (id: number) => ["junior-match", id],
  useListJuniorSocialMilestones: () => ({ data: [], isLoading: false, isError: false }),
}));

import { FromJuniorMatch } from "./pickers";
import { roundText } from "@/lib/utils";

afterEach(cleanup);

describe("junior match picker round label", () => {
  it("reads 'Round 5', never 'Round Round 5'", () => {
    render(<FromJuniorMatch onOpen={() => {}} />);
    const options = screen.getAllByRole("option").map((o) => o.textContent ?? "");
    expect(options).toContain("U13 • Round 5 — vs Mandurah");
    expect(options).toContain("U13 • Round 6 — vs Pinjarra");
    expect(options).toContain("U13 • Semi Final — vs Baldivis");
    expect(options).toContain("U13 • Match — vs Falcon");
    expect(options.some((o) => /Round Round/i.test(o))).toBe(false);
  });

  it("roundText words a number once and keeps a label that already says Round", () => {
    expect(roundText(5)).toBe("Round 5");
    expect(roundText("5")).toBe("Round 5");
    expect(roundText("Round 5")).toBe("Round 5");
    expect(roundText(" round 12 ")).toBe("round 12");
    expect(roundText("Grand Final")).toBe("Grand Final");
    expect(roundText("")).toBeNull();
    expect(roundText(null)).toBeNull();
  });
});
