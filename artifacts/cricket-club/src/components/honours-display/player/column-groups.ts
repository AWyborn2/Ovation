import type { DisplayBoard } from "../types";

/** A run of a board's columns shown together on one screen. */
export interface ColumnGroup {
  start: number;
  count: number;
}

/**
 * Split `total` columns into balanced screens of at most `perScreen` columns:
 * 8 at 4 → 4+4, 5 at 4 → 3+2, 7 at 3 → 3+2+2. A board that fits is one group.
 */
export function splitColumnGroups(total: number, perScreen: number): ColumnGroup[] {
  const per = Math.max(1, Math.floor(perScreen));
  if (total <= per) return [{ start: 0, count: Math.max(0, total) }];
  const screens = Math.ceil(total / per);
  const base = Math.floor(total / screens);
  const extra = total % screens;
  const out: ColumnGroup[] = [];
  let start = 0;
  for (let i = 0; i < screens; i++) {
    const count = base + (i < extra ? 1 : 0);
    out.push({ start, count });
    start += count;
  }
  return out;
}

/** A composite board's leading "Season" column, which every screen keeps. */
function seasonColumnCount(board: DisplayBoard): number {
  return board.layout === "columns" && board.columns?.[0]?.heading === "Season" ? 1 : 0;
}

/**
 * Headings of the columns that split into groups (a season grid's columns, or a
 * composite board's columns after its leading "Season" column). Group indices
 * count these; other layouts have none.
 */
export function boardColumnHeadings(board: DisplayBoard): string[] {
  if (board.layout === "grid") return board.grid?.columnHeadings ?? [];
  if (board.layout === "columns") {
    return (board.columns ?? []).slice(seasonColumnCount(board)).map((c) => c.heading);
  }
  return [];
}

/**
 * The range a group covers, for the board's subtitle: "First to Fourth Grade"
 * (a shared " Grade" suffix is said once), "President to Treasurer", or the one
 * heading when the group has a single column.
 */
export function columnGroupLabel(headings: string[], group: ColumnGroup): string {
  const first = headings[group.start];
  const last = headings[group.start + group.count - 1];
  if (!first || !last) return "";
  if (group.count === 1) return first;
  const suffix = " Grade";
  if (first.endsWith(suffix) && last.endsWith(suffix)) {
    return `${first.slice(0, -suffix.length)} to ${last}`;
  }
  return `${first} to ${last}`;
}

/**
 * The board narrowed to one group's columns. Season grids keep their row
 * heading (the season) and drop the other columns' cells; composite column
 * boards keep a leading "Season" column on every screen.
 */
export function sliceBoardColumns(board: DisplayBoard, group: ColumnGroup): DisplayBoard {
  const end = group.start + group.count;
  if (board.layout === "grid" && board.grid) {
    const g = board.grid;
    return {
      ...board,
      grid: {
        ...g,
        columnHeadings: g.columnHeadings.slice(group.start, end),
        rows: g.rows.map((r) => ({ ...r, cells: r.cells.slice(group.start, end) })),
      },
    };
  }
  if (board.layout === "columns" && board.columns) {
    const lead = seasonColumnCount(board);
    return {
      ...board,
      columns: [
        ...board.columns.slice(0, lead),
        ...board.columns.slice(lead + group.start, lead + end),
      ],
    };
  }
  return board;
}

/** Names longer than this become initial and surname on a dense screen. */
const COMPACT_NAME_OVER = 12;

/**
 * "Jonathan Prendergast" → "J. Prendergast" when longer than
 * COMPACT_NAME_OVER; shorter names, single words and text that isn't a name
 * (a "—" or a figure) are kept as they are.
 */
export function compactName(name: string): string {
  const text = name.trim();
  if (text.length <= COMPACT_NAME_OVER) return text;
  const words = text.split(/\s+/);
  if (words.length < 2 || !/^\p{L}/u.test(words[0]!)) return text;
  return `${words[0]![0]!.toUpperCase()}. ${words.slice(1).join(" ")}`;
}

const ORDINALS: Readonly<Record<string, string>> = {
  first: "1st",
  second: "2nd",
  third: "3rd",
  fourth: "4th",
  fifth: "5th",
  sixth: "6th",
  seventh: "7th",
  eighth: "8th",
  ninth: "9th",
  tenth: "10th",
};

/** "First Grade" → "1st Grade": ordinal words as numerals for a narrow heading. */
export function compactHeading(heading: string): string {
  return heading.replace(/\b[A-Za-z]+\b/g, (w) => ORDINALS[w.toLowerCase()] ?? w);
}

/**
 * A screen showing KIOSK_DENSE_COLUMNS or more columns (honours kiosk: up to
 * 10 across): long names as initial and surname, ordinal grade headings as
 * numerals. Other boards are returned unchanged.
 */
export function compactBoard(board: DisplayBoard): DisplayBoard {
  if (board.layout === "grid" && board.grid) {
    const g = board.grid;
    return {
      ...board,
      grid: {
        ...g,
        columnHeadings: g.columnHeadings.map(compactHeading),
        rows: g.rows.map((r) => ({
          ...r,
          cells: r.cells.map((c) => ({
            ...c,
            entries: c.entries.map((e) => ({ ...e, text: compactName(e.text) })),
          })),
        })),
      },
    };
  }
  if (board.layout === "columns" && board.columns) {
    const lead = seasonColumnCount(board);
    return {
      ...board,
      columns: board.columns.map((col, i) =>
        i < lead
          ? col
          : {
              ...col,
              heading: compactHeading(col.heading),
              entries: col.entries.map((e) => ({ ...e, primaryText: compactName(e.primaryText) })),
            },
      ),
    };
  }
  return board;
}
