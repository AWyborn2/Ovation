/**
 * The page strip (carousel set editor plan, part 2): every page or slide of
 * a design along the bottom of the editor, as in Canva's multi-page view.
 * Click one to edit it; with page actions (a set), add, duplicate, delete
 * and drag to reorder. A repeating page shows as a small stack: it is drawn
 * once per team, fixture, result or day, and editing it edits them all.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Copy, GripVertical, Plus, Repeat2, Trash2 } from "lucide-react";
import {
  DockPopover as Popover,
  DockPopoverContent as PopoverContent,
  DockPopoverTrigger as PopoverTrigger,
} from "./dock";
import { cn } from "@/lib/utils";
import { useNewStudio } from "@/lib/entitlements";
import { PageOverview } from "./page-grid";

export type StripItem = {
  id: string;
  label: string;
  /** A repeating page: drawn per item. */
  repeat?: boolean;
  /** A note under the label (" · empty", "3 teams"). */
  note?: string;
  /** Flags the item (a page with nothing on this size). */
  warn?: boolean;
  /** False: Duplicate isn't offered for this item (a set draft's data slide). */
  canDuplicate?: boolean;
  /** Why Duplicate isn't offered (the Scroll view's tooltip on its disabled button). */
  noDuplicateReason?: string;
};

export type StripAddOption = { id: string; label: string; detail?: string };

const tileBtn =
  "grid h-6 w-6 place-items-center rounded-md bg-[var(--ed-panel)]/90 text-[var(--ed-ink)] hover:bg-[var(--ed-card)]";

