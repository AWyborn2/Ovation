import { useEffect, useState } from "react";
import type { DisplayBoard, HonourBrand } from "./types";
import { LIST_PAGE_SIZE } from "./types";
import {
  PremiershipBoard,
  TeamOfDecadeBoard,
  ListBoard,
  ColumnsBoard,
} from "./templates";

interface BoardRendererProps {
  board: DisplayBoard;
  brand: HonourBrand;
  /** Kiosk mode: disable links/pagination and show every row (scrolled). */
  kiosk?: boolean;
}

/**
 * Each board renders in its NATURAL layout (premiership / team-of-decade /
 * list). The chosen skin is applied once at the `.hb` root, so this only has to
 * dispatch on `board.layout` (plus paginate long list boards interactively).
 */
export function BoardRenderer({ board, brand, kiosk }: BoardRendererProps) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [board.id]);

  if (board.layout === "premiership") {
    return <PremiershipBoard board={board} brand={brand} kiosk={kiosk} />;
  }
  if (board.layout === "teamOfDecade") {
    return <TeamOfDecadeBoard board={board} brand={brand} kiosk={kiosk} />;
  }
  if (board.layout === "columns") {
    return <ColumnsBoard board={board} brand={brand} kiosk={kiosk} />;
  }

  // List layout: paginate ~80 rows in interactive mode; show all in kiosk.
  const total = board.entries.length;
  const pageCount = Math.max(1, Math.ceil(total / LIST_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const entries =
    kiosk || total <= LIST_PAGE_SIZE
      ? board.entries
      : board.entries.slice(safePage * LIST_PAGE_SIZE, (safePage + 1) * LIST_PAGE_SIZE);

  const list = <ListBoard board={board} brand={brand} kiosk={kiosk} entries={entries} />;

  if (kiosk || pageCount <= 1) return list;

  return (
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
    </>
  );
}
