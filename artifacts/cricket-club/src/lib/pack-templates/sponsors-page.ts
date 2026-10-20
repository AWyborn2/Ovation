/**
 * The Match Day sponsors page's layout (ADR-010 P6), shared by Club Kit and
 * the skeleton packs (Broadcast Dark): the logo grid, tiered when major
 * sponsors print larger, and the height the optional blocks (thank-you, next
 * home game, socials) take from it. Pure string and number work; each pack
 * supplies its own type and colours.
 *
 * With no optional block on, the grid is the page as it was, byte for byte.
 */

import { slot } from "./shared";

/** What a sponsors page lays out, from its card input (`carouselPage`). */
export interface SponsorsPageLayout {
  count: number;
  /** The first `majorCount` sponsors are major (tiered grid on); 0 = one flat grid. */
  majorCount: number;
  thankYou: boolean;
  cta: boolean;
  nextHome: boolean;
  socials: boolean;
}

export const FLAT_SPONSORS_PAGE: Omit<SponsorsPageLayout, "count"> = {
  majorCount: 0,
  thankYou: false,
  cta: false,
  nextHome: false,
  socials: false,
};

/** The layout a sponsors page's input asks for. */
export function sponsorsPageLayout(page: {
  sponsors: readonly unknown[];
  majorCount?: number;
  thankYou?: string;
  cta?: string;
  nextHome?: { match: string; when: string };
  socials?: string;
}): SponsorsPageLayout {
  const count = page.sponsors.length;
  return {
    count,
    majorCount: Math.max(0, Math.min(count, Math.floor(page.majorCount ?? 0))),
    thankYou: !!page.thankYou,
    cta: !!page.cta,
    nextHome: !!page.nextHome?.match,
    socials: !!page.socials,
  };
}

/** A page with no optional block on: laid out exactly as before P6. */
export function isFlatSponsorsPage(layout: SponsorsPageLayout): boolean {
  return (
    !layout.majorCount && !layout.thankYou && !layout.cta && !layout.nextHome && !layout.socials
  );
}

/** Major tiles are this much taller (and wider) than standard ones. */
export const MAJOR_SCALE = 1.6;

/** Height (cqmin) each optional block takes from the grid, per pack. */
export interface SponsorsPageBudget {
  thankYou: number;
  cta: number;
  nextHome: number;
  socials: number;
  /** The grid never shrinks below this, however many blocks are on. */
  minGrid: number;
}

/** The grid height left once the optional blocks have theirs. */
export function sponsorGridHeight(
  base: number,
  layout: SponsorsPageLayout,
  budget: SponsorsPageBudget,
): number {
  const used =
    (layout.thankYou ? budget.thankYou : 0) +
    (layout.cta ? budget.cta : 0) +
    (layout.nextHome ? budget.nextHome : 0) +
    (layout.socials ? budget.socials : 0);
  return used ? Math.max(budget.minGrid, base - used) : base;
}

export interface GridMetrics {
  cols: number;
  rows: number;
  /** Tile height in cqmin (tiles are 2:1). */
  tileHeight: number;
  /** The grid's max width in cqmin. */
  width: number;
}

/**
 * Tile sizes for the grid. Flat: the page as it was (every tile one size, the
 * grid's width bounding its height). Tiered: major tiles {@link MAJOR_SCALE}×
 * the standard ones, in their own rows above, sharing the same height.
 */
export function sponsorGridMetrics(opts: {
  count: number;
  majorCount: number;
  height: number;
  gap: number;
  /** Columns for a flat grid of n logos (each pack's own rule). */
  cols: (n: number) => number;
  /** Columns for the major row (2 on tall cards, up to 3 on wide ones). */
  majorCols: number;
  maxWidth?: number;
  /**
   * The width (cqmin) the grid may fill. Given, the columns are chosen to make
   * the tiles as large as the height and this width allow (a page with an
   * optional block on has less height, so it trades rows for columns).
   * Absent, the pack's own column rule applies (the page as it was).
   */
  fitWidth?: number;
}): { major: GridMetrics | null; standard: GridMetrics | null } {
  const { count, height, gap } = opts;
  const majorCount = Math.min(opts.majorCount, count);
  const cap = (w: number) => (opts.maxWidth == null ? w : Math.min(w, opts.maxWidth));
  if (opts.fitWidth != null && count) return fitGrid({ ...opts, majorCount }, opts.fitWidth, cap);
  if (!majorCount) {
    const cols = opts.cols(count);
    const rows = Math.max(1, Math.ceil(count / cols));
    const tileHeight = Math.max(1, (height - Math.max(0, rows - 1) * gap) / Math.max(rows, 1));
    return {
      major: null,
      standard: { cols, rows, tileHeight, width: cap(tileHeight * 2 * cols + (cols - 1) * gap) },
    };
  }
  const rest = count - majorCount;
  const mCols = Math.max(1, Math.min(majorCount, opts.majorCols));
  const mRows = Math.ceil(majorCount / mCols);
  const sCols = rest ? opts.cols(rest) : 1;
  const sRows = rest ? Math.ceil(rest / sCols) : 0;
  // Every gap between rows, plus one between the two grids.
  const gaps = (mRows - 1) * gap + (sRows ? sRows * gap : 0);
  const unit = Math.max(1, (height - gaps) / (MAJOR_SCALE * mRows + sRows));
  const mTile = unit * MAJOR_SCALE;
  return {
    major: {
      cols: mCols,
      rows: mRows,
      tileHeight: mTile,
      width: cap(mTile * 2 * mCols + (mCols - 1) * gap),
    },
    standard: rest
      ? {
          cols: sCols,
          rows: sRows,
          tileHeight: unit,
          width: cap(unit * 2 * sCols + (sCols - 1) * gap),
        }
      : null,
  };
}

