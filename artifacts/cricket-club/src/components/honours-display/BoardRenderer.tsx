import { useEffect, useState } from "react";
import type { DisplayBoard, HonourBrand, TemplateId } from "./types";
import { LEDGER_PAGE_SIZE } from "./types";
import {
  P1Heritage,
  P2ClubColours,
  P3Glass,
  P4Modern,
  P5Broadcast,
  P6Interactive,
  P7AppStyle,
} from "./templates";

interface BoardRendererProps {
  board: DisplayBoard;
  template: TemplateId;
  brand: HonourBrand;
  /** Kiosk mode: disable links/pagination and show every row (scrolled). */
  kiosk?: boolean;
}

const LEDGER = new Set<TemplateId>(["p1", "p2", "p3"]);

export function BoardRenderer({ board, template, brand, kiosk }: BoardRendererProps) {
  const [page, setPage] = useState(0);

  // Reset pagination whenever the board or skin changes.
  useEffect(() => {
    setPage(0);
  }, [board.id, template]);

  // On narrow screens the heavy ledger/broadcast skins fall back to P4.
  const [narrow, setNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 720 : false,
  );
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 720);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const effective: TemplateId = narrow && !kiosk && template !== "p4" ? "p4" : template;

  if (effective === "p4") return <P4Modern board={board} brand={brand} kiosk={kiosk} />;
  if (effective === "p5") return <P5Broadcast board={board} brand={brand} kiosk={kiosk} />;
  if (effective === "p6") return <P6Interactive board={board} brand={brand} kiosk={kiosk} />;
  if (effective === "p7") return <P7AppStyle board={board} brand={brand} kiosk={kiosk} />;

  // Ledger skins (P1–P3): paginate ~80 rows in interactive mode; show all in kiosk.
  const total = board.entries.length;
  const pageCount = Math.max(1, Math.ceil(total / LEDGER_PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const entries =
    kiosk || total <= LEDGER_PAGE_SIZE
      ? board.entries
      : board.entries.slice(
          safePage * LEDGER_PAGE_SIZE,
          (safePage + 1) * LEDGER_PAGE_SIZE,
        );

  const ledger =
    effective === "p1" ? (
      <P1Heritage board={board} brand={brand} entries={entries} kiosk={kiosk} />
    ) : effective === "p2" ? (
      <P2ClubColours board={board} brand={brand} entries={entries} kiosk={kiosk} />
    ) : (
      <P3Glass board={board} brand={brand} entries={entries} kiosk={kiosk} />
    );

  if (kiosk || pageCount <= 1) return ledger;

  return (
    <>
      {ledger}
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
