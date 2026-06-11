import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { DisplayBoard, HonourBrand, BoardDisplayConfig } from "./types";
import { LIST_PAGE_SIZE } from "./types";
import { boardStyle, boardClasses } from "./theme";
import {
  PremiershipBoard,
  TeamOfDecadeBoard,
  ListBoard,
  ColumnsBoard,
  GridBoard,
} from "./templates";

interface BoardRendererProps {
  board: DisplayBoard;
  brand: HonourBrand;
  /** Kiosk mode: disable links/pagination and show every row (scrolled). */
  kiosk?: boolean;
  /** Per-board admin config (styling, logo, heading/subtitle overrides). */
  cfg?: BoardDisplayConfig | null;
}

/**
 * Each board renders in its NATURAL layout (premiership / team-of-decade /
 * list / columns / grid). The club-wide skin is applied once at the `.hb` root;
 * this dispatches on `board.layout`, paginates long list boards interactively,
 * and applies per-board styling (font/background via vars, text size + density
 * via classes). Boards with no admin config render exactly as before (no
 * wrapper), so built-in skins stay pixel-identical.
 */
export function BoardRenderer({ board, brand, kiosk, cfg }: BoardRendererProps) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [board.id]);

  const style = boardStyle(cfg);
  const cls = boardClasses(cfg);
  const wrap = (node: ReactNode): ReactNode =>
    style || cls ? (
      <div className={cls || undefined} style={style}>
        {node}
      </div>
    ) : (
      <>{node}</>
    );

  if (board.layout === "premiership") {
    return wrap(
      <PremiershipBoard board={board} brand={brand} kiosk={kiosk} cfg={cfg} />,
    );
  }
  if (board.layout === "teamOfDecade") {
    return wrap(
      <TeamOfDecadeBoard board={board} brand={brand} kiosk={kiosk} cfg={cfg} />,
    );
  }
  if (board.layout === "columns") {
    return wrap(
      <ColumnsBoard board={board} brand={brand} kiosk={kiosk} cfg={cfg} />,
    );
  }
  if (board.layout === "grid") {
    return wrap(
      <GridBoard board={board} brand={brand} kiosk={kiosk} cfg={cfg} />,
    );
  }

  // List layout: paginate ~80 rows in interactive mode; show all in kiosk.
  const total = board.entries.length;
  const pageCount = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const entries =
    kiosk || total <= LIST_PAGE_SIZE
      ? board.entries
      : board.entries.slice(safePage * LIST_PAGE_SIZE, (safePage + 1) * LIST_PAGE_SIZE);

  const list = (
    <ListBoard board={board} brand={brand} kiosk={kiosk} cfg={cfg} entries={entries} />
  );

  if (kiosk || pageCount <= 1) return wrap(list);

  return wrap(
    <>
      {list}
      <div className="hb-pager">
        <button onClick={() => setPage(safePage - 1)} disabled={safePage === 0}>
          ‹ Prev
        </button>
        <span>
          Page {safePage + 1} of {pageCount}
        </span>
        <button
          onClick={() => setPage(safePage + 1)}
          disabled={safePage >= pageCount - 1}
        >
          Next ›
        </button>
      </div>
    </>,
  );
}
