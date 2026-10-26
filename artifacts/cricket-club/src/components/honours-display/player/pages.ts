import type { DisplayBoard } from "../types";

/**
 * Paging works in "rows": the unit that moves together on screen. A season
 * grid row, a line of a list (one entry per list column), a row of plaques or
 * life-member cards (`columnsPerScreen` across), or a composite board's row.
 */

/** How many items sit side by side in one row for this layout. */
function itemsPerRow(board: DisplayBoard, columnsPerScreen: number): number {
  switch (board.layout) {
    case "list":
    case "premiership":
    case "lifeMembers":
      return Math.max(1, columnsPerScreen);
    default:
      return 1;
  }
}

/** Number of rows the board has. */
export function boardRowCount(board: DisplayBoard, columnsPerScreen: number): number {
  switch (board.layout) {
    case "grid":
      return board.grid?.rows.length ?? 0;
    case "columns":
      return (board.columns ?? []).reduce((m, c) => Math.max(m, c.entries.length), 0);
    default:
      return Math.ceil(board.entries.length / itemsPerRow(board, columnsPerScreen));
  }
}

/** The board cut down to rows [from, to). */
export function sliceBoardRows(
  board: DisplayBoard,
  from: number,
  to: number,
  columnsPerScreen: number,
): DisplayBoard {
  switch (board.layout) {
    case "grid":
      return board.grid
        ? { ...board, grid: { ...board.grid, rows: board.grid.rows.slice(from, to) } }
        : board;
    case "columns":
      return {
        ...board,
        columns: (board.columns ?? []).map((c) => ({ ...c, entries: c.entries.slice(from, to) })),
      };
    default: {
      const per = itemsPerRow(board, columnsPerScreen);
      return { ...board, entries: board.entries.slice(from * per, to * per) };
    }
  }
}

/** Row ranges for pages of `perPage` rows. */
export function pageRanges(rowCount: number, perPage: number): [number, number][] {
  const per = Math.max(1, Math.floor(perPage));
  const out: [number, number][] = [];
  for (let i = 0; i < rowCount; i += per) out.push([i, Math.min(rowCount, i + per)]);
  return out.length ? out : [[0, 0]];
}

/** A rendered row item's vertical extent, relative to the top of the board body. */
export interface RowBox {
  top: number;
  bottom: number;
}

/**
 * How many whole rows fit in `height`, from the rendered items. Items whose
 * tops are within a pixel are one row (plaques side by side); a row fits when
 * its lowest item does. Always at least 1, so a giant row still gets a page
 * of its own; the player then scales that page down to fit (`fitToBody`)
 * rather than clipping it.
 */
export function rowsThatFit(items: RowBox[], height: number): number {
  const rows: RowBox[] = [];
  for (const it of [...items].sort((a, b) => a.top - b.top)) {
    const row = rows.find((r) => Math.abs(r.top - it.top) <= 1);
    if (row) row.bottom = Math.max(row.bottom, it.bottom);
    else rows.push({ ...it });
  }
  let n = 0;
  for (const r of rows) {
    if (r.bottom > height + 0.5) break;
    n++;
  }
  return Math.max(1, n);
}