const MAX_COLS = 8;

/**
 * The columns (major and standard) that give the largest tiles: the tile is
 * bounded by the height shared by every row and by each grid's width.
 */
function fitGrid(
  opts: { count: number; majorCount: number; height: number; gap: number },
  fitWidth: number,
  cap: (w: number) => number,
): { major: GridMetrics | null; standard: GridMetrics | null } {
  const { count, majorCount, height, gap } = opts;
  const rest = count - majorCount;
  const across = (cols: number) => (fitWidth - (cols - 1) * gap) / (2 * cols);
  let best: { unit: number; mCols: number; sCols: number; rows: number } | null = null;
  // Two or more major sponsors sit side by side, never stacked one per row.
  for (let mCols = Math.min(majorCount, 2); mCols <= Math.min(majorCount, MAX_COLS); mCols++)
    for (let sCols = rest ? 1 : 0; sCols <= Math.min(rest, MAX_COLS); sCols++) {
      const mRows = mCols ? Math.ceil(majorCount / mCols) : 0;
      const sRows = sCols ? Math.ceil(rest / sCols) : 0;
      const rows = MAJOR_SCALE * mRows + sRows;
      const gaps = Math.max(0, mRows + sRows - 1) * gap;
      const unit = Math.min(
        (height - gaps) / rows,
        mCols ? across(mCols) / MAJOR_SCALE : Infinity,
        sCols ? across(sCols) : Infinity,
      );
      // The largest tiles win; on a tie (a width-bound major row), fewer rows.
      const tie = best && Math.abs(unit - best.unit) <= best.unit * 1e-3;
      if (!best || (!tie && unit > best.unit) || (tie && mRows + sRows < best.rows))
        best = { unit, mCols, sCols, rows: mRows + sRows };
    }
  const { mCols, sCols } = best!;
  const unit = Math.max(1, best!.unit);
  const grid = (cols: number, n: number, tile: number): GridMetrics => ({
    cols,
    rows: Math.ceil(n / cols),
    tileHeight: tile,
    width: cap(tile * 2 * cols + (cols - 1) * gap),
  });
  return {
    major: majorCount ? grid(mCols, majorCount, unit * MAJOR_SCALE) : null,
    standard: rest ? grid(sCols, rest, unit) : null,
  };
}

/** One grid of logo tiles, for sponsors `from`..`from + n - 1`. */
function gridHtml(
  m: GridMetrics,
  from: number,
  n: number,
  gap: number,
  line: string,
  role: "1" | "major" | "standard",
  marginTop: string,
): string {
  return (
    `<div data-weekend-sponsor-grid="${role}" style="display:flex;flex-wrap:wrap;justify-content:center;gap:${gap}cqmin;width:100%;max-width:${m.width}cqmin;align-self:center;flex:none;margin-top:${marginTop}">` +
    Array.from({ length: n }, (_, k) => {
      const i = from + k;
      return (
        `<div data-weekend-sponsor="${i}" data-sponsor-logo-frame="1" data-drop-if-empty="weekendSponsor${i}" style="flex:0 0 calc((100% - ${(m.cols - 1) * gap}cqmin) / ${m.cols});aspect-ratio:2 / 1;box-sizing:border-box;display:flex;align-items:center;justify-content:center;padding:.9cqmin;background:#fff;border:1px solid ${line};min-width:0;overflow:hidden">` +
        slot(`weekendSponsor${i}`, "sponsor") +
        `</div>`
      );
    }).join("") +
    "</div>"
  );
}

/** The logo grid (flat or tiered) for a sponsors page; "" when there are no sponsors. */
export function sponsorGridsHtml(opts: {
  count: number;
  majorCount: number;
  height: number;
  gap: number;
  cols: (n: number) => number;
  majorCols: number;
  maxWidth?: number;
  fitWidth?: number;
  /** Tile border colour. */
  line: string;
}): string {
  if (!opts.count) return "";
  const { major, standard } = sponsorGridMetrics(opts);
  const majorCount = major ? Math.min(opts.majorCount, opts.count) : 0;
  if (!major) return gridHtml(standard!, 0, opts.count, opts.gap, opts.line, "1", "3cqmin");
  return (
    gridHtml(major, 0, majorCount, opts.gap, opts.line, "major", "3cqmin") +
    (standard
      ? gridHtml(
          standard,
          majorCount,
          opts.count - majorCount,
          opts.gap,
          opts.line,
          "standard",
          `${opts.gap}cqmin`,
        )
      : "")
  );
}

/** Fields the sponsors page's optional blocks bind (bind.ts sets them all). */
export const SPONSORS_PAGE_TEXT_FIELDS = [
  "sponsorThanks",
  "sponsorCta",
  "nextHomeMatch",
  "nextHomeWhen",
  "sponsorSocials",
] as const;
