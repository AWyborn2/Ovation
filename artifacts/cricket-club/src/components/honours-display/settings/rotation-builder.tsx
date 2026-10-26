import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { HonoursDisplayForm } from "../use-honours-display-settings";
import {
  BOARD_LAYOUT_LABEL,
  ROTATION_KIND_LABEL,
  dropIndex,
  rotationItemKind,
  type RotationItemKind,
} from "./rotation-list";

const KIND_CHIP: Readonly<Record<RotationItemKind, string>> = {
  board: "bg-primary/10 text-primary-text",
  sponsor: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ad: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  photos: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

/**
 * The kiosk rotation as an ordered list (honours kiosk redesign B2): drag a
 * row, press Alt+↑/↓ on a focused row, or use the arrow buttons to reorder;
 * duplicate or remove a row; add boards, the sponsor wall, an ad or a photo
 * slideshow. Saves to
 * `kiosk_sequence` through the page's save bar.
 */
export function RotationBuilder({
  form,
  selected,
  onSelect,
}: {
  form: HonoursDisplayForm;
  /** The selected item's token; every row holding it is highlighted. */
  selected: string | null;
  onSelect: (token: string) => void;
}) {
  const {
    sequence,
    seqLabel,
    moveSeqTo,
    duplicateSeq,
    removeSeq,
    addToSeq,
    startSeqFromAllBoards,
    boards,
    boardById,
    kioskAds,
    slideshows,
    addSlideshow,
    slideshowPhotoCount,
  } = form;
  const listRef = useRef<HTMLUListElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<{ over: number; after: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const focusRow = (idx: number) =>
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-row="${idx}"]`)?.focus(),
    );
  const move = (from: number, to: number) => {
    if (to < 0 || to >= sequence.length || to === from) return;
    moveSeqTo(from, to);
    setAnnouncement(
      `${seqLabel(sequence[from]!)} moved to position ${to + 1} of ${sequence.length}`,
    );
    focusRow(to);
  };
  const endDrag = () => {
    setDragFrom(null);
    setDropAt(null);
  };

  const detail = (token: string): string | null => {
    const kind = rotationItemKind(token);
    if (kind === "sponsor") return "Every sponsor on one screen";
    if (kind === "ad") return "Full-screen advert";
    if (kind === "photos") {
      const n = slideshowPhotoCount.get(token);
      if (n == null) return "Save to load its photos";
      return n ? `${n} photo${n === 1 ? "" : "s"} to pick from` : "No photos match yet";
    }
    const board = boardById.get(token);
    return board ? BOARD_LAYOUT_LABEL[board.layout] : null;
  };
  const placed = new Set(sequence);

  return (
    <div>
      <h3 className="font-semibold mb-2 text-sm uppercase tracking-wide text-muted-foreground">
        Rotation
      </h3>
      <p className="text-xs text-muted-foreground mb-3">
        What the clubroom TV shows, in order. Drag a row, or focus its handle and press Alt+↑ /
        Alt+↓, to move it. Select a board to set how it plays. An item can appear more than once.
      </p>

      {sequence.length === 0 ? (
        <div
          className="rounded border border-dashed px-4 py-3 text-sm text-muted-foreground"
          data-testid="rotation-empty"
        >
          No rotation set, so the TV shows every board in the default order.{" "}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 align-baseline"
            onClick={startSeqFromAllBoards}
            data-testid="rotation-start-all"
          >
            Start from all boards
          </Button>
        </div>
      ) : (
        <ul
          ref={listRef}
          className="space-y-1"
          aria-label="Kiosk rotation"
          onDragOver={(e) => dragFrom !== null && e.preventDefault()}
        >
          {sequence.map((token, idx) => {
            const kind = rotationItemKind(token);
            const label = seqLabel(token);
            const sub = detail(token);
            const showLine = dropAt && dragFrom !== null && dropAt.over === idx;
            return (
              <li
                key={`${token}-${idx}`}
                data-testid={`seq-row-${idx}`}
                draggable
                className={cn(
                  "relative flex items-center gap-2 border rounded px-2 py-2 bg-card",
                  selected === token && "border-primary ring-1 ring-primary",
                  dragFrom === idx && "opacity-40",
                )}
                onDragStart={(e) => {
                  setDragFrom(idx);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(idx));
                }}
                onDragEnd={endDrag}
                onDragOver={(e) => {
                  if (dragFrom === null) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setDropAt({ over: idx, after: e.clientY > r.top + r.height / 2 });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFrom !== null && dropAt) {
                    move(dragFrom, dropIndex(dragFrom, dropAt.over, dropAt.after));
                  }
                  endDrag();
                }}
              >
                {showLine && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-0 h-0.5 rounded bg-primary",
                      dropAt.after ? "-bottom-1" : "-top-1",
                    )}
                  />
                )}
                {/* The keyboard handle: focus it and press Alt+↑/↓ to move the row. */}
                <button
                  type="button"
                  data-row={idx}
                  data-testid={`seq-handle-${idx}`}
                  aria-label={`${idx + 1}. ${ROTATION_KIND_LABEL[kind]}: ${label}`}
                  aria-describedby="rotation-keys-hint"
                  className="shrink-0 cursor-grab rounded text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onKeyDown={(e) => {
                    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                    e.preventDefault();
                    move(idx, e.key === "ArrowUp" ? idx - 1 : idx + 1);
                  }}
                >
                  <GripVertical aria-hidden className="h-4 w-4" />
                </button>
                <span className="text-xs font-mono text-muted-foreground w-5 text-right">
                  {idx + 1}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium",
                    KIND_CHIP[kind],
                  )}
                >
                  {ROTATION_KIND_LABEL[kind]}
                </span>
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-pressed={selected === token}
                  onClick={() => onSelect(token)}
                  data-testid={`seq-select-${idx}`}
                >
                  <span data-title className="block truncate text-sm font-medium">
                    {label}
                  </span>
                  {sub && (
                    <span className="block truncate text-xs text-muted-foreground">{sub}</span>
                  )}
                </button>
                <RowButton
                  label={`Move ${label} up`}
                  disabled={idx === 0}
                  onClick={() => move(idx, idx - 1)}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </RowButton>
                <RowButton
                  label={`Move ${label} down`}
                  disabled={idx === sequence.length - 1}
                  onClick={() => move(idx, idx + 1)}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </RowButton>
                <RowButton
                  label={`Duplicate ${label}`}
                  testId={`seq-dup-${idx}`}
                  onClick={() => {
                    duplicateSeq(idx);
                    setAnnouncement(`${label} duplicated at position ${idx + 2}`);
                    focusRow(idx + 1);
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </RowButton>
                <RowButton
                  label={`Remove ${label}`}
                  testId={`seq-remove-${idx}`}
                  onClick={() => {
                    removeSeq(idx);
                    setAnnouncement(`${label} removed`);
                    if (sequence.length > 1) focusRow(Math.min(idx, sequence.length - 2));
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </RowButton>
              </li>
            );
          })}
        </ul>
      )}
      <span id="rotation-keys-hint" className="sr-only">
        Press Alt and the up or down arrow to move this item.
      </span>
      <div aria-live="polite" className="sr-only" data-testid="rotation-announcer">
        {announcement}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          className="px-2 py-1.5 rounded border bg-card text-sm min-w-[14rem]"
          value=""
          aria-label="Add a board"
          onChange={(e) => {
            addToSeq(e.target.value);
            if (e.target.value) setAnnouncement(`${seqLabel(e.target.value)} added`);
          }}
          data-testid="add-to-seq"
        >
          <option value="">+ Board…</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
              {placed.has(b.id) ? " (again)" : ""}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            addToSeq("sponsor");
            setAnnouncement("Sponsor wall added");
          }}
          data-testid="add-sponsor-to-seq"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Sponsor wall
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const id = addSlideshow();
            setAnnouncement("Photo slideshow added");
            onSelect(id);
          }}
          data-testid="add-photos-to-seq"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Photo slideshow
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const id = addSlideshow("recent");
            setAnnouncement("Recent moments slideshow added");
            onSelect(id);
          }}
          data-testid="add-recent-moments-to-seq"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Recent moments
        </Button>
        {slideshows.length > 0 && (
          <select
            className="px-2 py-1.5 rounded border bg-card text-sm"
            value=""
            aria-label="Add a saved photo slideshow"
            onChange={(e) => {
              addToSeq(e.target.value);
              if (e.target.value) setAnnouncement(`${seqLabel(e.target.value)} added`);
            }}
            data-testid="add-slideshow-to-seq"
          >
            <option value="">+ Existing slideshow…</option>
            {slideshows.map((sh) => (
              <option key={sh.id} value={sh.id}>
                {sh.name || "Untitled slideshow"}
                {placed.has(sh.id) ? " (again)" : ""}
              </option>
            ))}
          </select>
        )}
        {kioskAds.length > 0 && (
          <select
            className="px-2 py-1.5 rounded border bg-card text-sm"
            value=""
            aria-label="Add an ad"
            onChange={(e) => {
              addToSeq(e.target.value);
              if (e.target.value) setAnnouncement(`${seqLabel(e.target.value)} added`);
            }}
            data-testid="add-ad-to-seq"
          >
            <option value="">+ Ad…</option>
            {kioskAds.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || "Untitled ad"}
              </option>
            ))}
          </select>
        )}
      </div>
      {kioskAds.length === 0 && (
        <p className="text-[11px] text-muted-foreground mt-2">
          Upload adverts on the Sponsors &amp; ads tab to place them here.
        </p>
      )}
    </div>
  );
}

function RowButton({
  label,
  testId,
  disabled,
  onClick,
  children,
}: {
  label: string;
  testId?: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      aria-label={label}
      title={label.split(" ")[0]}
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </Button>
  );
}
