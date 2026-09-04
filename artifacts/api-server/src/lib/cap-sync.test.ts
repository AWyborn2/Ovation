/**
 * Tests for cap-register sync, against an in-memory fake of `@workspace/db`.
 *
 * Two properties are under test, both of which corrupt a club's honour roll
 * when they fail and neither of which any other suite covers:
 *
 *  1. TENANCY. Cap numbers are a per-club sequence. Every read and write must be
 *     filtered to one tenant, or club B's first cap collides with club A's — and
 *     club A's caps get renumbered, updated, or deleted by club B's import.
 *  2. MINTING. A cap marks a debut. It may only be issued to a player THIS
 *     import fielded, never to a fill-in, and never in a batch that looks like an
 *     unlinked register rather than a round of debuts.
 *
 * `drizzle-orm` is mocked down to plain predicate objects the fake evaluates
 * exactly. That deliberately trades fidelity to drizzle's SQL builder — not what
 * is at risk here — for the ability to hold two tenants' rows in one store and
 * prove one is invisible to the other. A fake that ignored the predicate could
 * only assert that a filter was *passed*, not that it *worked*.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Fakes (hoisted so the vi.mock factories can close over them)
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type Pred =
    | { op: "eq"; col: string; val: unknown }
    | { op: "in"; col: string; vals: unknown[] }
    | { op: "and"; ps: Pred[] }
    | undefined;

  /** A column stand-in that carries the JS property name the fake rows use. */
  const col = (name: string) => ({ __col: name });

  const makeTable = (name: string, cols: string[]) => {
    const t: Record<string, unknown> = { __table: name };
    for (const c of cols) t[c] = col(c);
    return t as { __table: string } & Record<string, { __col: string }>;
  };

  const capRegisterTable = makeTable("cap_register", [
    "id",
    "tenantId",
    "capNumber",
    "category",
    "name",
    "deceased",
    "inStats",
    "gamesAGrade",
    "autoCreated",
    "playerId",
  ]);
  const playerGradeStatsTable = makeTable("player_grade_stats", [
    "id",
    "playerId",
    "grade",
    "games",
  ]);
  const playersTable = makeTable("players", ["id", "surname", "givenName"]);

  const matches = (row: Row, p: Pred): boolean => {
    if (!p) return true;
    if (p.op === "and") return p.ps.every((q) => matches(row, q));
    if (p.op === "eq") return row[p.col] === p.val;
    if (p.op === "in") return p.vals.includes(row[p.col]);
    throw new Error(`fake db: unsupported predicate ${JSON.stringify(p)}`);
  };

  const state = {
    rows: {} as Record<string, Row[]>,
    seq: 1000,
    reset() {
      state.rows = { cap_register: [], player_grade_stats: [], players: [] };
      state.seq = 1000;
    },
    caps: () => state.rows.cap_register,
  };
  state.reset();

  const project = (row: Row, fields?: Record<string, { __col: string }>): Row => {
    if (!fields) return { ...row };
    const out: Row = {};
    for (const [key, c] of Object.entries(fields)) out[key] = row[c.__col];
    return out;
  };

  const readable = (fields?: Record<string, { __col: string }>) => ({
    from: (t: { __table: string }) => ({
      where: async (p: Pred) =>
        (state.rows[t.__table] ?? []).filter((r) => matches(r, p)).map((r) => project(r, fields)),
    }),
  });

  const writable = {
    select: (fields?: Record<string, { __col: string }>) => readable(fields),
    insert: (t: { __table: string }) => ({
      values: async (values: Row) => {
        (state.rows[t.__table] ??= []).push({ id: ++state.seq, ...values });
      },
    }),
    update: (t: { __table: string }) => ({
      set: (values: Row) => ({
        where: async (p: Pred) => {
          for (const r of state.rows[t.__table] ?? []) {
            if (matches(r, p)) Object.assign(r, values);
          }
        },
      }),
    }),
    delete: (t: { __table: string }) => ({
      where: async (p: Pred) => {
        state.rows[t.__table] = (state.rows[t.__table] ?? []).filter((r) => !matches(r, p));
      },
    }),
  };

  return {
    db: writable,
    tx: writable,
    capRegisterTable,
    playerGradeStatsTable,
    playersTable,
    state,
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (c: { __col: string }, val: unknown) => ({ op: "eq", col: c.__col, val }),
  inArray: (c: { __col: string }, vals: unknown[]) => ({ op: "in", col: c.__col, vals }),
  and: (...ps: unknown[]) => ({ op: "and", ps: ps.filter(Boolean) }),
  // Only reached by cleanupOrphanPlayers, which these tests never call.
  sql: Object.assign(() => ({}), { join: () => ({}) }),
}));

