import type { DisplayBoardLayout } from "@workspace/api-client-react";

/**
 * Pure helpers for the kiosk rotation builder (honours kiosk redesign B2).
 *
 * The rotation is stored as the existing `kiosk_sequence`: an ordered list of
 * tokens, each a board id, "sponsor" (the sponsor wall) or "ad:<id>" (an
 * advert). The same token may appear more than once.
 */

export type RotationItemKind = "board" | "sponsor" | "ad";

export function rotationItemKind(token: string): RotationItemKind {
  if (token === "sponsor") return "sponsor";
  if (token.startsWith("ad:")) return "ad";
  return "board";
}

export const ROTATION_KIND_LABEL: Readonly<Record<RotationItemKind, string>> = {
  board: "Board",
  sponsor: "Sponsor wall",
  ad: "Ad",
};

export const BOARD_LAYOUT_LABEL: Readonly<Record<DisplayBoardLayout, string>> = {
  premiership: "Plaques",
  teamOfDecade: "Team",
  list: "List",
  columns: "Composite columns",
  grid: "Season grid",
  lifeMembers: "Life members",
  leaderboard: "Leaderboard",
  achievements: "Achievement list",
};

/** The list with the item at `from` moved to index `to` (clamped). */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list.slice();
  const target = Math.max(0, Math.min(list.length - 1, to));
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved as T);
  return next;
}

/** The list with a copy of the item at `idx` placed straight after it. */
export function duplicateItem<T>(list: readonly T[], idx: number): T[] {
  if (idx < 0 || idx >= list.length) return list.slice();
  const next = list.slice();
  next.splice(idx + 1, 0, list[idx] as T);
  return next;
}

/**
 * Where a dragged row lands: dropping on the top half of row `over` puts it
 * before that row, the bottom half after it. Returns the final index.
 */
export function dropIndex(from: number, over: number, after: boolean): number {
  const slot = after ? over + 1 : over;
  return from < slot ? slot - 1 : slot;
}
