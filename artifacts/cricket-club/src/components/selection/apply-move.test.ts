import { describe, it, expect } from "vitest";
import type { SelectionMember, SelectionSide } from "@workspace/api-client-react";
import {
  applyMove,
  checkMove,
  locate,
  sideWarnings,
  toChanges,
  type BoardState,
} from "./apply-move";

/** A member as the Hub API returns them. */
function member(
  id: number,
  name: string,
  status: SelectionMember["status"] = "yes",
): SelectionMember {
  return {
    id,
    displayName: name,
    status,
    note: null,
    lastGrade: null,
    junior: false,
    isPrivate: false,
    repliedAt: null,
    late: false,
  };
}

/** A side of 11 slots: the given members first, then open slots. */
function side(
  id: number,
  grade: string,
  members: SelectionMember[],
  opts: Partial<
    Pick<SelectionSide, "state" | "canEdit" | "captainMemberId" | "keeperMemberId">
  > = {},
): SelectionSide {
  const slots = Array.from({ length: 11 }, (_, i) => {
    const m = members[i] ?? null;
    return { memberId: m?.id ?? null, member: m, gap: null };
  });
  const s: SelectionSide = {
    id,
    roundId: 1,
    fixture: {
      id: id * 10,
      grade,
      opponentName: "Riverside",
      startAt: "2026-10-17T04:30:00.000Z",
      venue: null,
      isHome: true,
      roundLabel: null,
    },
    date: "2026-10-17",
    state: opts.state ?? "draft",
    version: 3,
    slots,
    captainMemberId: opts.captainMemberId ?? null,
    keeperMemberId: opts.keeperMemberId ?? null,
    finalisedAt: null,
    finalisedBy: null,
    canEdit: opts.canEdit ?? opts.state !== "final",
    canFinalise: true,
    readOnlyReason: null,
    warnings: {
      filled: 0,
      open: 11,
      unconfirmed: 0,
      saidNo: 0,
      noCaptain: true,
      noKeeper: true,
    },
  };
  return { ...s, warnings: sideWarnings(s) };
}

const range = (from: number, n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => member(from + i, `${prefix} ${i + 1}`));

function board(): BoardState {
  const a = range(100, 9, "A player");
  const b = range(200, 11, "B player");
  const c = range(300, 10, "C player");
  return {
    selections: [
      side(1, "A Grade", a, { captainMemberId: 100, keeperMemberId: 101 }),
      side(2, "B Grade", b, { captainMemberId: 200 }),
      side(3, "C Grade", c),
    ],
    pool: [member(900, "Pool Yes"), member(901, "R. Pike", "no"), member(902, "Quiet", "none")],
  };
}

const sideOf = (s: BoardState, id: number) => s.selections.find((x) => x.id === id)!;
const ids = (s: SelectionSide) => s.slots.map((x) => x.memberId);