vi.mock("@workspace/db", () => ({
  db: h.db,
  capRegisterTable: h.capRegisterTable,
  playerGradeStatsTable: h.playerGradeStatsTable,
  playersTable: h.playersTable,
}));

import {
  syncCapsFromStats,
  recomputeCapsFromStats,
  getCappedPlayerIds,
  type CapSyncTx,
} from "./cap-sync";
import { reverseCapsAfterRollback } from "./rollback";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TX = h.tx as unknown as CapSyncTx;
const HOME = 7; // the tenant under test
const OTHER = 3; // a second club whose register must never be touched
const GRADE = "A Grade";

type CapSeed = {
  tenantId?: number;
  capNumber: number;
  playerId?: number | null;
  autoCreated?: boolean;
  inStats?: boolean;
  gamesAGrade?: number;
  category?: string;
};

function seedCap(c: CapSeed) {
  h.state.caps().push({
    id: h.state.caps().length + 1,
    tenantId: c.tenantId ?? HOME,
    capNumber: c.capNumber,
    category: c.category ?? "male",
    name: `Cap ${c.capNumber}`,
    deceased: false,
    inStats: c.inStats ?? true,
    gamesAGrade: c.gamesAGrade ?? 1,
    autoCreated: c.autoCreated ?? false,
    playerId: c.playerId === undefined ? null : c.playerId,
  });
}

/** Put a player on the roster and on record in `grade` with `games` games. */
function seedPlayer(id: number, games = 1, grade = GRADE) {
  h.state.rows.players.push({ id, surname: `Sur${id}`, givenName: `Giv${id}` });
  h.state.rows.player_grade_stats.push({ id, playerId: id, grade, games });
}

const capsFor = (tenantId: number) => h.state.caps().filter((c) => c.tenantId === tenantId);

beforeEach(() => h.state.reset());

// ---------------------------------------------------------------------------
// 1. Tenancy
// ---------------------------------------------------------------------------

