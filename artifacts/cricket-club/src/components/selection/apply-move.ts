import type {
  SelectionChange,
  SelectionMember,
  SelectionSide,
  SelectionSlot,
  SelectionWarnings,
} from "@workspace/api-client-react";

/**
 * The Selection Hub's move rules. Pure: given the board and one action it
 * returns the next board and
 * the sides the action touched, or a refusal with the message to show. The
 * page applies the result optimistically and saves the touched sides in one
 * `PUT /selection/board`; the server re-checks every rule.
 */

export type BoardState = {
  selections: SelectionSide[];
  pool: SelectionMember[];
};

/** Where a dragged or moved player lands. */
export type DropTarget =
  | { kind: "slot"; sideId: number; index: number }
  | { kind: "side"; sideId: number }
  | { kind: "pool" };

export type BoardAction =
  | { kind: "move"; memberId: number; target: DropTarget }
  | { kind: "role"; sideId: number; role: "captain" | "keeper"; memberId: number | null };

export type RefusalReason =
  | "noop"
  | "unknown"
  | "source_final"
  | "source_read_only"
  | "target_final"
  | "target_read_only"
  | "full"
  | "not_in_side";

/** A refused action; `noop` refusals carry an empty message and are not shown. */
export type Refusal = { ok: false; reason: RefusalReason; message: string };

export type MoveResult = {
  ok: true;
  state: BoardState;
  /** Ids of the sides whose slots or roles changed. */
  touched: number[];
  /** What happened, for the live region and the toast. */
  log: string[];
  /** A pick of a player who said No or Maybe, or hasn't replied. */
  warning: string | null;
};

export type Location = { kind: "side"; sideId: number; index: number } | { kind: "pool" };

export const SIDE_SIZE = 11;

const refuse = (reason: RefusalReason, message = ""): Refusal => ({ ok: false, reason, message });

export const sideLabel = (side: SelectionSide) => side.fixture.grade;

/** A side is editable when the server says the caller may change it and it isn't final. */
export const sideEditable = (side: SelectionSide) => side.canEdit && side.state !== "final";

export function locate(state: BoardState, memberId: number): Location | null {
  for (const side of state.selections) {
    const index = side.slots.findIndex((s) => s.memberId === memberId);
    if (index > -1) return { kind: "side", sideId: side.id, index };
  }
  return state.pool.some((m) => m.id === memberId) ? { kind: "pool" } : null;
}

function memberOf(state: BoardState, memberId: number): SelectionMember | null {
  for (const side of state.selections) {
    const slot = side.slots.find((s) => s.memberId === memberId);
    if (slot) return slot.member;
  }
  return state.pool.find((m) => m.id === memberId) ?? null;
}

const nameOf = (state: BoardState, memberId: number) =>
  memberOf(state, memberId)?.displayName ?? `Player #${memberId}`;

/** The card's counts and warnings, recomputed from its slots and roles. */
export function sideWarnings(side: SelectionSide): SelectionWarnings {
  const picked = side.slots.filter((s) => s.memberId != null);
  const status = (s: SelectionSlot) => s.member?.status ?? "none";
  return {
    filled: picked.length,
    open: SIDE_SIZE - picked.length,
    unconfirmed: picked.filter((s) => status(s) === "maybe" || status(s) === "none").length,
    saidNo: picked.filter((s) => status(s) === "no").length,
    noCaptain: side.captainMemberId == null,
    noKeeper: side.keeperMemberId == null,
  };
}

function sourceCheck(state: BoardState, loc: Location): Refusal | null {
  if (loc.kind === "pool") return null;
  const side = state.selections.find((s) => s.id === loc.sideId)!;
  if (side.state === "final") {
    return refuse("source_final", `${sideLabel(side)} is finalised. Re-open it to make changes.`);
  }
  if (!side.canEdit) {
    return refuse(
      "source_read_only",
      `${sideLabel(side)} players are managed by its captain or an admin.`,
    );
  }
  return null;
}

