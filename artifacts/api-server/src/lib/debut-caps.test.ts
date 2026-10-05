import { describe, expect, it } from "vitest";
import { isoDate, MAX_DEBUT_CAPS_PER_RUN, planDebutCaps, type DebutCandidate } from "./debut-caps";

const debut = (
  playerId: number,
  debutDate: string | null,
  over: Partial<DebutCandidate> = {},
): DebutCandidate => ({
  playerId,
  name: `Player ${playerId}`,
  debutDate,
  matchId: 1,
  batOrder: null,
  games: 3,
  ...over,
});

// Halls Head's register stops at #240 (Jett Demmery, 2024/25); the 2025/26
// debutants came in through the bulk match load, which never minted caps.
const caps = [
  { playerId: 116, capNumber: 236 },
  { playerId: 121, capNumber: 240 },
];

describe("planDebutCaps", () => {
  it("numbers new debutants in debut order: date, match, batting position", () => {
    const plan = planDebutCaps({
      category: "male",
      caps,
      debuts: [
        debut(116, "2023-10-14"),
        debut(121, "2024-11-02"),
        debut(264, "2025-10-11", { matchId: 7, batOrder: 6 }),
        debut(224, "2025-10-11", { matchId: 7, batOrder: 2 }),
        debut(280, "2025-12-06", { matchId: 9 }),
        debut(133, "2025-10-04", { matchId: 5 }),
      ],
      since: null,
    });
    expect(plan.held).toBeNull();
    expect(plan.frontier).toBe("2024-11-02");
    expect(plan.toMint.map((c) => [c.capNumber, c.playerId])).toEqual([
      [241, 133],
      [242, 224],
      [243, 264],
      [244, 280],
    ]);
  });

  it("never numbers an uncapped player whose debut predates the register's newest cap", () => {
    const plan = planDebutCaps({
      category: "male",
      caps,
      debuts: [
        debut(121, "2024-11-02"),
        debut(55, "2020-12-05"),
        debut(9012, "2004-11-06"),
        debut(90001, "2025-10-04"),
      ],
      since: null,
    });
    expect(plan.toMint).toEqual([]);
    // In debut order; fill-ins (ids >= 90000) are neither minted nor reported.
    expect(plan.olderUncapped.map((d) => d.playerId)).toEqual([9012, 55]);
  });

  it("scheduled runs mint only recent debuts; older new ones wait for the catch-up", () => {
    const plan = planDebutCaps({
      category: "male",
      caps,
      debuts: [debut(121, "2024-11-02"), debut(264, "2025-10-11"), debut(500, "2026-10-04")],
      since: "2026-09-14",
    });
    expect(plan.toMint.map((c) => [c.capNumber, c.playerId])).toEqual([[241, 500]]);
    expect(plan.awaitingCatchUp.map((d) => d.playerId)).toEqual([264]);
  });

  it("does nothing for a club without a register, or one not linked to players", () => {
    const none = planDebutCaps({
      category: "female",
      caps: [],
      debuts: [debut(1, "2025-10-04")],
      since: null,
    });
    expect(none.held).toMatch(/no cap register/);
    expect(none.toMint).toEqual([]);
    const unlinked = planDebutCaps({
      category: "male",
      caps: [{ playerId: null, capNumber: 12 }],
      debuts: [debut(1, "2025-10-04")],
      since: null,
    });
    expect(unlinked.held).toMatch(/isn't linked/);
    expect(unlinked.toMint).toEqual([]);
  });

  it("holds more than a team's worth of debutants for review", () => {
    const many = Array.from({ length: MAX_DEBUT_CAPS_PER_RUN + 1 }, (_, i) =>
      debut(300 + i, "2025-10-04", { matchId: 5, batOrder: i + 1 }),
    );
    const plan = planDebutCaps({
      category: "male",
      caps,
      debuts: [debut(121, "2024-11-02"), ...many],
      since: null,
    });
    expect(plan.held).toMatch(/more than a team's worth/);
    expect(plan.toMint).toEqual([]);
    expect(plan.awaitingCatchUp).toHaveLength(MAX_DEBUT_CAPS_PER_RUN + 1);
  });

  it("a debutant in the same match as the newest cap is still new", () => {
    const plan = planDebutCaps({
      category: "male",
      caps,
      debuts: [debut(121, "2024-11-02"), debut(436, "2024-11-02", { matchId: 1, batOrder: 9 })],
      since: null,
    });
    expect(plan.toMint.map((c) => c.playerId)).toEqual([436]);
  });
});

describe("isoDate", () => {
  it("reads both stored date shapes", () => {
    expect(isoDate("2025-10-04")).toBe("2025-10-04");
    expect(isoDate("2025-10-04T00:00:00Z")).toBe("2025-10-04");
    expect(isoDate("4/10/2025")).toBe("2025-10-04");
    expect(isoDate("Sat 4 Oct")).toBeNull();
    expect(isoDate(null)).toBeNull();
  });
});
