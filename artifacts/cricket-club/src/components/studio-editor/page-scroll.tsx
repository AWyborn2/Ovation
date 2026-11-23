/**
 * The Scroll view of a design's pages (New Studio, Nov 2026): every page or
 * slide stacked down the canvas area, so the admin scrolls from one to the
 * next instead of using the thumbnail strip. Each has a header row ("Page 3 –
 * A Grade") with the strip's own actions under the strip's own rules: move
 * up or down, duplicate where the strip offers it (a game slide shows it
 * disabled, with why), and delete (never the last
 * page). Clicking a page makes it the one being edited; only that page is the
 * live canvas, the others draw as they post.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Copy, Plus, Repeat2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StripAddOption, StripItem } from "./page-strip";

const headBtn =
  "grid h-8 w-8 place-items-center rounded-md text-[var(--ed-ink2)] hover:bg-[var(--ed-card)] hover:text-[var(--ed-ink)] disabled:pointer-events-none disabled:opacity-35";

export function PageScroll({
  items,
  current,
  onSelect,
  page,
  onMove,
  onDuplicate,
  onDelete,
  addOptions,
  onAdd,
  label = "Pages",
}: {
  items: StripItem[];
  current: string;
  onSelect: (id: string) => void;
  /** The page itself: the live canvas for the current one, a drawing for the rest. */
  page: (item: StripItem, current: boolean) => ReactNode;
  onMove?: (id: string, to: number) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  addOptions?: StripAddOption[];
  onAdd?: (option: string) => void;
  label?: string;
}) {
  const canDelete = !!onDelete && items.length > 1;
  const [adding, setAdding] = useState(false);
  const refs = useRef(new Map<string, HTMLElement>());
  // A page picked from elsewhere (a blank slide named on save) scrolls into view.
  useEffect(() => {
    refs.current.get(current)?.scrollIntoView?.({ block: "nearest" });
  }, [current]);
  return (
    // The grey between pages is the canvas area's own (`data-canvas-empty`): a click there deselects.
    <section
      aria-label={label}
      data-canvas-empty
      className="flex w-full flex-col items-center gap-8 pb-6"
    >
      <ol className="flex w-full flex-col items-center gap-8" aria-label={label} data-canvas-empty>
        {items.map((item, i) => {
          const on = item.id === current;
          const dup = !!onDuplicate && item.canDuplicate !== false;
          return (
            <li
              key={item.id}
              ref={(el) => {
                if (el) refs.current.set(item.id, el);
                else refs.current.delete(item.id);
              }}
              aria-current={on ? "page" : undefined}
              data-canvas-empty
              className="flex max-w-full flex-col items-center gap-2"
              data-testid={`scroll-page-${i + 1}`}
            >
              <div className="flex w-full items-center gap-1 text-sm">
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-label={`Edit page ${i + 1}, ${item.label}`}
                  className={cn(
                    "mr-auto flex min-w-0 items-center gap-1.5 truncate rounded px-1 font-semibold",
                    on
                      ? "text-[var(--ed-ink)]"
                      : "text-[var(--ed-ink2)] hover:text-[var(--ed-ink)]",
                    item.warn && "text-amber-300",
                  )}
                >
                  <span className="truncate">
                    Page {i + 1} – {item.label}
                    {item.note ? <span className="font-normal">{item.note}</span> : null}
                  </span>
                  {item.repeat && (
                    <span className="flex shrink-0 items-center gap-0.5 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">
                      <Repeat2 className="h-3 w-3" aria-hidden /> each
                    </span>
                  )}
                </button>
                {onMove && (
                  <>
                    <button
                      type="button"
                      className={headBtn}
                      disabled={i === 0}
                      aria-label={`Move ${item.label} up`}
                      title="Move up"
                      onClick={() => onMove(item.id, i - 1)}
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className={headBtn}
                      disabled={i === items.length - 1}
                      aria-label={`Move ${item.label} down`}
                      title="Move down"
                      onClick={() => onMove(item.id, i + 1)}
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    </button>
                  </>
                )}
                {dup && (
                  <button
                    type="button"
                    className={headBtn}
                    aria-label={`Duplicate ${item.label}`}
                    title="Duplicate"
                    onClick={() => onDuplicate!(item.id)}
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                  </button>
                )}
                {/* Where the strip offers Duplicate but not for this page (a game
                  slide), the button stays, disabled with the reason, so it
                  never looks missing. aria-disabled keeps its tooltip working. */}
                {!!onDuplicate && !dup && (
                  <button
                    type="button"
                    className={cn(headBtn, "cursor-not-allowed opacity-35 hover:bg-transparent")}
                    aria-label={`Duplicate ${item.label}`}
                    aria-disabled="true"
                    title={item.noDuplicateReason ?? "This page can't be duplicated"}
                    data-testid={`scroll-no-duplicate-${i + 1}`}
                    onClick={(e) => e.preventDefault()}
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className={headBtn}
                    aria-label={`Delete ${item.label}`}
                    title="Delete"
                    onClick={() => onDelete!(item.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
              {on ? (
                <div className="rounded-sm ring-2 ring-[var(--ed-accent)] ring-offset-4 ring-offset-[var(--ed-canvas)]">
                  {page(item, true)}
                </div>
              ) : (
                // Another page: a click makes it the one being edited.
                <button
                  type="button"
                  aria-label={`Show page ${i + 1}, ${item.label}`}
                  onClick={() => onSelect(item.id)}
                  className="block rounded-sm opacity-90 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--ed-accent)]"
                >
                  {page(item, false)}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {onAdd && addOptions && addOptions.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            aria-expanded={adding}
            onClick={() => setAdding((a) => !a)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-[var(--ed-line)] px-4 text-sm font-semibold text-[var(--ed-ink2)] hover:bg-[var(--ed-card)]"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add a page
          </button>
          {adding && (
            <div role="group" aria-label="Add a page" className="w-72 space-y-1">
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
            </div>
          )}
        </div>
      )}
    </section>
  );
}
