/**
 * Cross-family helpers: grade seniority order, season-grid composition and display-config resolution.
 *
 * Part of the honour-display builder library (see ../honour-display-builders.ts,
 * the barrel). Depends only on the db layer, settings and tenant resolution —
 * never on a request object — so every builder is unit-testable.
 */
import { type BoardDisplayConfigJson } from "@workspace/db";
import { type BoardDisplayOut, type BoardGridOut, type BoardLayout, type GridCellEntryOut, type GridColumnOptionOut, type GridRowOut } from "./types";

// Seniority order for grade-grouped boards (captains, records-by-grade) so they
// roll A Grade → Colts.
export const GRADE_ORDER = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "E Grade",
  "F Grade",
  "Female A Grade",
  "Female B Grade",
  "PPL",
  "Colts",
];
export function gradeRank(g: string): number {
  const i = GRADE_ORDER.indexOf(g);
  return i === -1 ? GRADE_ORDER.length : i;
}

// Generic season-grid composer. Rows are seasons (newest first); columns are
// the supplied {key,label} list in order; each record drops its text (and
// optional playerId) into the (season, colKey) cell, stacking joint holders.
export function composeSeasonGrid(
  rowHeading: string,
  columns: GridColumnOptionOut[],
  records: {
    seasonLabel: string;
    startYear: number;
    colKey: string;
    text: string;
    playerId?: number | null;
  }[],
): BoardGridOut {
  const seasonYear = new Map<string, number>();
  const bySeasonCol = new Map<string, Map<string, GridCellEntryOut[]>>();
  for (const r of records) {
    if (!r.text) continue;
    seasonYear.set(r.seasonLabel, r.startYear);
    let m = bySeasonCol.get(r.seasonLabel);
    if (!m) {
      m = new Map();
      bySeasonCol.set(r.seasonLabel, m);
    }
    let arr = m.get(r.colKey);
    if (!arr) {
      arr = [];
      m.set(r.colKey, arr);
    }
    arr.push({ text: r.text, playerId: r.playerId ?? null });
  }
  const seasons = [...seasonYear.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))
    .map(([label]) => label);
  const rows: GridRowOut[] = seasons.map((s) => {
    const m = bySeasonCol.get(s) ?? new Map<string, GridCellEntryOut[]>();
    return {
      heading: s,
      cells: columns.map((c) => ({ entries: m.get(c.key) ?? [] })),
    };
  });
  return { rowHeading, columnHeadings: columns.map((c) => c.label), rows };
}

export const DEFAULT_DISPLAY: BoardDisplayOut = {
  columns: 1,
  transition: "scroll",
  fit: false,
  wrapBlocks: 2,
};

export function clampWrapBlocks(n: number | null | undefined): number {
  return Math.min(4, Math.max(2, Math.round(n ?? 2)));
}

/** Resolve a board's display config: defaults merged with the admin override. */
export function resolveDisplay(
  layout: BoardLayout,
  override: BoardDisplayConfigJson | undefined,
): BoardDisplayOut {
  // Multi-column flow only makes sense for plain lists; other layouts stay 1.
  const cols =
    layout === "list"
      ? Math.min(3, Math.max(1, Math.round(override?.columns ?? 1)))
      : 1;
  // "wrap" only applies to grid boards; other layouts fall back to a slideshow.
  let transition = override?.transition ?? DEFAULT_DISPLAY.transition;
  if (transition === "wrap" && layout !== "grid") transition = "slide";
  return {
    columns: cols,
    transition,
    fit: override?.fit ?? DEFAULT_DISPLAY.fit,
    wrapBlocks: clampWrapBlocks(override?.wrapBlocks),
  };
}
