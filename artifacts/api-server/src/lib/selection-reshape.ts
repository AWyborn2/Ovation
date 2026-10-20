import type { SelectionRow, SelectionSlot } from "@workspace/db";
import { normaliseSlots, roleMemberIds, sideShape } from "@workspace/scorecard/selection-shape";

/**
 * Bring an unfinalised draft into line with its grade's current side rules
 * (ADR-009 amendment, 20 Oct 2026): the Hub always shows a draft at the size
 * and format the grade is set to now, so raising a grade to 13 or 14 adds the
 * slots, and switching a grade of 12 between "XI + 12th" and "numbered 1–12"
 * relabels the side. Pure; the caller writes the result.
 *
 * Nobody is ever removed: a draft shrinks only when the slots it loses are
 * empty (no member and no PlayHQ gap). Otherwise it keeps its size and the
 * board's `overSize` warning asks the selector to move players out. A captain
 * or keeper left outside the new role slots (slot 12 when the side goes back
 * to XI + 12th) loses the role, as a save would.
 */
export type SideFormat = { sideSize: number; allPlay: boolean };

export type Reshape = SideFormat & {
  slots: SelectionSlot[];
  captainMemberId: number | null;
  keeperMemberId: number | null;
  from: SideFormat;
  rolesCleared: { role: "captain" | "keeper"; memberId: number; twelfth?: true }[];
};

const formatOf = (spec: Parameters<typeof sideShape>[0]): SideFormat => {
  const shape = sideShape(spec);
  return { sideSize: shape.size, allPlay: shape.size === 12 && !shape.twelfthLabel };
};

const isEmpty = (s: SelectionSlot) => s.memberId == null && !s.gap;

/** The draft reshaped to `target`, or null when it already matches (or can't change). */
export function reshapeDraft(
  side: Pick<
    SelectionRow,
    "slots" | "sideSize" | "allPlay" | "captainMemberId" | "keeperMemberId" | "state"
  >,
  target: SideFormat,
): Reshape | null {
  if (side.state === "final") return null;
  const from = formatOf(side);
  const want = formatOf(target);
  const current = normaliseSlots(side.slots, from.sideSize);

  let size = want.sideSize;
  if (size < current.length && !current.slice(size).every(isEmpty)) {
    // Players sit in the slots a smaller side would drop: keep the size and let
    // the board's over-size warning ask for them to be moved out.
    size = current.length;
  }
  const next = formatOf({ sideSize: size, allPlay: want.allPlay });
  if (next.sideSize === from.sideSize && next.allPlay === from.allPlay) return null;

  const slots = normaliseSlots(current.slice(0, size), size);
  const roleIds = roleMemberIds(slots, next);
  const twelfthIndex = sideShape(next).twelfthIndex;
  const rolesCleared: Reshape["rolesCleared"] = [];
  const keep = (role: "captain" | "keeper", id: number | null) => {
    if (id == null || roleIds.has(id)) return id;
    const twelfth = twelfthIndex != null && slots[twelfthIndex]?.memberId === id;
    rolesCleared.push({ role, memberId: id, ...(twelfth ? { twelfth: true as const } : {}) });
    return null;
  };
  return {
    ...next,
    slots,
    captainMemberId: keep("captain", side.captainMemberId),
    keeperMemberId: keep("keeper", side.keeperMemberId),
    from,
    rolesCleared,
  };
}