describe("applyMove — moves", () => {
  it("pool → open slot fills it and takes the player out of the pool", () => {
    const r = applyMove(board(), {
      kind: "move",
      memberId: 900,
      target: { kind: "slot", sideId: 1, index: 9 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ids(sideOf(r.state, 1))[9]).toBe(900);
    expect(r.state.pool.map((m) => m.id)).not.toContain(900);
    expect(r.touched).toEqual([1]);
    expect(sideOf(r.state, 1).warnings.filled).toBe(10);
  });

  it("team → filled slot swaps the two players between the sides (one save, both touched)", () => {
    const r = applyMove(board(), {
      kind: "move",
      memberId: 305,
      target: { kind: "slot", sideId: 1, index: 4 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ids(sideOf(r.state, 1))[4]).toBe(305);
    expect(ids(sideOf(r.state, 3))[5]).toBe(104);
    expect([...r.touched].sort()).toEqual([1, 3]);
    expect(r.log[0]).toMatch(/swapped with A player 5/);
  });

  it("swaps two players within one side", () => {
    const r = applyMove(board(), {
      kind: "move",
      memberId: 100,
      target: { kind: "slot", sideId: 1, index: 3 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ids(sideOf(r.state, 1)).slice(0, 4)).toEqual([103, 101, 102, 100]);
    expect(r.touched).toEqual([1]);
    // The captain stays: they never left the side.
    expect(sideOf(r.state, 1).captainMemberId).toBe(100);
  });

  it("pool → filled slot returns the occupant to the pool", () => {
    const r = applyMove(board(), {
      kind: "move",
      memberId: 900,
      target: { kind: "slot", sideId: 2, index: 6 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ids(sideOf(r.state, 2))[6]).toBe(900);
    const pool = r.state.pool.map((m) => m.id);
    expect(pool).toContain(206);
    expect(pool).not.toContain(900);
    expect(r.log[0]).toBe("Pool Yes in to B Grade, B player 7 back to the pool");
  });

  it("dropping on a team card fills its first open slot (AE3: C Grade player into A Grade)", () => {
    const r = applyMove(board(), {
      kind: "move",
      memberId: 302,
      target: { kind: "side", sideId: 1 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ids(sideOf(r.state, 1))[9]).toBe(302);
    expect(ids(sideOf(r.state, 3))[2]).toBeNull();
    expect(sideOf(r.state, 3).warnings.open).toBe(2);
  });

  it("refuses a full card without a slot target (AE2)", () => {
    const r = applyMove(board(), {
      kind: "move",
      memberId: 900,
      target: { kind: "side", sideId: 2 },
    });
    expect(r).toEqual({
      ok: false,
      reason: "full",
      message: "B Grade already has 11. Drop onto a player to swap them out.",
    });
  });

  it("team → pool empties the slot and adds the player to the pool", () => {
    const r = applyMove(board(), { kind: "move", memberId: 203, target: { kind: "pool" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(ids(sideOf(r.state, 2))[3]).toBeNull();
    expect(sideOf(r.state, 2).slots[3].gap).toBeNull();
    expect(r.state.pool.map((m) => m.id)).toContain(203);
    expect(r.log[0]).toBe("B player 4 moved from B Grade to the pool");
  });

  it("silently ignores no-op drops", () => {
    expect(
      applyMove(board(), { kind: "move", memberId: 900, target: { kind: "pool" } }),
    ).toMatchObject({ ok: false, reason: "noop", message: "" });
    expect(
      applyMove(board(), {
        kind: "move",
        memberId: 100,
        target: { kind: "slot", sideId: 1, index: 0 },
      }),
    ).toMatchObject({ ok: false, reason: "noop" });
    expect(
      applyMove(board(), { kind: "move", memberId: 100, target: { kind: "side", sideId: 1 } }),
    ).toMatchObject({ ok: false, reason: "noop" });
  });

  it("allows picking a player who said No and warns (AE4)", () => {
    const r = applyMove(board(), {
      kind: "move",
      memberId: 901,
      target: { kind: "side", sideId: 1 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warning).toBe(
      "R. Pike said they're unavailable. Check with them before you finalise.",
    );
    expect(sideOf(r.state, 1).warnings.saidNo).toBe(1);
  });

  it("warns for a no-reply pick", () => {
    const r = applyMove(board(), {
      kind: "move",
      memberId: 902,
      target: { kind: "side", sideId: 1 },
    });
    expect(r.ok && r.warning).toBe("Quiet hasn't replied. They're flagged until they confirm.");
    expect(r.ok && sideOf(r.state, 1).warnings.unconfirmed).toBe(1);
  });

  it("does not mutate the input state", () => {
    const before = board();
    const snapshot = JSON.stringify(before);
    applyMove(before, {
      kind: "move",
      memberId: 305,
      target: { kind: "slot", sideId: 1, index: 4 },
    });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("applyMove — rights and locks", () => {
  function locked(): BoardState {
    const s = board();
    s.selections[1] = {
      ...s.selections[1],
      canEdit: false,
      readOnlyReason: "Captains edit their own grade.",
    };
    s.selections[2] = { ...s.selections[2], state: "final", canEdit: false };
    return s;
  }

  it("refuses taking a player out of a read-only side (AE5)", () => {
    expect(
      applyMove(locked(), { kind: "move", memberId: 203, target: { kind: "side", sideId: 1 } }),
    ).toEqual({
      ok: false,
      reason: "source_read_only",
      message: "B Grade players are managed by its captain or an admin.",
    });
  });

  it("refuses dropping into a read-only side", () => {
    expect(
      applyMove(locked(), {
        kind: "move",
        memberId: 900,
        target: { kind: "slot", sideId: 2, index: 0 },
      }),
    ).toMatchObject({
      ok: false,
      reason: "target_read_only",
      message: "B Grade is read-only for you.",
    });
  });

  it("refuses moves out of and into a finalised side", () => {
    expect(
      applyMove(locked(), { kind: "move", memberId: 300, target: { kind: "pool" } }),
    ).toMatchObject({
      ok: false,
      reason: "source_final",
      message: "C Grade is finalised. Re-open it to make changes.",
    });
    expect(
      applyMove(locked(), { kind: "move", memberId: 900, target: { kind: "side", sideId: 3 } }),
    ).toMatchObject({ ok: false, reason: "target_final" });
  });

  it("refuses an unknown member or side", () => {
    expect(
      applyMove(board(), { kind: "move", memberId: 5, target: { kind: "pool" } }),
    ).toMatchObject({ ok: false, reason: "unknown" });
    expect(
      applyMove(board(), { kind: "move", memberId: 900, target: { kind: "side", sideId: 99 } }),
    ).toMatchObject({ ok: false, reason: "unknown" });
  });

  it("checkMove mirrors applyMove's verdict without changing anything", () => {
    expect(checkMove(board(), 900, { kind: "side", sideId: 2 })).toMatchObject({
      ok: false,
      reason: "full",
    });
    expect(checkMove(board(), 900, { kind: "side", sideId: 1 })).toEqual({ ok: true });
  });
});

describe("applyMove — captain and keeper", () => {
  it("moving a captain out of their side clears that side's captain only (AE8)", () => {
    const r = applyMove(board(), {
      kind: "move",
      memberId: 100,
      target: { kind: "slot", sideId: 2, index: 5 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 100 swapped with 205: A Grade's captain left, B Grade keeps theirs.
    expect(sideOf(r.state, 1).captainMemberId).toBeNull();
    expect(sideOf(r.state, 1).warnings.noCaptain).toBe(true);
    expect(sideOf(r.state, 2).captainMemberId).toBe(200);
    expect(r.log).toContain("A Grade no longer has a captain (A player 1 left the side)");
  });

  it("sending the keeper to the pool clears the keeper", () => {
    const r = applyMove(board(), { kind: "move", memberId: 101, target: { kind: "pool" } });
    expect(r.ok && sideOf(r.state, 1).keeperMemberId).toBeNull();
    expect(r.ok && r.log).toContain("A Grade no longer has a keeper (A player 2 left the side)");
  });

  it("one player may hold both roles (AE9)", () => {
    const r = applyMove(board(), { kind: "role", sideId: 1, role: "captain", memberId: 101 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = sideOf(r.state, 1);
    expect(a.captainMemberId).toBe(101);
    expect(a.keeperMemberId).toBe(101);
    expect(r.log).toEqual(["A player 2 named A Grade captain"]);
    expect(r.touched).toEqual([1]);
  });

  it("clears a role", () => {
    const r = applyMove(board(), { kind: "role", sideId: 1, role: "keeper", memberId: null });
    expect(r.ok && sideOf(r.state, 1).keeperMemberId).toBeNull();
    expect(r.ok && r.log).toEqual(["A Grade keeper cleared"]);
  });

  it("refuses a role holder from outside the side, and roles on a locked side", () => {
    expect(
      applyMove(board(), { kind: "role", sideId: 1, role: "captain", memberId: 900 }),
    ).toMatchObject({
      ok: false,
      reason: "not_in_side",
    });
    const s = board();
    s.selections[0] = { ...s.selections[0], state: "final", canEdit: false };
    expect(applyMove(s, { kind: "role", sideId: 1, role: "captain", memberId: 101 })).toMatchObject(
      {
        ok: false,
        reason: "target_final",
      },
    );
  });
});

describe("toChanges", () => {
  it("builds one whole-side change per touched side with its last-seen version", () => {
    const r = applyMove(board(), {
      kind: "move",
      memberId: 305,
      target: { kind: "slot", sideId: 1, index: 4 },
    });
    if (!r.ok) throw new Error("expected ok");
    const changes = toChanges(r.state, r.touched);
    expect(changes.map((c) => c.selectionId).sort()).toEqual([1, 3]);
    const a = changes.find((c) => c.selectionId === 1)!;
    expect(a.version).toBe(3);
    expect(a.slots).toHaveLength(11);
    expect(a.slots[4]).toEqual({ memberId: 305, gap: null });
    expect(a.captainMemberId).toBe(100);
    expect(a.keeperMemberId).toBe(101);
  });
});

describe("locate", () => {
  it("finds a member in a side or the pool", () => {
    expect(locate(board(), 203)).toEqual({ kind: "side", sideId: 2, index: 3 });
    expect(locate(board(), 900)).toEqual({ kind: "pool" });
    expect(locate(board(), 1)).toBeNull();
  });
});
