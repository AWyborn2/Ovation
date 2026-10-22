/**
 * Polish every converted look shares: the parts of the pack skeletons that
 * format v2 can't take over as they are.
 */
import type { TemplateDocumentV2 } from "@workspace/scorecard/kind-templates";
import {
  chipCell,
  editRows,
  gradeOnRoundLine,
  uniformSponsorGrid,
  type GridRegion,
} from "./helpers";

export interface SharedPolish {
  /** The pack's sponsors grid region per size (its major tiles over a 3 × 3 grid). */
  sponsorGrid: GridRegion;
  /** Tile gap in px at 1080 wide. */
  gapPx: number;
  /** Weekend Wrap's WON / DRAW chip fill (LOST stays plain). */
  chipFill: string;
}

/** The skeleton's sponsors grid region (Gold Foil, Neon Night and Bold Type's square). */
export const SKELETON_GRID: GridRegion = {
  square: { x: 22.28, y: 32.05, w: 55.45, h: 28.58 },
  portrait: { x: 13.04, y: 31.12, w: 73.91, h: 30.49 },
  story: { x: 13.04, y: 51.57, w: 73.91, h: 21.44 },
  landscape: { x: 37.91, y: 38.73, w: 24.19, h: 17.14 },
};

/** The shared polish for one kind's document. */
export function sharedPolish(doc: TemplateDocumentV2, kind: string, opts: SharedPolish): string[] {
  const notes: string[] = [];
  if (kind === "matchDay") {
    notes.push(...gradeOnRoundLine(doc));
    notes.push(
      ...uniformSponsorGrid(doc, {
        region: opts.sponsorGrid,
        columns: 3,
        rows: 4,
        gapPx: opts.gapPx,
        tile: "var(--accent-ink)",
        inset: { x: 18, y: 12 },
      }),
    );
  }
  if (kind === "weekendWrap")
    notes.push(
      ...chipCell(doc, "matches", "outcome", {
        fill: opts.chipFill,
        padX: 0.8,
        y: 37,
        h: 26,
        plain: ["lost"],
      }),
    );
  for (const repeat of ["matches", "leaders"]) {
    const n = editRows(doc, repeat, (rows) => {
      for (const cell of rows.cells)
        if (cell.field === "gradeLabel" && !cell.show && cell.style)
          cell.style = { ...cell.style, align: "left" };
    });
    if (n) notes.push(`${repeat}.gradeLabel: left-aligned, so a long grade clips at its end`);
  }
  return notes;
}