export function PageStrip({
  items,
  current,
  onSelect,
  thumb,
  thumbWidth = 92,
  aspect,
  onMove,
  onDuplicate,
  onDelete,
  addOptions,
  onAdd,
  label = "Pages",
  overview: withOverview = true,
  onAddOpen,
  centred = false,
}: {
  items: StripItem[];
  current: string;
  onSelect: (id: string) => void;
  /** The item drawn small. */
  thumb: (item: StripItem, width: number) => ReactNode;
  thumbWidth?: number;
  /** `w / h` of the design's size. */
  aspect: number;
  onMove?: (id: string, to: number) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  addOptions?: StripAddOption[];
  onAdd?: (option: string) => void;
  label?: string;
  /** False: the host shows the "N / M" counter and grid itself (the editor's bottom bar). */
  overview?: boolean;
  /**
   * The host shows the add options itself (the New Studio editors, in the
   * panel beside the rail): the + button calls this instead of opening a menu.
   */
  onAddOpen?: () => void;
  /**
   * Centred under the canvas (the New Studio editors): the strip sits in the
   * middle and scrolls sideways when it overflows, keeping the page being
   * edited in view.
   */
  centred?: boolean;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  // A tile's controls show on the page being edited, or on the tile under the
  // pointer (or holding focus).
  const [hovered, setHovered] = useState<string | null>(null);
  const tiles = useRef(new Map<string, HTMLElement>());
  // The page being edited stays in view as it changes (a long set scrolls).
  useEffect(() => {
    tiles.current.get(current)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [current]);
  const h = Math.round(thumbWidth / aspect);
  const canDelete = !!onDelete && items.length > 1;
  // New Studio (preview): an "N / M" counter and a grid of every page.
  const overview = useNewStudio() && withOverview;

  const drop = (to: number) => {
    if (dragging && onMove) {
      const from = items.findIndex((i) => i.id === dragging);
      onMove(dragging, from < to ? to - 1 : to);
    }
    setDragging(null);
    setOver(null);
  };

  return (
    <nav
      aria-label={label}
      data-testid="page-strip"
      className={cn(
        "flex shrink-0 items-end gap-3 overflow-x-auto border-t border-[var(--ed-line)] bg-[var(--ed-panel)] px-4 py-2",
        // `safe`: an overflowing strip starts at its first page, not cut off on the left.
        centred && "[justify-content:safe_center]",
      )}
      onDragOver={(e) => onMove && e.preventDefault()}
      onDrop={() => drop(items.length)}
    >
      <ol className="flex items-end gap-3" aria-label={label}>
        {items.map((item, i) => {
          const on = item.id === current;
          const dup = !!onDuplicate && item.canDuplicate !== false;
          return (
            <li
              key={item.id}
              ref={(el) => {
                if (el) tiles.current.set(item.id, el);
                else tiles.current.delete(item.id);
              }}
              className="flex flex-col items-center gap-1"
              style={centred ? { width: Math.max(thumbWidth + 12, 96) } : undefined}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered((h) => (h === item.id ? null : h))}
              onFocus={() => setHovered(item.id)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setHovered((h) => (h === item.id ? null : h));
              }}
              draggable={!!onMove}
              onDragStart={(e) => {
                setDragging(item.id);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", item.id);
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(e) => {
                if (!onMove || !dragging) return;
                e.preventDefault();
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                setOver(e.clientX < r.left + r.width / 2 ? i : i + 1);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                drop(over ?? i);
              }}
            >
              <div className="relative flex items-center">
                {over === i && dragging && (
                  <span
                    aria-hidden
                    className="absolute -left-2 top-0 h-full w-1 rounded bg-[var(--ed-accent)]"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={on ? "page" : undefined}
                  aria-label={`${i + 1}. ${item.label}${item.repeat ? ", repeats for each item" : ""}`}
                  className={cn(
                    "group relative rounded-lg p-0.5 outline-none ring-offset-2 ring-offset-[var(--ed-panel)] focus-visible:ring-2 focus-visible:ring-[var(--ed-accent)]",
                    on
                      ? "ring-2 ring-[var(--ed-accent)]"
                      : "hover:ring-1 hover:ring-[var(--ed-line)]",
                    dragging === item.id && "opacity-40",
                  )}
                  style={{ width: thumbWidth + 4 + (item.repeat ? 8 : 0) }}
                >
                  {item.repeat && (
                    <>
                      <span
                        aria-hidden
                        className="absolute rounded-md border border-[var(--ed-line)] bg-[var(--ed-card)]"
                        style={{ left: 10, top: 2, width: thumbWidth, height: h }}
                      />
                      <span
                        aria-hidden
                        className="absolute rounded-md border border-[var(--ed-line)] bg-[var(--ed-card)]"
                        style={{ left: 6, top: 4, width: thumbWidth, height: h }}
                      />
                    </>
                  )}
                  <span
                    className="relative block overflow-hidden rounded-md bg-[var(--ed-card)]"
                    style={{ width: thumbWidth, height: h, marginTop: item.repeat ? 6 : 0 }}
                  >
                    {thumb(item, thumbWidth)}
                  </span>
                  {item.repeat && (
                    <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">
                      <Repeat2 className="h-3 w-3" aria-hidden /> each
                    </span>
                  )}
                </button>
                {(on || hovered === item.id) && (dup || canDelete || onMove) && (
                  <span className="absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 gap-0.5">
                    {onMove && (
                      <>
                        <span className={cn(tileBtn, "cursor-grab")} title="Drag to reorder">
                          <GripVertical className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        {/* Moving without a drag, by keyboard or a tap. */}
                        {i > 0 && (
                          <button
                            type="button"
                            className={tileBtn}
                            aria-label={`Move ${item.label} earlier`}
                            title="Move earlier"
                            onClick={() => onMove(item.id, i - 1)}
                          >
                            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        )}
                        {i < items.length - 1 && (
                          <button
                            type="button"
                            className={tileBtn}
                            aria-label={`Move ${item.label} later`}
                            title="Move later"
                            onClick={() => onMove(item.id, i + 1)}
                          >
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        )}
                      </>
                    )}
                    {dup && (
                      <button
                        type="button"
                        className={tileBtn}
                        aria-label={`Duplicate ${item.label}`}
                        title="Duplicate"
                        onClick={() => onDuplicate!(item.id)}
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        className={tileBtn}
                        aria-label={`Delete ${item.label}`}
                        title="Delete"
                        onClick={() => onDelete!(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    )}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "max-w-full truncate text-center text-[11px] font-semibold",
                  on ? "text-[var(--ed-ink)]" : "text-[var(--ed-ink2)]",
                  item.warn && "text-amber-300",
                )}
              >
                {i + 1}. {item.label}
                {item.note ? <span className="font-normal">{item.note}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {onAdd && addOptions && addOptions.length > 0 && onAddOpen && (
        <button
          type="button"
          aria-label="Add a page"
          onClick={onAddOpen}
          className="mb-5 grid shrink-0 place-items-center rounded-lg border border-dashed border-[var(--ed-line)] text-[var(--ed-ink2)] hover:bg-[var(--ed-card)]"
          style={{ width: thumbWidth * 0.6, height: h }}
        >
          <Plus className="h-5 w-5" aria-hidden />
        </button>
      )}
      {onAdd && addOptions && addOptions.length > 0 && !onAddOpen && (
        <Popover open={adding} onOpenChange={setAdding}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Add a page"
              className="mb-5 grid shrink-0 place-items-center rounded-lg border border-dashed border-[var(--ed-line)] text-[var(--ed-ink2)] hover:bg-[var(--ed-card)]"
              style={{ width: thumbWidth * 0.6, height: h }}
            >
              <Plus className="h-5 w-5" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            className="studio-editor w-64 border-[var(--ed-line)] bg-[var(--ed-panel)] p-1 text-[var(--ed-ink)]"
          >
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--ed-ink2)]">
              Add a page
            </p>
            {addOptions.map((o) => (
              <button
                key={o.id}
                type="button"
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--ed-card)]"
                onClick={() => {
                  setAdding(false);
                  onAdd(o.id);
                }}
              >
                <span className="font-semibold">{o.label}</span>
                {o.detail && (
                  <span className="block text-xs text-[var(--ed-ink2)]">{o.detail}</span>
                )}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}
      {overview && items.length > 1 && (
        <PageOverview
          items={items}
          current={current}
          onSelect={onSelect}
          thumb={thumb}
          aspect={aspect}
          onMove={onMove}
          onDelete={onDelete}
          label={label}
        />
      )}
    </nav>
  );
}
