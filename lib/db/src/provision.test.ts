import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as CentralQueries from "./central-queries";

/** FIFO of result sets the mocked centralDb.select() query resolves to. */
const queuedCentralResults: unknown[][] = [];
/** FIFO of result sets the mocked tenant db.select() query resolves to. */
const queuedTenantResults: unknown[][] = [];

function makeSelectBuilder(queue: unknown[][]) {
  const builder = {
    from() {
      return builder;
    },
    where() {
      return builder;
    },
    then(onFulfilled, onRejected) {
      return Promise.resolve(queue.shift() ?? []).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

vi.mock("./central", async () => {
  const schema = await vi.importActual("./central-schema");
  return {
    ...schema,
    centralDb: { select: () => makeSelectBuilder(queuedCentralResults) },
  };
});

// provisionTenant's folded-club and exclusion checks happen in resolveCentralClub,
// before any tenant-DB write — only `select` needs mocking for those guards.
vi.mock("./index", () => ({
  db: { select: () => makeSelectBuilder(queuedTenantResults) },
}));

/** Participants mintPlayerIdMap sees for the club (mocked central read). */
let clubParticipants: { participantId: string; displayName: string | null; isPrivate: boolean }[] =
  [];
vi.mock("./central-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof CentralQueries>()),
  centralClubParticipants: async () => clubParticipants,
}));

import { provisionTenant, ProvisionError, mintPlayerIdMap, MINT_ID_CEILING } from "./provision";
import { isCentralClubProvisionable } from "./central-schema/clubs";
import { playerIdMapTable } from "./schema/player_id_map";
import { playerCurationTable } from "./schema/player_curation";
import { playersTable } from "./schema/players";

beforeEach(() => {
  queuedCentralResults.length = 0;
  queuedTenantResults.length = 0;
  clubParticipants = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isCentralClubProvisionable", () => {
  it("is true for a club with no activeTo", () => {
    expect(isCentralClubProvisionable({ activeTo: null })).toBe(true);
  });

  it("is false once activeTo is set (folded or renamed/merged)", () => {
    expect(isCentralClubProvisionable({ activeTo: "2019-06-30" })).toBe(false);
  });
});

describe("provisionTenant: folded-club guard", () => {
  it("rejects a club with activeTo set, before touching the tenant DB", async () => {
    queuedCentralResults.push([
      { clubId: 42, name: "Coastal Districts Cricket Club", activeTo: "2019-06-30" },
    ]);

    await expect(
      provisionTenant({ slug: "coastal", centralClubId: 42, mode: "create" }),
    ).rejects.toMatchObject({
      code: "club_folded",
      message: expect.stringContaining("Coastal Districts"),
    });
  });

  it("rejects before ever consulting the exclusion table", async () => {
    // Regression guard on check ordering: the folded-club check runs before
    // the exclusion-table lookup, so a folded club's queued tenant-db result
    // (left empty here) is never consumed -- if the ordering flipped, this
    // test's assertions below would still pass since both throw ProvisionError,
    // so the real proof is queuedTenantResults staying untouched (asserted below).
    queuedCentralResults.push([{ clubId: 7, name: "Folded FC", activeTo: "2001-01-01" }]);
    const sentinel = [{ visibility: "everywhere" }];
    queuedTenantResults.push(sentinel);

    let caught: unknown;
    try {
      await provisionTenant({ slug: "folded", centralClubId: 7, mode: "create" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ProvisionError);
    expect((caught as ProvisionError).code).toBe("club_folded");
    // The exclusion-table select was never issued -- the sentinel is still queued.
    expect(queuedTenantResults).toEqual([sentinel]);
  });
});

describe("provisionTenant: exclusion guard", () => {
  const club = { clubId: 55, name: "Curtin Victoria Park Cricket Club", activeTo: null };

  it("self-serve context rejects an 'everywhere' exclusion", async () => {
    queuedCentralResults.push([club]);
    queuedTenantResults.push([{ visibility: "everywhere" }]);
    await expect(
      provisionTenant({ slug: "curtin", centralClubId: 55, mode: "create", context: "self-serve" }),
    ).rejects.toMatchObject({ code: "club_excluded" });
  });

  it("self-serve context rejects a 'self_serve_only' exclusion", async () => {
    queuedCentralResults.push([club]);
    queuedTenantResults.push([{ visibility: "self_serve_only" }]);
    await expect(
      provisionTenant({ slug: "curtin", centralClubId: 55, mode: "create", context: "self-serve" }),
    ).rejects.toMatchObject({ code: "club_excluded" });
  });

  it("concierge context rejects an 'everywhere' exclusion", async () => {
    queuedCentralResults.push([club]);
    queuedTenantResults.push([{ visibility: "everywhere" }]);
    await expect(
      provisionTenant({ slug: "curtin", centralClubId: 55, mode: "create", context: "concierge" }),
    ).rejects.toMatchObject({ code: "club_excluded" });
  });

  it("concierge context allows a 'self_serve_only' exclusion through to the tenant insert", async () => {
    queuedCentralResults.push([club]);
    queuedTenantResults.push([{ visibility: "self_serve_only" }]);
    // resolveCentralClub resolves successfully past the guard; the call then
    // reaches the real tenant-insert path, which this mock deliberately leaves
    // unstubbed (db.insert is undefined). The resulting TypeError -- not a
    // club_excluded ProvisionError -- is the proof the guard let it through.
    let caught: unknown;
    try {
      await provisionTenant({
        slug: "curtin",
        centralClubId: 55,
        mode: "create",
        context: "concierge",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeInstanceOf(ProvisionError);
  });

  it("defaults to the restrictive 'self-serve' context when none is passed", async () => {
    queuedCentralResults.push([club]);
    queuedTenantResults.push([{ visibility: "self_serve_only" }]);
    await expect(
      provisionTenant({ slug: "curtin", centralClubId: 55, mode: "create" }),
    ).rejects.toMatchObject({ code: "club_excluded" });
  });

  it("provisions normally when the club has no exclusion row (regression guard)", async () => {
    queuedCentralResults.push([club]);
    queuedTenantResults.push([]); // no exclusion row found
    let caught: unknown;
    try {
      await provisionTenant({
        slug: "curtin",
        centralClubId: 55,
        mode: "create",
        context: "self-serve",
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).not.toBeInstanceOf(ProvisionError);
  });
});

/**
 * A fake tenant executor for mintPlayerIdMap: each select resolves by the table
 * it reads (crosswalk / curation / native players), and inserts are recorded.
 */
function fakeExecutor(state: {
  map?: { participantId: string; playerId: number }[];
  curation?: { participantId: string }[];
  nativeMax?: number | null;
}) {
  const inserted: { tenantId: number; participantId: string; playerId: number }[] = [];
  const reads: unknown[] = [];
  const resultFor = (table: unknown): unknown[] => {
    reads.push(table);
    if (table === playerIdMapTable) return state.map ?? [];
    if (table === playerCurationTable) return state.curation ?? [];
    if (table === playersTable) return [{ maxId: state.nativeMax ?? null }];
    throw new Error("unexpected table");
  };
  const executor = {
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
            .then(() => resultFor(table))
            .then(onFulfilled, onRejected);
        },
      };
      return builder;
    },
    insert(table: unknown) {
      if (table !== playerIdMapTable) throw new Error("mint may only insert crosswalk rows");
      return {
        values: async (rows: typeof inserted) => {
          inserted.push(...rows);
        },
      };
    },
  };
  return { executor: executor as never, inserted, reads };
}

const guid = (n: number): string => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const participants = (...ns: number[]) =>
  ns.map((n) => ({ participantId: guid(n), displayName: null, isPrivate: false }));

describe("mintPlayerIdMap: guards", () => {
  it("continues the per-tenant sequence and skips already-mapped GUIDs (regression)", async () => {
    clubParticipants = participants(1, 2, 3);
    const f = fakeExecutor({ map: [{ participantId: guid(1), playerId: 5 }] });
    const r = await mintPlayerIdMap(7, 12, f.executor);
    expect(f.inserted).toEqual([
      { tenantId: 7, participantId: guid(2), playerId: 6 },
      { tenantId: 7, participantId: guid(3), playerId: 7 },
    ]);
    expect(r).toEqual({ minted: 2, totalParticipants: 3 });
  });

  it("never mints a merged-away GUID", async () => {
    clubParticipants = participants(1, 2);
    const f = fakeExecutor({ curation: [{ participantId: guid(2) }] });
    await mintPlayerIdMap(7, 12, f.executor);
    expect(f.inserted.map((r) => r.participantId)).toEqual([guid(1)]);
  });

  it("for Halls Head (tenant 1) starts above the highest native player id", async () => {
    clubParticipants = participants(1, 2, 3);
    // Persisted keeper rows reuse native ids (e.g. 40, 812); native max is 1500.
    const f = fakeExecutor({
      map: [
        { participantId: guid(1), playerId: 40 },
        { participantId: guid(2), playerId: 812 },
      ],
      nativeMax: 1500,
    });
    await mintPlayerIdMap(1, 1, f.executor);
    expect(f.inserted).toEqual([{ tenantId: 1, participantId: guid(3), playerId: 1501 }]);
    expect(f.reads).toContain(playersTable);
  });

  it("does not consult native players for any other tenant", async () => {
    clubParticipants = participants(1);
    const f = fakeExecutor({ nativeMax: 1500 });
    await mintPlayerIdMap(7, 12, f.executor);
    expect(f.inserted).toEqual([{ tenantId: 7, participantId: guid(1), playerId: 1 }]);
    expect(f.reads).not.toContain(playersTable);
  });

  it("ignores ids in the fill-in / cap-only range when continuing the sequence", async () => {
    clubParticipants = participants(1, 2);
    const f = fakeExecutor({ map: [{ participantId: guid(1), playerId: 95001 }] });
    await mintPlayerIdMap(7, 12, f.executor);
    expect(f.inserted).toEqual([{ tenantId: 7, participantId: guid(2), playerId: 1 }]);
  });

  it("refuses to mint an id >= 90000, writing nothing", async () => {
    expect(MINT_ID_CEILING).toBe(90000);
    clubParticipants = participants(1, 2, 3);
    const f = fakeExecutor({ map: [{ participantId: guid(1), playerId: MINT_ID_CEILING - 2 }] });
    await expect(mintPlayerIdMap(7, 12, f.executor)).rejects.toThrow(/90000/);
    expect(f.inserted).toEqual([]);
  });

  it("after Halls Head persistence, never collides with a native id or reaches 90000", async () => {
    clubParticipants = participants(...Array.from({ length: 50 }, (_, i) => i + 1));
    const keeperRows = Array.from({ length: 10 }, (_, i) => ({
      participantId: guid(i + 1),
      playerId: (i + 1) * 100, // native ids up to 1000
    }));
    const f = fakeExecutor({
      map: keeperRows,
      curation: [{ participantId: guid(11) }], // merged away
      nativeMax: 2400,
    });
    await mintPlayerIdMap(1, 1, f.executor);
    const ids = f.inserted.map((r) => r.playerId);
    expect(ids).toHaveLength(39);
    expect(Math.min(...ids)).toBe(2401);
    expect(ids.every((id) => id > 2400 && id < MINT_ID_CEILING)).toBe(true);
    expect(f.inserted.some((r) => r.participantId === guid(11))).toBe(false);
  });
});