function targetSideCheck(side: SelectionSide): Refusal | null {
  if (side.state === "final") {
    return refuse("target_final", `${sideLabel(side)} is finalised. Re-open it to make changes.`);
  }
  if (!side.canEdit) return refuse("target_read_only", `${sideLabel(side)} is read-only for you.`);
  return null;
}

/**
 * Whether `memberId` may be dropped on `target`, with the slot it would land
 * in. Used both to apply a move and to highlight drop zones while dragging.
 */
function resolve(
  state: BoardState,
  memberId: number,
  target: DropTarget,
): Refusal | { ok: true; from: Location; index: number | null } {
  const from = locate(state, memberId);
  if (!from) return refuse("unknown", "That player isn't on this board any more.");
  const src = sourceCheck(state, from);
  if (src) return src;

  if (target.kind === "pool") {
    return from.kind === "pool" ? refuse("noop") : { ok: true, from, index: null };
  }
  const side = state.selections.find((s) => s.id === target.sideId);
  if (!side) return refuse("unknown", "That side isn't on this board any more.");
  const tgt = targetSideCheck(side);
  if (tgt) return tgt;

  if (target.kind === "slot") {
    if (target.index < 0 || target.index >= side.slots.length) return refuse("unknown");
    if (side.slots[target.index].memberId === memberId) return refuse("noop");
    return { ok: true, from, index: target.index };
  }
  if (from.kind === "side" && from.sideId === side.id) return refuse("noop");
  const open = side.slots.findIndex((s) => s.memberId == null);
  if (open < 0) {
    return refuse(
      "full",
      `${sideLabel(side)} already has ${SIDE_SIZE}. Drop onto a player to swap them out.`,
    );
  }
  return { ok: true, from, index: open };
}

/** The drop verdict alone, for drag highlighting. */
export function checkMove(
  state: BoardState,
  memberId: number,
  target: DropTarget,
): { ok: true } | Refusal {
  const r = resolve(state, memberId, target);
  return r.ok ? { ok: true } : r;
}

const emptySlot = (): SelectionSlot => ({ memberId: null, member: null, gap: null });
const filledSlot = (m: SelectionMember): SelectionSlot => ({
  memberId: m.id,
  member: m,
  gap: null,
});

function pickWarning(m: SelectionMember): string | null {
  switch (m.status) {
    case "no":
      return `${m.displayName} said they're unavailable. Check with them before you finalise.`;
    case "none":
      return `${m.displayName} hasn't replied. They're flagged until they confirm.`;
    case "maybe":
      return `${m.displayName} said Maybe. They're flagged until they confirm.`;
    default:
      return null;
  }
}

function applyRole(
  state: BoardState,
  action: Extract<BoardAction, { kind: "role" }>,
): MoveResult | Refusal {
  const side = state.selections.find((s) => s.id === action.sideId);
  if (!side) return refuse("unknown", "That side isn't on this board any more.");
  const locked = targetSideCheck(side);
  if (locked) return locked;
  const word = action.role === "captain" ? "captain" : "keeper";
  const field = action.role === "captain" ? "captainMemberId" : "keeperMemberId";
  if (action.memberId != null && !side.slots.some((s) => s.memberId === action.memberId)) {
    return refuse("not_in_side", `Only a player in ${sideLabel(side)} can be its ${word}.`);
  }
  if (side[field] === action.memberId) return refuse("noop");
  const next = { ...side, [field]: action.memberId };
  next.warnings = sideWarnings(next);
  return {
    ok: true,
    state: {
      ...state,
      selections: state.selections.map((s) => (s.id === side.id ? next : s)),
    },
    touched: [side.id],
    log: [
      action.memberId != null
        ? `${nameOf(state, action.memberId)} named ${sideLabel(side)} ${word}`
        : `${sideLabel(side)} ${word} cleared`,
    ],
    warning: null,
  };
}

