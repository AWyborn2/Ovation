/**
 * The shape of a Selection Hub side (ADR-009): how many slots it has, which
 * of them are the XI, which can hold captain or keeper, and whether the last
 * one is "the 12th".
 *
 * Shared by the API (drafts, saves, finalise, team sheet, messages) and the
 * web Hub (moves, the team card), so the two never disagree. Pure: no DB, no
 * React.
 *
 * - A side has 12 to 14 slots. A grade with no size set picks 12.
 * - Slots 1–11 are the XI; the side is complete when they're filled, and the
 *   rest are optional.
 * - At 12, slot 12 is the 12th player: labelled "12th" and holding no role.
 * - Above 12, the extra players are interchange players: numbered 1–N with no
 *   label, and any slot can hold captain or keeper.
 */

/** Players in a side when its grade has no size set: the XI plus an optional 12th. */
export const DEFAULT_SIDE_SIZE = 12;

/** The most players a side can have. */
export const MAX_SIDE_SIZE = 14;

/** The playing XI: slots 1–11. */
export const XI_SIZE = 11;

export type SideShape = {
  /** Slots in the side, 12–14. */
  size: number;
  /** Slots in the XI (always 11). */
  xi: number;
  /** Optional slots after the XI: 1 at 12, up to 3 at 14. */
  extras: number;
  /** The last slot is "the 12th" (only at 12). */
  twelfthLabel: boolean;
  /** The 12th player's slot (zero-based), or null when the side has none. */
  twelfthIndex: number | null;
  /** Leading slots whose member can be captain or keeper: the XI at 12, every slot above. */
  roleSlots: number;
};

/** A stored or configured side size as 12–14; anything else (null, 11, 15, 12.5) reads as 12. */
export function resolveSideSize(raw: unknown): number {
  return typeof raw === "number" &&
    Number.isInteger(raw) &&
    raw >= DEFAULT_SIDE_SIZE &&
    raw <= MAX_SIDE_SIZE
    ? raw
    : DEFAULT_SIDE_SIZE;
}

/** The slots, labels and role rules for a side of `size` players (12 when unset). */
export function sideShape(size?: number | null): SideShape {
  const n = resolveSideSize(size);
  const twelfthLabel = n === DEFAULT_SIDE_SIZE;
  return {
    size: n,
    xi: XI_SIZE,
    extras: n - XI_SIZE,
    twelfthLabel,
    twelfthIndex: twelfthLabel ? XI_SIZE : null,
    roleSlots: twelfthLabel ? XI_SIZE : n,
  };
}

/**
 * A stored or submitted side padded with open slots to `size` (12 when
 * unset). Sides saved before the 12th player have 11; they read as an empty
 * 12th. Filled slots are never cut off: a side longer than `size` keeps every
 * slot, for the caller to flag. Every reader and writer of `selections.slots`
 * goes through this.
 */
export function normaliseSlots<T extends { memberId: number | null }>(
  slots: readonly T[],
  size?: number | null,
): T[] {
  const n = resolveSideSize(size);
  const out = [...slots];
  while (out.length < n) out.push({ memberId: null } as T);
  return out;
}

/** The 12th player's member id, or null when the slot is open or the side has no 12th (above 12). */
export function twelfthMemberId(
  slots: readonly { memberId: number | null }[],
  size?: number | null,
): number | null {
  const { twelfthIndex } = sideShape(size);
  return twelfthIndex == null ? null : (slots[twelfthIndex]?.memberId ?? null);
}

/** The members who can be captain or keeper: those in the side's first `roleSlots` slots. */
export function roleMemberIds(
  slots: readonly { memberId: number | null }[],
  size?: number | null,
): Set<number> {
  const { roleSlots } = sideShape(size);
  return new Set(
    slots.slice(0, roleSlots).flatMap((s) => (s.memberId != null ? [s.memberId] : [])),
  );
}
