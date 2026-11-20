import type { ReactNode } from "react";
import { Link } from "wouter";
import {
  ArrowLeft,
  ChevronsLeft,
  Layers,
  Loader2,
  Maximize2,
  Minus,
  PanelBottom,
  Plus,
  Redo2,
  Rows3,
  Save,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CardSize } from "@/lib/share-card";
import { cn } from "@/lib/utils";

type FormatOption = { value: CardSize; label: string; dims: string };

/**
 * The Format menu's sizes for a new design (portrait and story sizes plan,
 * Stage 3): Portrait first, the default, then Story.
 */
export const FORMATS: FormatOption[] = [
  { value: "portrait", label: "Portrait", dims: "1080 × 1350" },
  { value: "story", label: "Story", dims: "1080 × 1920" },
];

/**
 * The older sizes, retired for new designs. The Format menu lists one only
 * for a design that has layers on it (or is open at it), as "(older size)".
 */
export const OLDER_FORMATS: FormatOption[] = [
  { value: "square", label: "Square", dims: "1080 × 1080" },
  { value: "landscape", label: "Landscape", dims: "1200 × 630" },
];

/**
 * The Format menu: Portrait and Story, then the older sizes given (and the one
 * on show). Given `only` (a draft's design, round 9 B13), exactly those sizes
 * and the one on show, so a size the design doesn't draw is never offered.
 */
export function formatOptions(
  olderFormats: readonly CardSize[],
  current?: CardSize,
  only?: readonly CardSize[],
): (FormatOption & { older: boolean })[] {
  if (only) {
    const offered = new Set<CardSize>(only);
    if (current) offered.add(current);
    return [
      ...FORMATS.filter((f) => offered.has(f.value)).map((f) => ({ ...f, older: false })),
      ...OLDER_FORMATS.filter((f) => offered.has(f.value)).map((f) => ({ ...f, older: true })),
    ];
  }
  const older = new Set<CardSize>(olderFormats);
  if (current) older.add(current);
  return [
    ...FORMATS.map((f) => ({ ...f, older: false })),
    ...OLDER_FORMATS.filter((f) => older.has(f.value)).map((f) => ({ ...f, older: true })),
  ];
}

const iconBtn =
  "grid h-8 w-8 place-items-center rounded-lg text-[var(--ed-ink2)] transition-colors hover:bg-[var(--ed-card)] hover:text-[var(--ed-ink)] disabled:pointer-events-none disabled:opacity-35";

/** Top bar: back, resize, undo/redo, save state, title + status, and the primary action. */
export function EditorTopBar({
  title,
  status,
  format,
  onFormat,
  olderFormats = [],
  formats,
  inheritedFormats,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  dirty,
  saving,
  onSave,
  actions,
  backHref = "/admin/social/queue",
  formatLabel,
}: {
  title: string;
  status: ReactNode;
  format: CardSize;
  onFormat: (f: CardSize) => void;
  /**
   * The older sizes (Square, Landscape) the design has layers on: listed after
   * Portrait and Story as "(older size)". A new design has none.
   */
  olderFormats?: readonly CardSize[];
  /**
   * Exactly the sizes to offer (a draft's design: only the sizes it draws,
   * round 9 B13). When given, `olderFormats` is ignored.
   */
  formats?: readonly CardSize[];
  /** Formats still using another format's layout (flagged for review). */
  inheritedFormats: CardSize[];
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  /** Extra buttons before Save (e.g. Save as template). */
  actions?: ReactNode;
  /** Where the back link goes (the queue for a draft, the Studio for a template). */
  backHref?: string;
  /** A note shown after a format's name (default: " · review" for inherited formats). */
  formatLabel?: (f: CardSize) => string;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[var(--ed-line)] bg-[var(--ed-panel)] px-3">
      <Link
        href={backHref}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-[var(--ed-card)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Studio
      </Link>
      <span className="mx-1 h-6 w-px bg-[var(--ed-line)]" aria-hidden />
      <label className="flex items-center gap-1.5 text-sm">
        <Maximize2 className="h-4 w-4 text-[var(--ed-ink2)]" aria-hidden />
        <span className="sr-only">Format</span>
        <select
          aria-label="Format"
          value={format}
          onChange={(e) => onFormat(e.target.value as CardSize)}
          className="h-8 rounded-lg border border-[var(--ed-line)] bg-[var(--ed-card)] px-2 text-sm font-semibold"
        >
          {formatOptions(olderFormats, format, formats).map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
              {f.older ? " (older size)" : ""}
              {formatLabel
                ? formatLabel(f.value)
                : inheritedFormats.includes(f.value)
                  ? " · review"
                  : ""}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={iconBtn}
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Undo"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={iconBtn}
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Redo"
      >
        <Redo2 className="h-4 w-4" />
      </button>
      <span className="hidden text-xs text-[var(--ed-ink2)] xl:inline">
        {saving ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
      </span>

      <div className="mx-auto flex min-w-[150px] items-center gap-2 overflow-hidden px-2">
        <span className="max-w-[300px] truncate font-serif text-lg font-bold uppercase">
          {title}
        </span>
        {status}
      </div>

      {actions}
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !dirty}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[var(--ed-accent)] px-4 text-sm font-bold text-[var(--ed-on-accent)] transition-opacity disabled:opacity-60"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Save className="h-4 w-4" aria-hidden />
        )}
        Save
      </button>
    </header>
  );
}

export type RailItem = { id: string; label: string; icon: LucideIcon };

