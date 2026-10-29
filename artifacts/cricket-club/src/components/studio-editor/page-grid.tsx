/**
 * The page strip's overview (studio-create-consolidation S5, New Studio only): an
 * "N / M" counter and a grid of every page or slide at once, as in Canva. The grid
 * uses the strip's own select, reorder and delete, so a change there is the same
 * change as in the strip.
 */
import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, LayoutGrid, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { StripItem } from "./page-strip";

const GRID_THUMB = 180;

const tileBtn =
  "grid h-7 w-7 place-items-center rounded-md bg-[var(--ed-panel)]/90 text-[var(--ed-ink)] hover:bg-[var(--ed-card)]";

export function PageOverview({
  items,
  current,
  onSelect,
  thumb,
  aspect,
  onMove,
  onDelete,
  label,
}: {
  items: StripItem[];
  current: string;
  onSelect: (id: string) => void;
  thumb: (item: StripItem, width: number) => ReactNode;
  aspect: number;
  onMove?: (id: string, to: number) => void;
  onDelete?: (id: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const at = items.findIndex((i) => i.id === current);
  const h = Math.round(GRID_THUMB / aspect);
  const canDelete = !!onDelete && items.length > 1;

  return (
    <div className="mb-5 flex shrink-0 items-center gap-2 pl-2">
      <span className="text-xs font-semibold tabular-nums text-[var(--ed-ink2)]" aria-live="polite">
        {at >= 0 ? at + 1 : 0} / {items.length}
      </span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`See all ${label.toLowerCase()}`}
        title="Grid view"
        className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--ed-line)] text-[var(--ed-ink2)] hover:bg-[var(--ed-card)] hover:text-[var(--ed-ink)]"
      >
        <LayoutGrid className="h-4 w-4" aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="studio-editor max-h-[90dvh] max-w-5xl overflow-y-auto border-[var(--ed-line)] bg-[var(--ed-panel)] text-[var(--ed-ink)]">
          <DialogHeader>
            <DialogTitle>
              {label} · {items.length}
            </DialogTitle>
            <DialogDescription className="text-[var(--ed-ink2)]">
              Pick one to edit it. Move or delete slides here, the same as in the strip.
            </DialogDescription>
          </DialogHeader>
          <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-label={label}>
            {items.map((item, i) => (
              <li key={item.id} className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  aria-current={item.id === current ? "page" : undefined}
                  aria-label={`${i + 1}. ${item.label}`}
                  onClick={() => {
                    onSelect(item.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "overflow-hidden rounded-md bg-[var(--ed-card)]",
                    item.id === current
                      ? "ring-2 ring-[var(--ed-accent)]"
                      : "hover:ring-1 hover:ring-[var(--ed-line)]",
                  )}
                  style={{ width: GRID_THUMB, height: h }}
                >
                  {thumb(item, GRID_THUMB)}
                </button>
                <span className="max-w-[180px] truncate text-xs font-semibold">
                  {i + 1}. {item.label}
                </span>
                {(onMove || canDelete) && (
                  <span className="flex gap-1">
                    {onMove && i > 0 && (
                      <button
                        type="button"
                        className={tileBtn}
                        aria-label={`Move ${item.label} earlier`}
                        onClick={() => onMove(item.id, i - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                    {onMove && i < items.length - 1 && (
                      <button
                        type="button"
                        className={tileBtn}
                        aria-label={`Move ${item.label} later`}
                        onClick={() => onMove(item.id, i + 1)}
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className={tileBtn}
                        aria-label={`Delete ${item.label}`}
                        onClick={() => onDelete!(item.id)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </div>
  );
}
