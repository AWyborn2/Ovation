import { describe, expect, it } from "vitest";
import {
  MINT_ID_CEILING,
  PinnedPlayerIdError,
  isSyntheticParticipantKey,
  mintPinnedSyntheticPlayers,
} from "./player-id-mint";
import { playerIdMapTable } from "./schema/player_id_map";
import { playerCurationTable } from "./schema/player_curation";

/**
 * Pinned synthetic players (hybrid stats plan U12, KTD3): Halls Head's
 * baseline-only native players get a `club:<uuid>` crosswalk entry pinned to
 * their EXISTING native id, so curated links keep resolving after cut-over.
 * The executor is faked: selects resolve by table, inserts are recorded.
 */
function fakeExecutor(state: { map?: { participantId: string; playerId: number }[] }) {
  const mapInserts: { tenantId: number; participantId: string; playerId: number }[] = [];
  const curationInserts: {
    tenantId: number;
    participantId: string;
    overrideDisplayName: string;
  }[] = [];
  let locked = 0;
  const executor = {
    execute: async () => {
      locked += 1;
      return { rows: [] };
    },
    select() {
      let table: unknown;
      const builder = {
        from(t: unknown) {
          table = t;
          return builder;
        },
        where() {
          return builder;
        },
        then(onFulfilled: (v: unknown[]) => unknown, onRejected?: (e: unknown) => unknown) {
          return Promise.resolve()
            .then(() => {
              if (table === playerIdMapTable) return state.map ?? [];
              throw new Error("pinned mint may only read the crosswalk");
            })
            .then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
    insert(table: unknown) {
      return {
        values: async (rows: never[]) => {
          if (table === playerIdMapTable) mapInserts.push(...rows);
          else if (table === playerCurationTable) curationInserts.push(...rows);
          else throw new Error("unexpected insert");
        },
      };
    },
  };
  return {
    executor: executor as never,
    mapInserts,
    curationInserts,
    locks: () => locked,
  };
}

describe("mintPinnedSyntheticPlayers", () => {
  it("writes a club:<uuid> crosswalk row at exactly the pinned id, plus its display name", async () => {
    const f = fakeExecutor({ map: [{ participantId: "guid-a", playerId: 40 }] });
    const out = await mintPinnedSyntheticPlayers(f.executor, 1, [
      { playerId: 17, displayName: "Bill Old" },
      { playerId: 23, displayName: "Tom Early" },
    ]);
    expect(out.map((p) => p.playerId)).toEqual([17, 23]);
    expect(f.mapInserts.map((r) => [r.tenantId, r.playerId])).toEqual([
      [1, 17],
      [1, 23],
    ]);
    expect(f.mapInserts.every((r) => isSyntheticParticipantKey(r.participantId))).toBe(true);
    expect(new Set(f.mapInserts.map((r) => r.participantId)).size).toBe(2);
    expect(f.curationInserts).toEqual([
      { tenantId: 1, participantId: out[0]!.participantId, overrideDisplayName: "Bill Old" },
      { tenantId: 1, participantId: out[1]!.participantId, overrideDisplayName: "Tom Early" },
    ]);
    expect(f.locks()).toBe(1);
  });

  it("never pins an id in the fill-in / cap-only range (>= 90000), writing nothing", async () => {
    for (const bad of [MINT_ID_CEILING, 90001, 95001]) {
      const f = fakeExecutor({});
      await expect(
        mintPinnedSyntheticPlayers(f.executor, 1, [
          { playerId: 5, displayName: "Fine" },
          { playerId: bad, displayName: "Fill In" },
        ]),
      ).rejects.toBeInstanceOf(PinnedPlayerIdError);
      expect(f.mapInserts).toEqual([]);
      expect(f.curationInserts).toEqual([]);
    }
  });

  it("refuses non-positive or non-integer ids", async () => {
    for (const bad of [0, -3, 1.5, Number.NaN]) {
      const f = fakeExecutor({});
      await expect(
        mintPinnedSyntheticPlayers(f.executor, 1, [{ playerId: bad, displayName: "X Y" }]),
      ).rejects.toBeInstanceOf(PinnedPlayerIdError);
      expect(f.mapInserts).toEqual([]);
    }
  });

  it("refuses an id the tenant's crosswalk already uses (GUID or synthetic), writing nothing", async () => {
    const f = fakeExecutor({
      map: [
        { participantId: "guid-a", playerId: 40 },
        { participantId: "club:0000", playerId: 41 },
      ],
    });
    await expect(
      mintPinnedSyntheticPlayers(f.executor, 1, [
        { playerId: 12, displayName: "Free" },
        { playerId: 41, displayName: "Taken" },
      ]),
    ).rejects.toThrow(/41/);
    expect(f.mapInserts).toEqual([]);
    expect(f.curationInserts).toEqual([]);
  });

  it("refuses the same id twice in one call", async () => {
    const f = fakeExecutor({});
    await expect(
      mintPinnedSyntheticPlayers(f.executor, 1, [
        { playerId: 12, displayName: "A B" },
        { playerId: 12, displayName: "C D" },
      ]),
    ).rejects.toBeInstanceOf(PinnedPlayerIdError);
    expect(f.mapInserts).toEqual([]);
  });

  it("is a no-op for an empty list (no lock, no reads)", async () => {
    const f = fakeExecutor({});
    expect(await mintPinnedSyntheticPlayers(f.executor, 1, [])).toEqual([]);
    expect(f.locks()).toBe(0);
  });
});
