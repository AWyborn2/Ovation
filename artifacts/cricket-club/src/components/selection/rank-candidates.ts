import type { SelectionMember, SelectionSide } from "@workspace/api-client-react";
import { sideLabel } from "./apply-move";

export type Candidate = {
  member: SelectionMember;
  /** The other sides this player is already in ("C Grade"). */
  alsoIn: string[];
};

const STATUS_RANK: Record<SelectionMember["status"], number> = {
  yes: 0,
  maybe: 1,
  none: 2,
  no: 3,
};

/** Rows the fill popover lists at most. */
export const MAX_CANDIDATES = 8;

/**
 * Who could fill a slot in `sideId`, best first: available before maybe, no
 * reply and unavailable; then players not yet in a side before those already
 * picked elsewhere; then those who last played this grade; then by name. A
 * player already in this side is left out. `query` filters by name.
 */
export function rankCandidates(
  pool: readonly SelectionMember[],
  sides: readonly SelectionSide[],
  sideId: number,
  query = "",
  limit = MAX_CANDIDATES,
): Candidate[] {
  const side = sides.find((s) => s.id === sideId);
  if (!side) return [];
  const grade = sideLabel(side);
  const inThisSide = new Set(side.slots.map((s) => s.memberId).filter((id) => id != null));
  const placedIn = new Map<number, string[]>();
  for (const s of sides) {
    if (s.id === sideId) continue;
    for (const slot of s.slots) {
      if (slot.memberId == null) continue;
      placedIn.set(slot.memberId, [...(placedIn.get(slot.memberId) ?? []), sideLabel(s)]);
    }
  }
  const q = query.trim().toLowerCase();
  return pool
    .filter((m) => !inThisSide.has(m.id) && (!q || m.displayName.toLowerCase().includes(q)))
    .map((member) => ({ member, alsoIn: placedIn.get(member.id) ?? [] }))
    .sort(
      (a, b) =>
        STATUS_RANK[a.member.status] - STATUS_RANK[b.member.status] ||
        Number(a.alsoIn.length > 0) - Number(b.alsoIn.length > 0) ||
        Number(a.member.lastGrade !== grade) - Number(b.member.lastGrade !== grade) ||
        a.member.displayName.localeCompare(b.member.displayName),
    )
    .slice(0, limit);
}