/** Apply one board action, or say why it can't happen. Never mutates `state`. */
export function applyMove(state: BoardState, action: BoardAction): MoveResult | Refusal {
  if (action.kind === "role") return applyRole(state, action);

  const { memberId, target } = action;
  const r = resolve(state, memberId, target);
  if (!r.ok) return r;
  const moving = memberOf(state, memberId);
  if (!moving) return refuse("unknown", "That player isn't on this board any more.");

  // Copy only what can change: the slot arrays of the sides involved, and the pool.
  const slotsOf = new Map<number, SelectionSlot[]>();
  const slots = (sideId: number) => {
    let s = slotsOf.get(sideId);
    if (!s) {
      s = [...state.selections.find((x) => x.id === sideId)!.slots];
      slotsOf.set(sideId, s);
    }
    return s;
  };
  let pool = state.pool;
  const label = (sideId: number) => sideLabel(state.selections.find((s) => s.id === sideId)!);
  const where = (loc: Location) => (loc.kind === "pool" ? "the pool" : label(loc.sideId));
  const log: string[] = [];
  const from = r.from;
  let warning: string | null = null;

  if (target.kind === "pool") {
    // Only a side member reaches here (pool → pool is a no-op).
    if (from.kind === "side") slots(from.sideId)[from.index] = emptySlot();
    pool = [...pool, moving];
    log.push(`${moving.displayName} moved from ${where(from)} to the pool`);
  } else {
    const index = r.index!;
    const to = slots(target.sideId);
    const occupant = to[index].member ?? null;
    const occupantId = to[index].memberId;
    if (from.kind === "side") slots(from.sideId)[from.index] = emptySlot();
    else pool = pool.filter((m) => m.id !== memberId);
    to[index] = filledSlot(moving);
    const tLabel = label(target.sideId);

    if (occupantId != null) {
      const occName = occupant?.displayName ?? `Player #${occupantId}`;
      if (from.kind === "side") {
        slots(from.sideId)[from.index] = occupant
          ? filledSlot(occupant)
          : { memberId: occupantId, member: null, gap: null };
        log.push(
          from.sideId === target.sideId
            ? `${moving.displayName} swapped places with ${occName} in ${tLabel}`
            : `${moving.displayName} swapped with ${occName} (${where(from)} ↔ ${tLabel})`,
        );
      } else {
        if (occupant) pool = [...pool, occupant];
        log.push(`${moving.displayName} in to ${tLabel}, ${occName} back to the pool`);
      }
    } else {
      log.push(
        from.kind === "side" && from.sideId === target.sideId
          ? `${moving.displayName} moved within ${tLabel}`
          : `${moving.displayName} moved from ${where(from)} to ${tLabel}`,
      );
    }
    if (from.kind === "pool" || from.sideId !== target.sideId) warning = pickWarning(moving);
  }

  // A role belongs to the side: a captain or keeper who leaves it loses it.
  const touched = [...slotsOf.keys()];
  const selections = state.selections.map((side) => {
    const nextSlots = slotsOf.get(side.id);
    if (!nextSlots) return side;
    const next: SelectionSide = { ...side, slots: nextSlots };
    const inSide = new Set(nextSlots.map((s) => s.memberId).filter((id) => id != null));
    for (const [field, word] of [
      ["captainMemberId", "captain"],
      ["keeperMemberId", "keeper"],
    ] as const) {
      const holder = next[field];
      if (holder != null && !inSide.has(holder)) {
        log.push(
          `${sideLabel(side)} no longer has a ${word} (${nameOf(state, holder)} left the side)`,
        );
        next[field] = null;
      }
    }
    next.warnings = sideWarnings(next);
    return next;
  });

  return { ok: true, state: { selections, pool }, touched, log, warning };
}

/** The `PUT /selection/board` changes for the touched sides. */
export function toChanges(state: BoardState, touched: readonly number[]): SelectionChange[] {
  return state.selections
    .filter((s) => touched.includes(s.id))
    .map((s) => ({
      selectionId: s.id,
      version: s.version,
      slots: s.slots.map((slot) => ({ memberId: slot.memberId, gap: slot.gap })),
      captainMemberId: s.captainMemberId,
      keeperMemberId: s.keeperMemberId,
    }));
}
