import { describe, it, expect, vi } from "vitest";
import { seedCurrentSeasonSquad } from "./squad-seed";

function executor(existing: unknown[] = [], mappings: unknown[] = []) {
  const queue = [mappings, existing];
  const values = vi.fn(async (_row: unknown) => []);
  return {
    select: () => ({ from: () => ({ where: async () => queue.shift() ?? [] }) }),
    insert: () => ({ values }),
    values,
  };
}

const senior = {
  participantId: "p1", name: "Alex Example", section: "senior" as const,
  gradeHint: "A Grade", isPrivate: false,
};

describe("provisioning current-season active roster", () => {
  it("seeds senior and junior players, linking seniors without inventing contacts or profile IDs", async () => {
    const tx = executor([], [{ participantId: "p1", playerId: 120 }]);
    await expect(seedCurrentSeasonSquad(tx as never, 77, [
      senior, { ...senior, participantId: "j1", name: "Jamie Junior", section: "junior", isPrivate: true },
    ])).resolves.toBe(2);
    expect(tx.values).toHaveBeenNthCalledWith(1, expect.objectContaining({
      tenantId: 77, firstName: "Alex", lastName: "Example", linkedPlayerId: 120, active: true,
    }));
    expect(tx.values).toHaveBeenNthCalledWith(2, expect.objectContaining({
      section: "junior", linkedPlayerId: null, isPrivate: true, active: true,
    }));
    expect(tx.values.mock.calls[0][0]).not.toHaveProperty("playhqProfileId");
    expect(tx.values.mock.calls[0][0]).not.toHaveProperty("accountHolderMobile");
  });

  it("reruns preserve staff-deactivated members, linked identities and unlinked junior names", async () => {
    const tx = executor([
      { linkedPlayerId: 120, firstName: "A", lastName: "Example", active: false, activeSetByAdmin: true },
      { linkedPlayerId: null, firstName: "Jamie", lastName: "Junior", active: false },
    ], [{ participantId: "p1", playerId: 120 }]);
    expect(await seedCurrentSeasonSquad(tx as never, 77, [
      senior, { ...senior, participantId: "j1", name: "Jamie Junior", section: "junior" },
    ])).toBe(0);
    expect(tx.values).not.toHaveBeenCalled();
  });

  it("an empty current season never activates historical players", async () => {
    const tx = executor([], [{ participantId: "old", playerId: 120 }]);
    expect(await seedCurrentSeasonSquad(tx as never, 77, [])).toBe(0);
    expect(tx.values).not.toHaveBeenCalled();
  });

  it("does not collapse two distinct mapped players who share a full name", async () => {
    const tx = executor([], [
      { participantId: "p1", playerId: 120 }, { participantId: "p2", playerId: 121 },
    ]);
    expect(await seedCurrentSeasonSquad(tx as never, 77, [senior, { ...senior, participantId: "p2" }])).toBe(2);
    expect(tx.values).toHaveBeenCalledTimes(2);
  });
});