describe("cap-sync — tenancy", () => {
  it("numbers a new cap from the tenant's own high-water mark, not the global one", async () => {
    // The other club is 500 caps deep; ours has issued 7. A global maximum would
    // hand our debutant #501 and permanently desynchronise our register.
    seedCap({ tenantId: OTHER, capNumber: 500, playerId: 91 });
    seedCap({ capNumber: 7, playerId: 1 });
    seedPlayer(1);
    seedPlayer(2);

    const result = await syncCapsFromStats(TX, HOME, GRADE, [1, 2]);

    expect(result?.created).toBe(1);
    expect(result?.createdCaps).toEqual([{ capNumber: 8, playerId: 2, name: "Giv2 Sur2" }]);
    expect(capsFor(OTHER)).toHaveLength(1);
  });

  it("never refreshes another tenant's cap, even for the same player", async () => {
    // The same person can hold a cap at two clubs. Ours must move; theirs must not.
    // The other club's row is seeded LAST on purpose: an unfiltered read would
    // let it win the player→cap map, so this fails if the read is ever loosened
    // rather than passing on seed order.
    seedCap({ capNumber: 4, playerId: 1, gamesAGrade: 0, inStats: false });
    seedCap({ tenantId: OTHER, capNumber: 12, playerId: 1, gamesAGrade: 0, inStats: false });
    seedPlayer(1, 25);

    await syncCapsFromStats(TX, HOME, GRADE, [1]);

    expect(capsFor(HOME)[0]).toMatchObject({ gamesAGrade: 25, inStats: true });
    expect(capsFor(OTHER)[0]).toMatchObject({ gamesAGrade: 0, inStats: false });
  });

  it("recomputeCapsFromStats leaves another tenant's stale rows alone", async () => {
    seedCap({ tenantId: OTHER, capNumber: 12, playerId: 1, gamesAGrade: 0, inStats: false });
    seedCap({ capNumber: 4, playerId: 1, gamesAGrade: 0, inStats: false });
    seedPlayer(1, 25);

    const [male] = await recomputeCapsFromStats(TX, HOME, ["male"]);

    expect(male.updated).toBe(1);
    expect(capsFor(OTHER)[0]).toMatchObject({ gamesAGrade: 0, inStats: false });
  });

  it("getCappedPlayerIds returns only this tenant's linked players", async () => {
    seedCap({ tenantId: OTHER, capNumber: 1, playerId: 99 });
    seedCap({ capNumber: 1, playerId: 5 });
    seedCap({ capNumber: 2, playerId: null }); // unlinked historical cap
    seedCap({ capNumber: 3, playerId: 6, category: "female" });

    expect(await getCappedPlayerIds(HOME, "male")).toEqual(new Set([5]));
  });

  it("a rollback never deletes another tenant's auto-created cap", async () => {
    // Both clubs auto-created a cap for the same player; only ours was rolled back.
    seedCap({ tenantId: OTHER, capNumber: 30, playerId: 1, autoCreated: true });
    seedCap({ capNumber: 9, playerId: 1, autoCreated: true });
    // No player_grade_stats rows: post-rollback the player is off record entirely.

    await reverseCapsAfterRollback(TX, HOME, [GRADE]);

    expect(capsFor(HOME)).toHaveLength(0);
    expect(capsFor(OTHER)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Minting
// ---------------------------------------------------------------------------

describe("cap-sync — who may be issued a cap", () => {
  it("does not cap a player who is on record in the grade but absent from this import", async () => {
    // The regression that made this rule necessary: a per-match import used to
    // walk the whole grade aggregate, so committing one round capped every
    // uncapped player in the club's history at once.
    seedPlayer(1); // in the import
    seedPlayer(2); // history only
    seedPlayer(3); // history only

    const result = await syncCapsFromStats(TX, HOME, GRADE, [1]);

    expect(result?.created).toBe(1);
    expect(result?.createdCaps.map((c) => c.playerId)).toEqual([1]);
  });

  it("still refreshes the games of a linked cap whose player is not in this import", async () => {
    // Narrowing minting must not narrow refreshing — an established player's
    // cached game count still has to track the aggregate.
    seedCap({ capNumber: 1, playerId: 2, gamesAGrade: 0, inStats: false });
    seedPlayer(1);
    seedPlayer(2, 40);

    const result = await syncCapsFromStats(TX, HOME, GRADE, [1]);

    expect(result?.updated).toBe(1);
    expect(capsFor(HOME).find((c) => c.playerId === 2)).toMatchObject({
      gamesAGrade: 40,
      inStats: true,
    });
  });

  it("never issues a cap to a fill-in", async () => {
    // playerId >= 90000 is the fill-in convention: borrowed players, excluded
    // from every stats derivation, and not club members to be capped.
    seedPlayer(1);
    seedPlayer(90001);

    const result = await syncCapsFromStats(TX, HOME, GRADE, [1, 90001]);

    expect(result?.createdCaps.map((c) => c.playerId)).toEqual([1]);
  });

  it("numbers new caps in the order the import supplies, not player id order", async () => {
    seedPlayer(30);
    seedPlayer(10);
    seedCap({ capNumber: 100, playerId: 99 }); // sets the high-water mark

    const result = await syncCapsFromStats(TX, HOME, GRADE, [30, 10]);

    expect(result?.createdCaps).toEqual([
      { capNumber: 101, playerId: 30, name: "Giv30 Sur30" },
      { capNumber: 102, playerId: 10, name: "Giv10 Sur10" },
    ]);
  });

  it("is idempotent: re-importing the same round mints nothing and bumps no numbers", async () => {
    seedPlayer(1);
    seedPlayer(2);

    const first = await syncCapsFromStats(TX, HOME, GRADE, [1, 2]);
    const second = await syncCapsFromStats(TX, HOME, GRADE, [1, 2]);

    expect(first?.created).toBe(2);
    expect(second?.created).toBe(0);
    expect(capsFor(HOME).map((c) => c.capNumber)).toEqual([1, 2]);
  });
});

describe("cap-sync — the unlinked-register circuit breaker", () => {
  /** An XI of which `uncapped` players hold no cap. Returns the import order. */
  function seedXI(uncapped: number): number[] {
    const ids: number[] = [];
    for (let i = 1; i <= 11; i++) {
      seedPlayer(i);
      ids.push(i);
      if (i > uncapped) seedCap({ capNumber: i, playerId: i });
    }
    return ids;
  }

  it("mints normally for a plausible round of debuts", async () => {
    const ids = seedXI(2);

    const result = await syncCapsFromStats(TX, HOME, GRADE, ids);

    expect(result?.created).toBe(2);
    expect(result?.skipped).toBe(0);
  });

  it("mints a small import that is entirely debutants", async () => {
    // Three players, none capped: under the absolute floor, so a genuinely new
    // club with a tiny import is not blocked from starting its register.
    seedPlayer(1);
    seedPlayer(2);
    seedPlayer(3);

    const result = await syncCapsFromStats(TX, HOME, GRADE, [1, 2, 3]);

    expect(result?.created).toBe(3);
    expect(result?.skipped).toBe(0);
  });

  it("mints nothing when most of the squad is uncapped, and reports them", async () => {
    // A club onboarding with a century of history: their first A Grade import is
    // eleven veterans, not eleven debutants. Capping them would stamp #1–#11
    // over a real honour roll.
    const ids = seedXI(11);

    const result = await syncCapsFromStats(TX, HOME, GRADE, ids);

    expect(result?.created).toBe(0);
    expect(result?.skipped).toBe(11);
    expect(result?.createdCaps).toEqual([]);
    expect(capsFor(HOME)).toHaveLength(0);
  });

  it("trips even when the register is seeded but its rows are unlinked", async () => {
    // The worse variant: the club HAS its honour roll, but no row carries a
    // player_id yet. Unblocked, every veteran would be re-capped at #501+,
    // duplicating people already in the register.
    for (let n = 1; n <= 500; n++) seedCap({ capNumber: n, playerId: null });
    const ids = seedXI(11);

    const result = await syncCapsFromStats(TX, HOME, GRADE, ids);

    expect(result?.created).toBe(0);
    expect(result?.skipped).toBe(11);
    expect(capsFor(HOME).every((c) => c.playerId === null)).toBe(true);
  });

  it("lets the club proceed once enough of the register is linked", async () => {
    // The escape hatch: after the admin links the register by hand, the next
    // import looks like a normal round again.
    const ids = seedXI(2);

    const result = await syncCapsFromStats(TX, HOME, GRADE, ids);

    expect(result?.skipped).toBe(0);
    expect(result?.created).toBe(2);
  });

  it("counts only the import's players, so club history cannot trip the breaker", async () => {
    // 40 uncapped players on record but not in this import; the XI is fully
    // capped bar one. The breaker must read the import, not the aggregate.
    const ids = seedXI(1);
    for (let i = 100; i < 140; i++) seedPlayer(i);

    const result = await syncCapsFromStats(TX, HOME, GRADE, ids);

    expect(result?.skipped).toBe(0);
    expect(result?.created).toBe(1);
  });
});