/** Left rail (76px); clicking the active item collapses the panel. */
export function EditorRail({
  items,
  active,
  onSelect,
}: {
  items: RailItem[];
  active: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <nav
      aria-label="Editor tools"
      className="flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-[var(--ed-line)] bg-[var(--ed-panel)] py-2"
    >
      {items.map((it) => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(on ? null : it.id)}
            className={cn(
              "flex w-[64px] flex-col items-center gap-1 rounded-lg py-2 text-[11px] transition-colors",
              on
                ? "bg-[var(--ed-card)] text-[var(--ed-ink)]"
                : "text-[var(--ed-ink2)] hover:text-[var(--ed-ink)]",
            )}
          >
            <it.icon
              className={cn("h-[22px] w-[22px]", on && "text-[var(--ed-accent)]")}
              aria-hidden
            />
            {it.label}
          </button>
        );
      })}
    </nav>
  );
}

/** The side panel's width: the canvas takes what is left. */
export const PANEL_WIDTH = 340;

/**
 * The side panel beside the rail (340px): the one slot every tool opens in,
 * the last one opened replacing the one before. `closeIcon` "x" (the New
 * Studio editors) closes it with an X; the older editor collapses it.
 */
export function EditorPanel({
  title,
  onCollapse,
  children,
  closeIcon = "collapse",
  id,
}: {
  title: string;
  onCollapse: () => void;
  children: ReactNode;
  closeIcon?: "collapse" | "x";
  /** Which tool is open, for tests and styling (`data-panel`). */
  id?: string;
}) {
  return (
    <aside
      aria-label={title}
      data-panel={id}
      data-testid="editor-panel"
      className="flex shrink-0 flex-col border-r border-[var(--ed-line)] bg-[var(--ed-panel)]"
      style={{ width: PANEL_WIDTH }}
    >
      <div className="flex items-center justify-between px-3.5 pb-2 pt-3.5">
        <h2 className="font-serif text-[22px] font-extrabold uppercase leading-none">{title}</h2>
        {closeIcon === "x" ? (
          <button type="button" className={iconBtn} onClick={onCollapse} aria-label="Close panel">
            <X className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            className={iconBtn}
            onClick={onCollapse}
            aria-label="Collapse panel"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-4">{children}</div>
    </aside>
  );
}

/** How a design's pages show: the canvas and a strip of thumbnails, or every page stacked. */
export type PagesView = "thumbnails" | "scroll";

const PAGES_VIEW_KEY = "ovation.studio.pagesView";

/** The Pages view this browser last picked (Thumbnails until one is). */
export function readPagesView(): PagesView {
  try {
    return window.localStorage.getItem(PAGES_VIEW_KEY) === "scroll" ? "scroll" : "thumbnails";
  } catch {
    return "thumbnails";
  }
}

/** Remember the Pages view for next time; a blocked storage just doesn't remember. */
export function writePagesView(view: PagesView): void {
  try {
    window.localStorage.setItem(PAGES_VIEW_KEY, view);
  } catch {
    // Private mode or blocked storage: the choice lasts this visit only.
  }
}

/**
 * Bottom bar: the Pages view and page count (a design with more than one
 * page), the layers drawer toggle (the older editor) and zoom (50–160%).
 */
export function EditorBottomBar({
  zoom,
  onZoom,
  layersOpen = false,
  onToggleLayers,
  pagesView,
  onPagesView,
  pageCount,
}: {
  zoom: number;
  onZoom: (z: number) => void;
  layersOpen?: boolean;
  /** The older editor's Layers drawer; the New Studio editors list layers in Position. */
  onToggleLayers?: () => void;
  /** Given with `onPagesView`, the Pages toggle shows. */
  pagesView?: PagesView;
  onPagesView?: (view: PagesView) => void;
  /** "9 / 10" and the grid of every page, beside the toggle. */
  pageCount?: ReactNode;
}) {
  const set = (z: number) => onZoom(Math.min(160, Math.max(50, Math.round(z))));
  const view = (v: PagesView, label: string, Icon: LucideIcon) => (
    <button
      type="button"
      aria-pressed={pagesView === v}
      onClick={() => onPagesView?.(v)}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-semibold",
        pagesView === v
          ? "bg-[var(--ed-card)] text-[var(--ed-ink)]"
          : "text-[var(--ed-ink2)] hover:text-[var(--ed-ink)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
    </button>
  );
  return (
    <footer className="flex h-14 shrink-0 items-center justify-end gap-3 border-t border-[var(--ed-line)] bg-[var(--ed-panel)] px-4">
      {pageCount}
      {pagesView && onPagesView && (
        <div
          role="group"
          aria-label="Pages"
          className="flex items-center gap-0.5 rounded-lg border border-[var(--ed-line)] p-0.5"
        >
          {view("thumbnails", "Thumbnails", PanelBottom)}
          {view("scroll", "Scroll", Rows3)}
        </div>
      )}
      {onToggleLayers && (
        <button
          type="button"
          onClick={onToggleLayers}
          aria-pressed={layersOpen}
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-lg border border-[var(--ed-line)] px-3 text-sm font-semibold",
            layersOpen && "bg-[var(--ed-card)]",
          )}
        >
          <Layers className="h-4 w-4" aria-hidden /> Layers
        </button>
      )}
      <div className="flex items-center gap-2 rounded-lg border border-[var(--ed-line)] px-2 py-1">
        <button
          type="button"
          className={iconBtn}
          onClick={() => set(zoom - 10)}
          aria-label="Zoom out"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="range"
          aria-label="Zoom"
          min={50}
          max={160}
          value={zoom}
          onChange={(e) => set(Number(e.target.value))}
          className="w-28 accent-[var(--ed-accent)]"
        />
        <button
          type="button"
          className={iconBtn}
          onClick={() => set(zoom + 10)}
          aria-label="Zoom in"
        >
          <Plus className="h-4 w-4" />
        </button>
        <span className="w-11 text-right text-sm tabular-nums">{zoom}%</span>
      </div>
    </footer>
  );
}
