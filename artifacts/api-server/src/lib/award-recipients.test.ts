import { describe, expect, it, vi } from "vitest";
import {
  awardCreditRows,
  patchWinnerLinks,
  withAwardRecipients,
  winnerPlayerIds,
} from "./award-recipients";

vi.mock("./curated-player-space", () => ({
  curatedIdsAreNative: async () => false,
  assertPlayerInTenantSpace: vi.fn(),
}));
vi.mock("./club-overlay", () => ({
  loadClubOverlay: async (tenant: number) => ({
    identity: {
      merges: new Map([["alias", "keeper"]]),
      guidForPlayerId: (id: number) =>
        ({ 1: "keeper", 2: "keeper", 3: "private", 4: "history" })[id as 1],
      intByGuid: new Map([
        ["keeper", tenant === 10 ? 1 : 22],
        ["history", 4],
      ]),
      nameFor: (guid: string, fallback: string | null) =>
        guid === "history" ? "Pre-digital Player" : fallback,
    },
  }),
}));
vi.mock("@workspace/db/central-queries", () => ({
  centralPlayerNames: async () =>
    new Map([
      ["keeper", { displayName: "Canonical Player", isPrivate: false }],
      ["private", { displayName: "Do not disclose", isPrivate: true }],
    ]),
}));

describe("award recipient identity reads", () => {
  const row = { playerId: 2, playerIds: [2, 1, 3, 4, 999], name: "Curated group", season: 2024 };
  it("folds aliases once in recipient order and suppresses private/unmapped public links", async () => {
    const [result] = await withAwardRecipients(10, [row], true);
    expect(result).toMatchObject({
      name: "Curated group",
      playerId: 1,
      playerIds: [1, 4],
      recipients: [
        { playerId: 1, name: "Canonical Player" },
        { playerId: 4, name: "Pre-digital Player" },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("Do not disclose");
    const [other] = await withAwardRecipients(20, [row], true);
    expect(other.recipients[0].playerId).toBe(22);
  });
  it("keeps raw ordered links for the admin without inventing names for private identities", async () => {
    const [result] = await withAwardRecipients(10, [row]);
    expect(result.playerIds).toEqual(row.playerIds);
    expect(result.recipients.map((p) => p.name)).not.toContain("Do not disclose");
  });
  it("credits linked identities, never the combined name as an additional person", async () => {
    const credits = await awardCreditRows(10, [row]);
    expect(credits.map((r) => r.playerId)).toEqual([1, 4]);
    expect(credits.map((r) => r.name)).not.toContain("Curated group");
    expect(await awardCreditRows(10, [{ ...row, playerIds: [], name: "Free text" }])).toEqual([
      expect.objectContaining({ playerId: null, name: "Free text" }),
    ]);
  });
  it("preserves legacy fallbacks and explicit empty lists", () => {
    expect(winnerPlayerIds({ playerId: 1, playerIds: null })).toEqual([1]);
    expect(winnerPlayerIds({ playerId: 1, playerIds: [] })).toEqual([]);
    expect(patchWinnerLinks({}, row)).toBeUndefined();
    expect(patchWinnerLinks({ playerIds: [] }, row)).toEqual([]);
    expect(patchWinnerLinks({ playerId: 1 }, { playerIds: [2, 1], playerId: 2 })).toEqual([1]);
  });
});
