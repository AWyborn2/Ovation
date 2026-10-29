/**
 * A tiled logo grid (`rows.layout: "tiles"`, Halls Head's sponsors page, Oct
 * 2026): a list's rows drawn as logo tiles that fill the layer's box. Major
 * rows (the `major` variant) are {@link MAJOR_TILE_SCALE}× the others, in their
 * own rows above them; the columns are chosen to make the tiles as large as
 * the box allows, up to a cap, so one sponsor or twelve both fill the space
 * and stay legible. Each line is centred, and the whole grid sits centred in
 * the box. Pure: the renderer places the tiles it returns.
 */

/** A tile's width over its height (sponsor logos are wide). */
export const TILE_ASPECT = 2;
/** Major tiles are this much larger than standard ones. */
export const MAJOR_TILE_SCALE = 1.6;
/** The most tiles one sponsors page holds; the carousel puts more on another slide. */
export const SPONSOR_TILES_PER_PAGE = 12;
/** The most tiles a line holds, however wide the box. */
const MAX_COLS = 6;

export interface TileGridInput {
  /** Tiles to place; the first `majors` are major. */
  count: number;
  majors: number;
  /** The box, in any one unit (pixels). */
  width: number;
  height: number;
  /** Space between tiles, across and down. */
  gap: number;
  /** The tallest a standard tile may be (major tiles: × MAJOR_TILE_SCALE). */
  maxTileHeight: number;
}

export type TileRect = { x: number; y: number; w: number; h: number };

/** Where each tile goes, in the box's unit, in row order (majors first). */
export function tileGrid(input: TileGridInput): TileRect[] {
  const count = Math.max(0, Math.floor(input.count));
  if (count === 0 || !(input.width > 0) || !(input.height > 0)) return [];
  const majors = Math.max(0, Math.min(count, Math.floor(input.majors)));
  const rest = count - majors;
  const gap = Math.max(0, input.gap);
  const { width, height } = input;
  const across = (cols: number, scale: number) =>
    (width - (cols - 1) * gap) / (cols * TILE_ASPECT * scale);
  let best: { unit: number; mCols: number; sCols: number; lines: number } | null = null;
  // Two or more majors sit side by side, never one a line.
  const mFrom = majors ? Math.min(majors, 2) : 0;
  for (let mCols = mFrom; mCols <= Math.min(majors, MAX_COLS); mCols++)
    for (let sCols = rest ? 1 : 0; sCols <= Math.min(rest, MAX_COLS); sCols++) {
      const mRows = mCols ? Math.ceil(majors / mCols) : 0;
      const sRows = sCols ? Math.ceil(rest / sCols) : 0;
      const lines = mRows + sRows;
      const unit = Math.min(
        input.maxTileHeight,
        (height - (lines - 1) * gap) / (MAJOR_TILE_SCALE * mRows + sRows),
        mCols ? across(mCols, MAJOR_TILE_SCALE) : Infinity,
        sCols ? across(sCols, 1) : Infinity,
      );
      // The largest tiles win; at the same size (the cap), fewer lines.
      const tie = best && Math.abs(unit - best.unit) <= best.unit * 1e-3;
      if (!best || (!tie && unit > best.unit) || (tie && lines < best.lines))
        best = { unit, mCols, sCols, lines };
    }
  const unit = Math.max(0, best!.unit);
  // Lines of tiles: each as even as the columns allow (6 over 4 columns is 3 + 3).
  const lines: Array<{ n: number; h: number }> = [];
  const split = (n: number, cols: number, h: number) => {
    const rows = Math.ceil(n / cols);
    for (let r = 0; r < rows; r++)
      lines.push({ n: Math.floor(n / rows) + (r < n % rows ? 1 : 0), h });
  };
  if (majors) split(majors, best!.mCols, unit * MAJOR_TILE_SCALE);
  if (rest) split(rest, best!.sCols, unit);
  const total = lines.reduce((s, l) => s + l.h, 0) + (lines.length - 1) * gap;
  let y = Math.max(0, (height - total) / 2);
  const out: TileRect[] = [];
  for (const line of lines) {
    const w = line.h * TILE_ASPECT;
    let x = (width - (line.n * w + (line.n - 1) * gap)) / 2;
    for (let i = 0; i < line.n; i++) {
      out.push({ x, y, w, h: line.h });
      x += w + gap;
    }
    y += line.h + gap;
  }
  return out;
}
