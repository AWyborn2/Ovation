import type {
  JuniorAdminTeamListPlayer,
  JuniorTeamListRole,
  PutJuniorTeamListPlayer,
} from "@workspace/api-client-react";

/**
 * The junior team-list editor's row rules (junior PlayHQ sync plan U6). Pure, so
 * they unit-test without rendering. A row is one of the club's junior
 * participants; names are display-only (the API stores participant ids, never
 * names). At most one captain, one vice-captain and one wicket-keeper — the API
 * refuses anything else.
 */

export type JuniorEditorRow = {
  participantId: string;
  name: string;
  shirtNumber: string | null;
  /** Withheld on public pages (shown as "Private Player"). */
  isPrivate: boolean;
  captain: boolean;
  vice: boolean;
  keeper: boolean;
};

export type JuniorRoleKey = "captain" | "vice" | "keeper";

/** Saved players, in order, as editor rows. */
export function rowsFromPlayers(players: readonly JuniorAdminTeamListPlayer[]): JuniorEditorRow[] {
  return [...players]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      participantId: p.participantId,
      name: p.name,
      shirtNumber: p.shirtNumber,
      isPrivate: p.isPrivate,
      captain: p.role === "C" || p.role === "C/WK",
      vice: p.role === "VC" || p.role === "VC/WK",
      keeper: p.role === "WK" || p.role === "C/WK" || p.role === "VC/WK",
    }));
}

/**
 * Toggle a role on row `i`. Turning it on clears it from every other row; captain
 * and vice-captain are exclusive on one row.
 */
export function toggleRole(
  rows: readonly JuniorEditorRow[],
  i: number,
  role: JuniorRoleKey,
): JuniorEditorRow[] {
  const on = !rows[i]?.[role];
  return rows.map((r, idx) => {
    if (idx !== i) return on ? { ...r, [role]: false } : r;
    const next = { ...r, [role]: on };
    if (on && role === "captain") next.vice = false;
    if (on && role === "vice") next.captain = false;
    return next;
  });
}

/** Move row `i` up (-1) or down (+1); the same array when it cannot move. */
export function moveRow(
  rows: readonly JuniorEditorRow[],
  i: number,
  dir: -1 | 1,
): readonly JuniorEditorRow[] {
  const j = i + dir;
  if (i < 0 || i >= rows.length || j < 0 || j >= rows.length) return rows;
  const copy = [...rows];
  [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  return copy;
}

/** Append a player, unless already on the list. */
export function addRow(rows: readonly JuniorEditorRow[], row: JuniorEditorRow): JuniorEditorRow[] {
  if (rows.some((r) => r.participantId === row.participantId)) return [...rows];
  return [...rows, row];
}

export function removeRow(rows: readonly JuniorEditorRow[], i: number): JuniorEditorRow[] {
  return rows.filter((_, idx) => idx !== i);
}

function roleOf(r: JuniorEditorRow): JuniorTeamListRole | null {
  const lead = r.captain ? "C" : r.vice ? "VC" : null;
  if (lead && r.keeper) return lead === "C" ? "C/WK" : "VC/WK";
  return lead ?? (r.keeper ? "WK" : null);
}

/** The PUT body's players: in row order, numbered from 1. */
export function toPayload(rows: readonly JuniorEditorRow[]): PutJuniorTeamListPlayer[] {
  return rows.map((r, i) => {
    const role = roleOf(r);
    return { order: i + 1, participantId: r.participantId, ...(role ? { role } : {}) };
  });
}
